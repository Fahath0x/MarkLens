import { Children, isValidElement, memo, useCallback, useMemo, useState, useEffect } from 'react'
import type { ReactElement, ReactNode } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import rehypeSlug from 'rehype-slug'
import { IconBookmark, IconBookmarkFilled, IconCheck, IconCopy, IconNote, IconWrap } from './Icons'
import { copyToClipboard, cx } from '../lib/util'
import { useToast } from '../state/ToastContext'
import { useVault } from '../state/VaultContext'

/**
 * The renderer.
 *
 * Only the parts that need behaviour are overridden — headings gain anchor,
 * bookmark and note affordances, code blocks gain a toolbar, tables become
 * scrollable and external links open in a new tab. Everything else is plain
 * CommonMark + GFM from `react-markdown`.
 */

/** Flattens rendered React nodes back into source text (used for code). */
function extractText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (isValidElement(node)) {
    return extractText((node as ReactElement<{ children?: ReactNode }>).props.children)
  }
  return ''
}

interface CodeElementProps {
  className?: string
  children?: ReactNode
}

function CodeBlock({
  children,
  wrapDefault,
  numbersDefault,
}: {
  children?: ReactNode
  wrapDefault: boolean
  numbersDefault: boolean
}): React.JSX.Element {
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  const [wrap, setWrap] = useState(wrapDefault)
  const [numbered, setNumbered] = useState(numbersDefault)

  // Follow the reader-wide settings when they change.
  useEffect(() => setWrap(wrapDefault), [wrapDefault])
  useEffect(() => setNumbered(numbersDefault), [numbersDefault])

  const child = Children.toArray(children)[0]
  const codeElement = isValidElement(child) ? (child as ReactElement<CodeElementProps>) : null
  const className = codeElement?.props.className ?? ''
  const language = /language-([\w+#.-]+)/.exec(className)?.[1] ?? ''
  const code = extractText(codeElement?.props.children ?? children).replace(/\n$/, '')
  const lineCount = code.length === 0 ? 1 : code.split('\n').length
  const showNumbers = numbered && !wrap

  const copy = useCallback(async () => {
    const ok = await copyToClipboard(code)
    if (!ok) {
      toast.notify('Could not access the clipboard', { tone: 'error' })
      return
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }, [code, toast])

  const gutter = useMemo(() => {
    if (!showNumbers) return ''
    let out = ''
    for (let index = 1; index <= lineCount; index += 1) out += index === 1 ? '1' : `\n${index}`
    return out
  }, [lineCount, showNumbers])

  return (
    <div className={cx('code-block', wrap && 'code-block--wrap', showNumbers && 'code-block--numbered')}>
      <div className="code-block__bar" data-export-remove>
        <span className="code-block__lang">{language || 'text'}</span>
        <span className="code-block__tools">
          <button
            type="button"
            className={cx('code-btn', wrap && 'code-btn--on')}
            onClick={() => setWrap((value) => !value)}
            title="Toggle line wrapping for this block"
          >
            <IconWrap size={12} />
            Wrap
          </button>
          <button
            type="button"
            className={cx('code-btn', numbered && !wrap && 'code-btn--on')}
            onClick={() => setNumbered((value) => !value)}
            title="Toggle line numbers for this block"
          >
            1&nbsp;2&nbsp;3
          </button>
          <button
            type="button"
            className={cx('code-btn', copied && 'code-btn--done')}
            onClick={() => void copy()}
            title="Copy this code block"
          >
            {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </span>
      </div>
      <div className="code-block__body">
        {showNumbers ? (
          <span className="code-block__gutter" aria-hidden="true">
            {gutter}
          </span>
        ) : null}
        <pre className="code-block__pre">{codeElement ?? <code>{children}</code>}</pre>
      </div>
    </div>
  )
}

function SectionActions({
  docId,
  headingId,
  headingText,
  onToggleBookmark,
  onAddNote,
}: {
  docId: string
  headingId: string
  headingText: string
  onToggleBookmark: (headingId: string, headingText: string) => void
  onAddNote?: (headingId: string, headingText: string) => void
}): React.JSX.Element | null {
  const { bookmarks, notes } = useVault()
  if (!headingId) return null

  const bookmarked = bookmarks.some(
    (bookmark) => bookmark.docId === docId && bookmark.headingId === headingId,
  )
  const noted = notes.some((note) => note.docId === docId && note.headingId === headingId)

  return (
    <span className="md-heading__actions" data-export-remove>
      <button
        type="button"
        className={cx('md-icon-btn', bookmarked && 'md-icon-btn--on')}
        onClick={() => onToggleBookmark(headingId, headingText)}
        title={bookmarked ? 'Remove bookmark' : 'Bookmark this section'}
        aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark this section'}
      >
        {bookmarked ? <IconBookmarkFilled size={14} /> : <IconBookmark size={14} />}
      </button>
      {onAddNote ? (
        <button
          type="button"
          className={cx('md-icon-btn', noted && 'md-icon-btn--noted')}
          onClick={() => onAddNote(headingId, headingText)}
          title={noted ? 'Edit the note on this section' : 'Add a note to this section'}
          aria-label="Add a note to this section"
        >
          <IconNote size={14} />
        </button>
      ) : null}
    </span>
  )
}

export interface MarkdownViewProps {
  body: string
  /** Omit both handlers to render a plain, read-only preview (used by the editor). */
  docId?: string
  onToggleBookmark?: (headingId: string, headingText: string) => void
  onAddNote?: (headingId: string, headingText: string) => void
  codeWrap: boolean
  lineNumbers: boolean
  fontScale: number
  readingWidth: number
}

function MarkdownViewComponent({
  body,
  docId,
  onToggleBookmark,
  onAddNote,
  codeWrap,
  lineNumbers,
  fontScale,
  readingWidth,
}: MarkdownViewProps): React.JSX.Element {
  const components = useMemo(() => {
    const heading = (level: number) => {
      const Tag = `h${level}` as 'h1'
      return function Heading({ id, children }: { id?: string; children?: ReactNode }) {
        const headingId = id ?? ''
        const text = extractText(children).replace(/\s+/g, ' ').trim()
        return (
          <Tag id={headingId} className="md-heading" data-heading-id={headingId}>
            {headingId ? (
              <a className="md-anchor" href={`#${headingId}`} aria-label="Link to this section">
                #
              </a>
            ) : null}
            {children}
            {docId && onToggleBookmark ? (
              <SectionActions
                docId={docId}
                headingId={headingId}
                headingText={text}
                onToggleBookmark={onToggleBookmark}
                onAddNote={onAddNote}
              />
            ) : null}
          </Tag>
        )
      }
    }

    return {
      h1: heading(1),
      h2: heading(2),
      h3: heading(3),
      h4: heading(4),
      h5: heading(5),
      h6: heading(6),
      pre: ({ children }: { children?: ReactNode }) => (
        <CodeBlock children={children} wrapDefault={codeWrap} numbersDefault={lineNumbers} />
      ),
      table: ({ children }: { children?: ReactNode }) => (
        <div className="table-wrap">
          <table>{children}</table>
        </div>
      ),
      a: ({ href, children }: { href?: string; children?: ReactNode }) => {
        const external = typeof href === 'string' && /^https?:\/\//i.test(href)
        return (
          <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer noopener' : undefined}>
            {children}
          </a>
        )
      },
      img: ({ src, alt }: { src?: string; alt?: string }) => (
        <img src={src} alt={alt ?? ''} loading="lazy" />
      ),
    }
  }, [docId, onToggleBookmark, onAddNote, codeWrap, lineNumbers])

  return (
    <div
      className="markdown-body"
      style={
        {
          '--md-font-scale': fontScale,
          maxWidth: `${readingWidth}px`,
        } as React.CSSProperties
      }
    >
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug, [rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={components}
      >
        {body}
      </Markdown>
    </div>
  )
}

export const MarkdownView = memo(MarkdownViewComponent)
