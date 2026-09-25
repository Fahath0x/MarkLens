import { useMemo } from 'react'
import { useVault } from '../state/VaultContext'
import { useToast } from '../state/ToastContext'
import { recentDocs } from '../lib/vault'
import { formatRelativeTime, pluralise } from '../lib/util'
import { IconBookOpen, IconClock, IconRefresh } from './Icons'
import { ProgressBar } from './bits'

export interface RecentViewProps {
  onOpenDoc: (docId: string, headingId?: string | null) => void
}

export function RecentView({ onOpenDoc }: RecentViewProps): React.JSX.Element {
  const { docs, progress, metas, resetProgress } = useVault()
  const toast = useToast()

  const entries = useMemo(() => recentDocs(docs, progress), [docs, progress])

  if (entries.length === 0) {
    return (
      <div className="view-scroll">
        <div className="page">
          <div className="empty empty--tall">
            <span className="empty__art">
              <IconClock size={26} />
            </span>
            <h2 className="empty__title">Nothing opened yet</h2>
            <p className="empty__text">
              Every document you open is tracked here with how far through it you got, so you can pick
              straight back up.
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
            <h1 className="page__title">Recently opened</h1>
            <p className="page__sub">{pluralise(entries.length, 'document')} in your history</p>
          </div>
        </div>

        <div className="list">
          {entries.map((entry, index) => {
            const meta = metas.get(entry.doc.id)
            return (
              <div
                key={entry.doc.id}
                className="list__row"
                role="button"
                tabIndex={0}
                onClick={() => onOpenDoc(entry.doc.id, entry.progress.headingId)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') onOpenDoc(entry.doc.id, entry.progress.headingId)
                }}
              >
                <span className="list__index">{index + 1}</span>
                <span className="list__main">
                  <span className="list__title">{meta?.title ?? entry.doc.name}</span>
                  <span className="list__meta">
                    <IconBookOpen size={11} />
                    {entry.progress.headingText ?? 'Top of document'} ·{' '}
                    {formatRelativeTime(entry.progress.lastOpened)}
                    {meta?.tags.length ? (
                      <>
                        {' · '}
                        {meta.tags.slice(0, 3).map((tag) => `#${tag}`).join(' ')}
                      </>
                    ) : null}
                  </span>
                </span>
                <span className="list__side">
                  <ProgressBar value={entry.progress.percentage} />
                  <button
                    type="button"
                    className="btn btn--ghost btn--icon btn--sm"
                    title="Forget my position in this document"
                    onClick={(event) => {
                      event.stopPropagation()
                      void resetProgress(entry.doc.id)
                      toast.notify('Position cleared', { duration: 1800 })
                    }}
                  >
                    <IconRefresh size={13} />
                  </button>
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
