import { useMemo } from 'react'
import { useVault } from '../state/VaultContext'
import { recentDocs, summariseCategories } from '../lib/vault'
import { formatDuration, formatNumber, formatRelativeTime, pluralise } from '../lib/util'
import { IconBookOpen, IconBookmark, IconCheckCircle, IconClock, IconFile, IconFolder, IconHalfCircle, IconNote, IconTag } from './Icons'
import { ProgressBar, SectionHead } from './bits'
import { EmptyLibrary } from './EmptyLibrary'

export interface DashboardProps {
  onOpenDoc: (docId: string, headingId?: string | null) => void
  onSearch: (query: string) => void
}

export function Dashboard({ onOpenDoc, onSearch }: DashboardProps): React.JSX.Element {
  const { docs, folders, metas, progress, bookmarks, notes, stats } = useVault()

  const recent = useMemo(() => recentDocs(docs, progress, 6), [docs, progress])
  const inProgress = useMemo(
    () => recentDocs(docs, progress).filter((entry) => entry.progress.percentage > 2 && entry.progress.percentage < 97),
    [docs, progress],
  )
  const categories = useMemo(
    () => summariseCategories(folders, metas, progress, bookmarks, notes),
    [folders, metas, progress, bookmarks, notes],
  )
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const meta of metas.values()) {
      for (const tag of meta.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 24)
  }, [metas])

  if (docs.length === 0) return <EmptyLibrary onSearch={onSearch} />

  const cards: { label: string; value: number; icon: React.JSX.Element; tone?: string }[] = [
    { label: 'Documents', value: stats.documents, icon: <IconFile size={16} /> },
    { label: 'Completed', value: stats.completed, icon: <IconCheckCircle size={16} />, tone: 'var(--ok)' },
    { label: 'In progress', value: stats.inProgress, icon: <IconHalfCircle size={16} />, tone: 'var(--accent)' },
    { label: 'Not started', value: stats.notStarted, icon: <IconClock size={16} /> },
    { label: 'Bookmarks', value: stats.bookmarks, icon: <IconBookmark size={16} />, tone: 'var(--warn)' },
    { label: 'Notes', value: stats.notes, icon: <IconNote size={16} /> },
  ]

  return (
    <div className="view-scroll">
      <div className="page">
        <div className="page__head">
          <div>
            <h1 className="page__title">Welcome back</h1>
            <p className="page__sub">
              {pluralise(stats.documents, 'document')} across {pluralise(stats.folders, 'folder')} ·{' '}
              {formatNumber(stats.words)} words · about {formatDuration(stats.readingMinutes)} of reading
            </p>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn--sm" onClick={() => onSearch('')}>
              <IconBookOpen size={13} />
              Browse
            </button>
          </div>
        </div>

        <div className="stat-grid">
          {cards.map((card) => (
            <div className="stat" key={card.label}>
              <div className="stat__top">
                <span className="stat__label">{card.label}</span>
                <span style={card.tone ? { color: card.tone } : undefined}>{card.icon}</span>
              </div>
              <span className="stat__value">{formatNumber(card.value)}</span>
            </div>
          ))}
        </div>

        <div className="dash-columns">
          <section className="section">
            <SectionHead title="Continue reading" />
            {inProgress.length === 0 ? (
              <p className="muted" style={{ fontSize: 13 }}>
                Open a document and your position is remembered here.
              </p>
            ) : (
              <div className="list">
                {inProgress.slice(0, 5).map((entry) => {
                  const meta = metas.get(entry.doc.id)
                  return (
                    <button
                      key={entry.doc.id}
                      type="button"
                      className="list__row"
                      onClick={() => onOpenDoc(entry.doc.id, entry.progress.headingId)}
                    >
                      <span className="list__main">
                        <span className="list__title">{meta?.title ?? entry.doc.name}</span>
                        <span className="list__meta">
                          {entry.progress.headingText ? (
                            <>
                              <IconBookOpen size={11} />
                              {entry.progress.headingText}
                            </>
                          ) : (
                            meta?.path
                          )}
                        </span>
                      </span>
                      <span className="list__side">
                        <ProgressBar value={entry.progress.percentage} />
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          <section className="section">
            <SectionHead title="Recently opened" />
            <div className="list">
              {recent.map((entry, index) => {
                const meta = metas.get(entry.doc.id)
                return (
                  <button
                    key={entry.doc.id}
                    type="button"
                    className="list__row"
                    onClick={() => onOpenDoc(entry.doc.id)}
                  >
                    <span className="list__index">{index + 1}</span>
                    <span className="list__main">
                      <span className="list__title">{meta?.title ?? entry.doc.name}</span>
                      <span className="list__meta">
                        {entry.doc.name} · {formatRelativeTime(entry.progress.lastOpened)}
                      </span>
                    </span>
                    <span className="list__side">
                      <span className="progress__text">{Math.round(entry.progress.percentage)}%</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        </div>

        {categories.length > 0 ? (
          <section className="section" style={{ marginTop: 26 }}>
            <SectionHead title="Collections" />
            <div className="course-grid">
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className="course-card"
                  onClick={() => onSearch(category.name)}
                >
                  <span className="course-card__name">
                    <IconFolder size={15} />
                    {category.name}
                  </span>
                  <span className="course-card__stats">
                    <span className="course-card__stat">
                      Notes <b>{category.documents}</b>
                    </span>
                    <span className="course-card__stat">
                      Completed <b>{category.completed}</b>
                    </span>
                    <span className="course-card__stat">
                      In progress <b>{category.inProgress}</b>
                    </span>
                    <span className="course-card__stat">
                      <b>{formatDuration(category.readingMinutes)}</b> reading
                    </span>
                  </span>
                  <ProgressBar
                    value={
                      category.documents === 0
                        ? 0
                        : Math.round((category.completed / category.documents) * 100)
                    }
                  />
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {tagCounts.length > 0 ? (
          <section className="section">
            <SectionHead title="Tags" />
            <div className="tag-cloud">
              {tagCounts.map(([tag, count]) => (
                <button key={tag} type="button" className="tag-pill" onClick={() => onSearch(`#${tag}`)}>
                  <IconTag size={12} />#{tag}
                  <span className="tag-pill__count">{count}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <p className="muted" style={{ fontSize: 12, marginTop: 24 }}>
          Everything is stored in this browser. Import more folders any time — nothing is uploaded.
        </p>
      </div>
    </div>
  )
}
