import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Doc } from '../lib/types'
import type { DocMeta } from '../lib/vault'
import { classifyStatus, splitFrontmatter } from '../lib/frontmatter'
import { readingTimeLabel, stripMarkdown } from '../lib/markdown'
import { clamp, cx, formatDateTime, formatNumber, formatRelativeTime } from '../lib/util'
import {
  articleHtmlFrom,
  exportDocHtml,
  exportDocMarkdown,
  exportDocText,
  printDocument,
} from '../lib/exporter'
import { useVault } from '../state/VaultContext'
import { useToast } from '../state/ToastContext'
import { MarkdownView } from './MarkdownView'
import { TocPanel } from './TocPanel'
import { DocumentNotes } from './DocumentNotes'
import type { NoteTarget } from './DocumentNotes'
import { StatusChip, Chip } from './bits'
import { ContextMenu } from './ContextMenu'
import {
  IconBookmark,
  IconBookmarkFilled,
  IconCheck,
  IconCircle,
  IconClock,
  IconDownload,
  IconEdit,
  IconFolder,
  IconLayers,
  IconListTree,
  IconNote,
  IconPrinter,
  IconRefresh,
  IconText,
  IconWrap,
} from './Icons'

export interface ReaderProps {
  doc: Doc
  meta: DocMeta
  /** Heading to scroll to when the document opens (from a bookmark or search hit). */
  initialHeadingId: string | null
  onEdit: (docId: string) => void
  onSearch: (query: string) => void
  onToggleToc: () => void
}

