import { useMemo, useState } from 'react'
import { useVault } from '../state/VaultContext'
import { useToast } from '../state/ToastContext'
import { exportBookmarks } from '../lib/exporter'
import { formatRelativeTime, pluralise } from '../lib/util'
import { ConfirmDialog } from './Modal'
import { IconBookmark, IconBookmarkFilled, IconDownload, IconTrash } from './Icons'

export interface BookmarksViewProps {
  onOpenDoc: (docId: string, headingId?: string | null) => void
}

export function BookmarksView({ onOpenDoc }: BookmarksViewProps): React.JSX.Element {
  const { bookmarks, docs, removeBookmark, metas } = useVault()
  const toast = useToast()
  const [confirmClear, setConfirmClear] = useState(false)

  const grouped = useMemo(() => {
    const byDoc = new Map<string, typeof bookmarks>()
    for (const bookmark of bookmarks) {
      const list = byDoc.get(bookmark.docId) ?? []
      list.push(bookmark)
      byDoc.set(bookmark.docId, list)
    }
    return [...byDoc.entries()]
      .map(([docId, list]) => ({
        docId,
        list: list.sort((a, b) => b.createdAt - a.createdAt),
        newest: Math.max(...list.map((bookmark) => bookmark.createdAt)),
      }))
      .sort((a, b) => b.newest - a.newest)
  }, [bookmarks])

  if (bookmarks.length === 0) {
    return (
      <div className="view-scroll">
        <div className="page">
          <div className="empty empty--tall">
            <span className="empty__art">
              <IconBookmark size={26} />
            </span>
            <h2 className="empty__title">No bookmarks yet</h2>
            <p className="empty__text">
              Hover any heading while reading and click the bookmark icon — or press{' '}
              <span className="kbd">Ctrl</span> <span className="kbd">B</span> to save the section you
              are currently on. Bookmarks jump straight back to the exact section.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="view-scroll">
      <div className="page">
        <div className="page__head">
          <div>
            <h1 className="page__title">Bookmarks</h1>
            <p className="page__sub">
              {pluralise(bookmarks.length, 'saved section')} in {pluralise(grouped.length, 'document')}
            </p>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => {
                exportBookmarks(bookmarks, docs)
                toast.notify('Bookmarks exported as Markdown', { tone: 'success' })
              }}
            >
              <IconDownload size={13} />
              Export
            </button>
            <button type="button" className="btn btn--sm btn--danger" onClick={() => setConfirmClear(true)}>
              <IconTrash size={13} />
              Clear all
            </button>
          </div>
        </div>

        {grouped.map((group) => {
          const meta = metas.get(group.docId)
          return (
            <section className="section" key={group.docId}>
              <div className="section__head">
                <button
                  type="button"
                  className="search-result__title"
                  onClick={() => onOpenDoc(group.docId)}
                >
                  {meta?.title ?? 'Missing document'}
                </button>
                <span className="muted" style={{ fontSize: 12 }}>
                  {meta?.path ?? 'deleted'}
                </span>
              </div>

              <div className="list">
                {group.list.map((bookmark) => (
                  <button
                    key={bookmark.id}
                    type="button"
                    className="list__row"
                    onClick={() => onOpenDoc(bookmark.docId, bookmark.headingId)}
                  >
                    <IconBookmarkFilled size={14} />
                    <span className="list__main">
                      <span className="list__title">{bookmark.headingText}</span>
                      <span className="list__meta">saved {formatRelativeTime(bookmark.createdAt)}</span>
                    </span>
                    <span
                      className="list__side"
                      role="button"
                      tabIndex={0}
                      title="Remove bookmark"
                      onClick={(event) => {
                        event.stopPropagation()
                        void removeBookmark(bookmark.id)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.stopPropagation()
                          void removeBookmark(bookmark.id)
                        }
                      }}
                    >
                      <IconTrash size={14} />
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )
        })}
      </div>

      {confirmClear ? (
        <ConfirmDialog
          title="Remove every bookmark?"
          description="The documents themselves are untouched — only the saved pointers are removed."
          confirmLabel="Remove all"
          destructive
          onConfirm={() => {
            void (async () => {
              for (const bookmark of bookmarks) await removeBookmark(bookmark.id)
              toast.notify('All bookmarks removed', { duration: 2400 })
            })()
          }}
          onClose={() => setConfirmClear(false)}
        />
      ) : null}
    </div>
  )
}
