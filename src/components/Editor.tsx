import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Doc } from '../lib/types'
import { splitFrontmatter } from '../lib/frontmatter'
import { readingTimeLabel, stripMarkdown, wordCount } from '../lib/markdown'
import { debounce, formatDateTime, pluralise } from '../lib/util'
import { useVault } from '../state/VaultContext'
import { useToast } from '../state/ToastContext'
import { MarkdownView } from './MarkdownView'
import { IconBookOpen, IconCheck, IconColumns, IconEye, IconFile, IconSave, IconText } from './Icons'

export interface EditorProps {
  doc: Doc
  onOpenReader: (docId: string) => void
}

type EditorMode = 'split' | 'write' | 'preview'

const TABLE_SNIPPET = `
| Column | Column |
| --- | --- |
| value | value |
`

const FRONTMATTER_SNIPPET = `---
title: "Title"
category: "Category"
difficulty: "Beginner"
status: "In progress"
source: ""
tags:
  - tag
---

`

/**
 * The editor autosaves, so there is no way to lose work by navigating away —
 * which also means no "unsaved changes" prompt to get wrong.
 */
export function Editor({ doc, onOpenReader }: EditorProps): React.JSX.Element {
  const { saveDocContent, settings } = useVault()
  const toast = useToast()

  const [value, setValue] = useState(doc.content)
  const [mode, setMode] = useState<EditorMode>('split')
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pendingSelection = useRef<{ start: number; end: number } | null>(null)
  const loadedFor = useRef(doc.id)
  const valueRef = useRef(value)
  valueRef.current = value

  // Switching documents reloads the buffer.
  if (loadedFor.current !== doc.id) {
    loadedFor.current = doc.id
    setValue(doc.content)
    setSavedAt(null)
  }

  const save = useCallback(
    async (content: string) => {
      await saveDocContent(doc.id, content)
      setSavedAt(Date.now())
    },
    [doc.id, saveDocContent],
  )

  const scheduleSave = useMemo(
    () =>
      debounce((content: string) => {
        void save(content)
      }, 900),
    [save],
  )

  useEffect(() => {
    if (value === doc.content) return
    scheduleSave(value)
  }, [value, doc.content, scheduleSave])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return
      event.preventDefault()
      scheduleSave.cancel()
      void save(valueRef.current)
      toast.notify('Saved', { tone: 'success', duration: 1400 })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      scheduleSave.flush()
    }
  }, [save, scheduleSave, toast])

  useLayoutEffect(() => {
    const selection = pendingSelection.current
    if (!selection) return
    pendingSelection.current = null
    const element = textareaRef.current
    if (!element) return
    element.focus()
    element.setSelectionRange(selection.start, selection.end)
  })

  const commit = (next: string, start: number, end: number) => {
    setValue(next)
    pendingSelection.current = { start, end }
  }

  const wrapSelection = (before: string, after: string, placeholder: string) => {
    const element = textareaRef.current
    if (!element) return
    const start = element.selectionStart
    const end = element.selectionEnd
    const selected = value.slice(start, end) || placeholder
    commit(
      value.slice(0, start) + before + selected + after + value.slice(end),
      start + before.length,
      start + before.length + selected.length,
    )
  }

  const prefixLines = (prefix: string) => {
    const element = textareaRef.current
    if (!element) return
    const start = element.selectionStart
    const end = element.selectionEnd
    const lineStart = value.lastIndexOf('\n', start - 1) + 1
    const breakIndex = value.indexOf('\n', end)
    const lineEnd = breakIndex === -1 ? value.length : breakIndex
    const chunk = value.slice(lineStart, lineEnd)
    const prefixed = chunk
      .split('\n')
      .map((line) => `${prefix}${line}`)
      .join('\n')
    commit(value.slice(0, lineStart) + prefixed + value.slice(lineEnd), lineStart, lineStart + prefixed.length)
  }

  const insertSnippet = (text: string, cursorOffset: number) => {
    const element = textareaRef.current
    if (!element) return
    const start = element.selectionStart
    const end = element.selectionEnd
    commit(value.slice(0, start) + text + value.slice(end), start + cursorOffset, start + cursorOffset)
  }

  const body = useMemo(() => splitFrontmatter(value).body, [value])
  const plain = useMemo(() => stripMarkdown(body), [body])
  const words = wordCount(plain)
  const lines = value.split('\n').length
  const dirty = value !== doc.content

  const tools: { label: string; title: string; run: () => void }[] = [
    { label: 'H2', title: 'Heading', run: () => prefixLines('## ') },
    { label: 'B', title: 'Bold', run: () => wrapSelection('**', '**', 'bold text') },
    { label: 'I', title: 'Italic', run: () => wrapSelection('_', '_', 'italic text') },
    { label: '‹›', title: 'Inline code', run: () => wrapSelection('`', '`', 'code') },
    { label: '¶', title: 'Code block', run: () => insertSnippet('\n```js\n\n```\n', 8) },
    { label: '🔗', title: 'Link', run: () => wrapSelection('[', '](https://)', 'link text') },
    { label: '•', title: 'Bullet list', run: () => prefixLines('- ') },
    { label: '☑', title: 'Task list', run: () => prefixLines('- [ ] ') },
    { label: '❝', title: 'Blockquote', run: () => prefixLines('> ') },
    { label: '▤', title: 'Table', run: () => insertSnippet(TABLE_SNIPPET, 1) },
    { label: 'FM', title: 'Insert front matter template', run: () => insertSnippet(FRONTMATTER_SNIPPET, 7) },
  ]

  return (
    <div className="editor">
      <div className="editor__toolbar no-print">
        <span className="row" style={{ gap: 7 }}>
          <IconFile size={14} />
          <strong style={{ fontSize: 13 }}>{doc.name}</strong>
          {dirty ? <span className="badge badge--warn">unsaved</span> : null}
        </span>

        <span className="row row--wrap" style={{ gap: 2 }}>
          {tools.map((tool) => (
            <button
              key={tool.label}
              type="button"
              className="btn btn--ghost btn--sm"
              title={tool.title}
              onClick={tool.run}
              style={{ minWidth: 30 }}
            >
              {tool.label}
            </button>
          ))}
        </span>

        <span className="topbar__spacer" />

        <div className="segmented">
          {(
            [
              { value: 'write', label: 'Write', icon: <IconText size={12} /> },
              { value: 'split', label: 'Split', icon: <IconColumns size={12} /> },
              { value: 'preview', label: 'Preview', icon: <IconEye size={12} /> },
            ] as { value: EditorMode; label: string; icon: React.JSX.Element }[]
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              className={`segmented__btn${mode === option.value ? ' segmented__btn--active' : ''}`}
              onClick={() => setMode(option.value)}
            >
              {option.icon}
              {option.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="btn btn--sm"
          onClick={() => {
            scheduleSave.cancel()
            void save(value)
          }}
        >
          <IconSave size={13} />
          Save
        </button>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => onOpenReader(doc.id)}>
          <IconBookOpen size={13} />
          Read
        </button>
      </div>

      <div className={`editor__grid${mode === 'split' ? '' : ' editor__grid--single'}`}>
        {mode !== 'preview' ? (
          <div className="editor__pane">
            <div className="editor__pane-head">
              <span>Markdown</span>
              <span>{pluralise(lines, 'line')}</span>
            </div>
            <textarea
              ref={textareaRef}
              className="editor__textarea"
              value={value}
              spellCheck
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Tab') {
                  event.preventDefault()
                  insertSnippet('  ', 2)
                }
              }}
            />
          </div>
        ) : null}

        {mode !== 'write' ? (
          <div className="editor__pane">
            <div className="editor__pane-head">
              <span>Preview</span>
              <span>{readingTimeLabel(plain)}</span>
            </div>
            <div className="editor__preview">
              <MarkdownView
                body={body}
                codeWrap={settings.codeWrap}
                lineNumbers={settings.lineNumbers}
                fontScale={settings.fontScale}
                readingWidth={Math.min(settings.readingWidth, 760)}
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className="editor__toolbar no-print" style={{ borderTop: '1px solid var(--border)', borderBottom: 0 }}>
        <span className={`editor__status${dirty ? ' editor__status--dirty' : ''}`}>
          {dirty ? (
            <>
              <IconText size={12} />
              Saving…
            </>
          ) : (
            <>
              <IconCheck size={12} />
              {savedAt ? `Saved ${formatDateTime(savedAt)}` : `In sync (updated ${formatDateTime(doc.updatedAt)})`}
            </>
          )}
        </span>
        <span className="editor__status">
          <span>{pluralise(words, 'word')}</span>
          <span>{pluralise(lines, 'line')}</span>
          <span>autosave on</span>
        </span>
      </div>
    </div>
  )
}