function findHeadingElement(container: HTMLElement, headingId: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-heading-id="${CSS.escape(headingId)}"]`)
}

export function Reader({
  doc,
  meta,
  initialHeadingId,
  onEdit,
  onSearch,
  onToggleToc,
}: ReaderProps): React.JSX.Element {
  const vault = useVault()
  const toast = useToast()
  const { settings, toggleBookmark, recordProgress, resetProgress, setDocumentStatus, bookmarks } = vault

  const scrollRef = useRef<HTMLDivElement>(null)
  const articleRef = useRef<HTMLDivElement>(null)
  const headingElements = useRef<HTMLElement[]>([])
  const frame = useRef(0)
  const ignoreUntil = useRef(0)
  const lastRendered = useRef({ percentage: -1, headingId: null as string | null })
  const activeHeadingRef = useRef<string | null>(null)

  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null)
  const [percentage, setPercentage] = useState(0)
  const [noteTarget, setNoteTarget] = useState<NoteTarget | null>(null)
  const [exportMenu, setExportMenu] = useState<{ x: number; y: number } | null>(null)

  const { body } = useMemo(() => splitFrontmatter(doc.content), [doc.content])
  const plainText = useMemo(() => stripMarkdown(body), [body])
  const headingTextById = useMemo(() => {
    const map = new Map<string, string>()
    for (const heading of meta.headings) map.set(heading.id, heading.text)
    return map
  }, [meta.headings])

  const status = classifyStatus(meta.status)
  const lastRead = vault.progressFor(doc.id)
  const savedProgress = lastRead

  // Kept in refs so the mount-time restore never re-runs on unrelated renders.
  const savedProgressRef = useRef(savedProgress)
  savedProgressRef.current = savedProgress
  activeHeadingRef.current = activeHeadingId

  const bookmarkedIds = useMemo(
    () => new Set(bookmarks.filter((bookmark) => bookmark.docId === doc.id).map((bookmark) => bookmark.headingId)),
    [bookmarks, doc.id],
  )
  const activeBookmarked = activeHeadingId ? bookmarkedIds.has(activeHeadingId) : false

  // ---- scroll bookkeeping -------------------------------------------------
  /**
   * Reads the current scroll position and reports it. Also runs once after the
   * reading position is restored, so the progress bar and the contents panel
   * reflect where you actually are instead of staying at zero until you scroll.
   */
  const syncFromScroll = useCallback(() => {
    const container = scrollRef.current
    if (!container) return

    const max = container.scrollHeight - container.clientHeight
    // A document shorter than the viewport is fully visible, hence 100%.
    const next = max <= 8 ? 100 : Math.round(clamp((container.scrollTop / max) * 100, 0, 100))

    const containerTop = container.getBoundingClientRect().top
    let currentId: string | null = null
    for (const heading of headingElements.current) {
      if (heading.getBoundingClientRect().top - containerTop <= 96) currentId = heading.dataset.headingId ?? null
      else break
    }

    if (next !== lastRendered.current.percentage) {
      lastRendered.current.percentage = next
      setPercentage(next)
    }
    if (currentId !== lastRendered.current.headingId) {
      lastRendered.current.headingId = currentId
      setActiveHeadingId(currentId)
    }

    recordProgress(doc.id, {
      percentage: next,
      headingId: currentId,
      headingText: currentId ? (headingTextById.get(currentId) ?? null) : null,
    })
  }, [doc.id, recordProgress, headingTextById])

  // Held in a ref so the restore effect never has to re-run when the document
  // metadata changes (which would yank the reader's scroll position).
  const syncRef = useRef(syncFromScroll)
  syncRef.current = syncFromScroll

  const handleScroll = useCallback(() => {
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      if (performance.now() < ignoreUntil.current) return
      syncFromScroll()
    })
  }, [syncFromScroll])

  // Re-collect heading anchors whenever the rendered document changes.
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    headingElements.current = Array.from(container.querySelectorAll<HTMLElement>('[data-heading-id]'))
  }, [body, doc.id])

  // Restore the previous reading position when the document opens.
  useLayoutEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const saved = savedProgressRef.current
    ignoreUntil.current = performance.now() + 280
    lastRendered.current = { percentage: -1, headingId: null }

    const apply = () => {
      if (performance.now() > ignoreUntil.current + 900) return
      const targetId = initialHeadingId ?? (saved && saved.percentage < 97 ? saved.headingId : null)
      const element = targetId ? findHeadingElement(container, targetId) : null
      if (element) {
        const top = element.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 8
        container.scrollTo({ top: Math.max(0, top) })
        return
      }
      if (saved && saved.percentage > 3) {
        const max = container.scrollHeight - container.clientHeight
        container.scrollTo({ top: (saved.percentage / 100) * Math.max(0, max) })
      } else {
        container.scrollTo({ top: 0 })
      }
    }

    apply()
    // Layout settles once fonts and lazy images land; re-apply briefly.
    const raf = requestAnimationFrame(apply)
    const timer = window.setTimeout(apply, 200)
    // Then report the restored position so progress is accurate immediately.
    const settle = window.setTimeout(() => {
      ignoreUntil.current = 0
      syncRef.current()
    }, 340)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(timer)
      window.clearTimeout(settle)
    }
  }, [doc.id, initialHeadingId])

  useEffect(() => {
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current)
    }
  }, [])

  // Reading a document counts as "opened" for the recent list.
  useEffect(() => {
    recordProgress(doc.id, { lastOpened: Date.now() })
  }, [doc.id, recordProgress])

  // ---- navigation + actions ----------------------------------------------
  const scrollToHeading = useCallback((headingId: string, behavior: ScrollBehavior = 'smooth') => {
    const container = scrollRef.current
    if (!container) return
    const element = findHeadingElement(container, headingId)
    if (!element) return
    const top = element.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 8
    container.scrollTo({ top: Math.max(0, top), behavior })
    setActiveHeadingId(headingId)
  }, [])

  const toggleHeadingBookmark = useCallback(
    async (headingId: string, headingText: string) => {
      if (!headingId) return
      const added = await toggleBookmark(doc.id, headingId, headingText)
      toast.notify(added ? `Bookmarked “${headingText}”` : `Removed bookmark for “${headingText}”`, {
        tone: 'success',
        duration: 2200,
      })
    },
    [doc.id, toggleBookmark, toast],
  )

  const requestNote = useCallback((headingId: string | null, headingText: string | null) => {
    setNoteTarget({ headingId, headingText, nonce: Date.now() })
    window.setTimeout(() => {
      document.getElementById('document-notes')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 60)
  }, [])

  // Ctrl/Cmd + B bookmarks the section currently at the top of the viewport.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'b') return
      event.preventDefault()
      const id = activeHeadingRef.current
      if (!id) {
        toast.notify('Scroll to a section first, then bookmark it', { duration: 2400 })
        return
      }
      void toggleHeadingBookmark(id, headingTextById.get(id) ?? '')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [headingTextById, toast, toggleHeadingBookmark])

  const handleExportHtml = () => {
    const html = articleHtmlFrom(articleRef.current?.querySelector('.markdown-body') as HTMLElement | null)
    const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
    exportDocHtml(meta, html, theme)
    toast.notify('Exported as a standalone HTML file', { tone: 'success' })
  }

  return (
    <>
      <div className="reader">
        <div className="reader__progress no-print" aria-hidden="true">
          <div className="reader__progress-fill" style={{ width: `${percentage}%` }} />
        </div>

        <div className="reader__toolbar no-print">
          <button type="button" className="btn btn--sm" onClick={() => onEdit(doc.id)}>
            <IconEdit size={13} />
            Edit
          </button>
          <button
            type="button"
            className="btn btn--sm"
            onClick={() =>
              void toggleHeadingBookmark(
                activeHeadingId ?? '',
                activeHeadingId ? (headingTextById.get(activeHeadingId) ?? '') : '',
              )
            }
            disabled={!activeHeadingId}
            title="Bookmark the section you are reading (Ctrl+B)"
          >
            {activeBookmarked ? <IconBookmarkFilled size={13} /> : <IconBookmark size={13} />}
            Bookmark
          </button>
          <button type="button" className="btn btn--sm" onClick={() => requestNote(activeHeadingId, activeHeadingId ? (headingTextById.get(activeHeadingId) ?? null) : null)}>
            <IconNote size={13} />
            Note
          </button>
          <button
            type="button"
            className={cx('btn', 'btn--sm', status === 'completed' && 'btn--on')}
            onClick={() =>
              void setDocumentStatus(doc.id, status === 'completed' ? 'In progress' : 'Completed')
            }
            title="Writes a `status` field into the file's front matter"
          >
            {status === 'completed' ? <IconCheck size={13} /> : <IconCircle size={13} />}
            {status === 'completed' ? 'Completed' : 'Mark complete'}
          </button>

          <span className="topbar__spacer" />

          <button
            type="button"
            className={cx('btn', 'btn--ghost', 'btn--sm', settings.codeWrap && 'btn--on')}
            onClick={() => vault.updateSettings({ codeWrap: !settings.codeWrap })}
            title="Wrap long lines in every code block"
          >
            <IconWrap size={13} />
            Wrap
          </button>
          <button
            type="button"
            className={cx('btn', 'btn--ghost', 'btn--sm', settings.lineNumbers && 'btn--on')}
            onClick={() => vault.updateSettings({ lineNumbers: !settings.lineNumbers })}
            title="Show line numbers in every code block"
          >
            1&nbsp;2&nbsp;3
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => {
              void resetProgress(doc.id)
              setPercentage(0)
              lastRendered.current = { percentage: -1, headingId: null }
              scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
              toast.notify('Reading position cleared', { duration: 2200 })
            }}
            title="Forget how far through this document you are"
          >
            <IconRefresh size={13} />
            Reset
          </button>
          <button
            type="button"
            className="btn btn--sm"
            onClick={(event) => {
              const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
              setExportMenu({ x: rect.right - 190, y: rect.bottom + 6 })
            }}
          >
            <IconDownload size={13} />
            Export
          </button>
        </div>

        <div className="reader-scroll" ref={scrollRef} onScroll={handleScroll}>
          <div className="reader__inner" style={{ maxWidth: meta && settings.readingWidth + 96 }}>
            <header className="doc-header">
              <div className="doc-header__path">
                <IconFolder size={12} />
                {meta.path.includes('/') ? meta.path.slice(0, meta.path.lastIndexOf('/')) : 'Library'}
                <span aria-hidden="true">›</span>
                {doc.name}
              </div>
              <h1 className="doc-header__title">{meta.title}</h1>
              <div className="doc-header__meta">
                <span className="doc-header__meta-item">
                  <IconText size={13} />
                  {readingTimeLabel(plainText)} · {formatNumber(meta.words)} words
                </span>
                {meta.codeBlocks > 0 ? (
                  <span className="doc-header__meta-item">
                    <IconLayers size={13} />
                    {meta.codeBlocks} code block{meta.codeBlocks === 1 ? '' : 's'}
                  </span>
                ) : null}
                <span className="doc-header__meta-item">
                  <IconClock size={13} />
                  updated {formatDateTime(doc.updatedAt)}
                </span>
                {lastRead && lastRead.headingText ? (
                  <span className="doc-header__meta-item" title="Where you left off">
                    <IconListTree size={13} />
                    last read: {lastRead.headingText}
                  </span>
                ) : null}
                {lastRead ? (
                  <span className="doc-header__meta-item">opened {formatRelativeTime(lastRead.lastOpened)}</span>
                ) : null}
              </div>

              <div className="meta-chips">
                <StatusChip status={status === 'not-started' && percentage > 2 ? 'in-progress' : status} />
                {meta.category ? <Chip>{meta.category}</Chip> : null}
                {meta.difficulty ? <Chip>{meta.difficulty}</Chip> : null}
                {meta.source ? <Chip>{meta.source}</Chip> : null}
                {meta.dateStarted ? <Chip>started {meta.dateStarted}</Chip> : null}
                {meta.dateCompleted ? <Chip tone="ok">finished {meta.dateCompleted}</Chip> : null}
                {meta.tags.map((tag) => (
                  <Chip key={tag} onClick={() => onSearch(`#${tag}`)} title={`Search for #${tag}`}>
                    #{tag}
                  </Chip>
                ))}
              </div>
            </header>

            <div ref={articleRef}>
              <MarkdownView
                body={body}
                docId={doc.id}
                onToggleBookmark={(headingId, headingText) => void toggleHeadingBookmark(headingId, headingText)}
                onAddNote={requestNote}
                codeWrap={settings.codeWrap}
                lineNumbers={settings.lineNumbers}
                fontScale={settings.fontScale}
                readingWidth={settings.readingWidth}
              />
            </div>

            <DocumentNotes
              docId={doc.id}
              headings={meta.headings}
              target={noteTarget}
              onJump={(headingId) => scrollToHeading(headingId)}
            />
          </div>
        </div>
      </div>

      {settings.showToc ? (
        <TocPanel
          headings={meta.headings}
          activeId={activeHeadingId}
          progress={percentage}
          bookmarkedIds={bookmarkedIds}
          onNavigate={(headingId) => scrollToHeading(headingId)}
          onClose={onToggleToc}
        />
      ) : null}

      {exportMenu ? (
        <ContextMenu
          x={exportMenu.x}
          y={exportMenu.y}
          onClose={() => setExportMenu(null)}
          items={[
            {
              label: 'Export as HTML',
              icon: <IconDownload size={14} />,
              onSelect: handleExportHtml,
            },
            {
              label: 'Print / Save as PDF',
              icon: <IconPrinter size={14} />,
              onSelect: () => printDocument(),
            },
            {
              label: 'Download .md source',
              icon: <IconText size={14} />,
              onSelect: () => {
                exportDocMarkdown(doc)
                toast.notify('Markdown downloaded', { tone: 'success' })
              },
            },
            {
              label: 'Download as plain text',
              icon: <IconText size={14} />,
              onSelect: () => {
                exportDocText(doc, plainText, meta.title)
                toast.notify('Text file downloaded', { tone: 'success' })
              },
            },
          ]}
        />
      ) : null}
    </>
  )
}
