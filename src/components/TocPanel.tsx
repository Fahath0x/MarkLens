import { useMemo } from 'react'
import type { TocHeading } from '../lib/types'
import { IconClose, IconListTree } from './Icons'
import { IconBookmarkFilled } from './Icons'
import { ProgressBar } from './bits'

export interface TocPanelProps {
  headings: TocHeading[]
  activeId: string | null
  progress: number
  bookmarkedIds: Set<string>
  onNavigate: (headingId: string) => void
  onClose: () => void
}

/** Calculates `1`, `1.1`, `1.2`, `2`, … labels from the heading levels. */
function numbering(headings: TocHeading[]): string[] {
  if (headings.length === 0) return []
  const base = Math.min(...headings.map((heading) => heading.level))
  const counters: number[] = []
  return headings.map((heading) => {
    const depth = Math.max(0, heading.level - base)
    counters[depth] = (counters[depth] ?? 0) + 1
    counters.length = depth + 1
    return counters.join('.')
  })
}

export function TocPanel({
  headings,
  activeId,
  progress,
  bookmarkedIds,
  onNavigate,
  onClose,
}: TocPanelProps): React.JSX.Element {
  const labels = useMemo(() => numbering(headings), [headings])

  return (
    <aside className="toc-panel no-print" aria-label="Table of contents">
      <div className="toc-panel__header">
        <span className="row" style={{ gap: 6 }}>
          <IconListTree size={13} />
          Contents
        </span>
        <button
          type="button"
          className="btn btn--ghost btn--icon btn--sm"
          onClick={onClose}
          aria-label="Hide table of contents"
          title="Hide contents"
        >
          <IconClose size={14} />
        </button>
      </div>

      <div className="toc-panel__body">
        <div style={{ padding: '0 8px 12px' }}>
          <ProgressBar value={progress} />
        </div>

        {headings.length === 0 ? (
          <p className="toc-empty">This document has no headings yet.</p>
        ) : (
          <nav className="toc-list">
            {headings.map((heading, index) => (
              <button
                key={`${heading.id}-${index}`}
                type="button"
                className={`toc-item${activeId === heading.id ? ' toc-item--active' : ''}`}
                style={{ paddingLeft: 10 + Math.max(0, heading.level - Math.min(...headings.map((h) => h.level))) * 11 }}
                onClick={() => onNavigate(heading.id)}
                title={heading.text}
              >
                <span className="toc-item__num">{labels[index]}</span>
                <span className="toc-item__text">{heading.text}</span>
                {bookmarkedIds.has(heading.id) ? <IconBookmarkFilled size={11} /> : null}
              </button>
            ))}
          </nav>
        )}
      </div>
    </aside>
  )
}
