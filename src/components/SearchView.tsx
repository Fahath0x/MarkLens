import { useEffect, useMemo, useState } from 'react'
import { useVault } from '../state/VaultContext'
import { resultsToText } from '../lib/search'
import { copyToClipboard, pluralise } from '../lib/util'
import { useToast } from '../state/ToastContext'
import { IconBookOpen, IconCopy, IconHash, IconSearch } from './Icons'
import { SectionHead } from './bits'

export interface SearchViewProps {
  query: string
  onOpenDoc: (docId: string, headingId?: string | null) => void
}

export function SearchView({ query, onOpenDoc }: SearchViewProps): React.JSX.Element {
  const { search, docs, stats } = useVault()
  const toast = useToast()

  // Debounced so a fast typist does not re-scan the whole library per keystroke.
  const [trimmed, setTrimmed] = useState(query.trim())
  useEffect(() => {
    const timer = window.setTimeout(() => setTrimmed(query.trim()), 130)
    return () => window.clearTimeout(timer)
  }, [query])

  const results = useMemo(() => search(trimmed), [search, trimmed, docs])
  const totalMatches = results.reduce((sum, result) => sum + result.matchCount, 0)

  const copyResults = async () => {
    const ok = await copyToClipboard(resultsToText(results))
    toast.notify(ok ? 'Results copied to the clipboard' : 'Could not access the clipboard', {
      tone: ok ? 'success' : 'error',
    })
  }

  if (!trimmed) {
    return (
      <div className="view-scroll">
        <div className="page">
          <div className="empty empty--tall">
            <span className="empty__art">
              <IconSearch size={26} />
            </span>
            <h2 className="empty__title">Search your knowledge base</h2>
            <p className="empty__text">
              Full-text search runs across every imported file, including inside code blocks. Wrap a
              phrase in quotes for an exact match.
            </p>
            <div className="empty__hint">
              {pluralise(stats.documents, 'document')} indexed · use <span className="kbd">Ctrl</span>{' '}
              <span className="kbd">K</span> from anywhere
            </div>
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
            <h1 className="page__title">“{trimmed}”</h1>
            <p className="search-summary">
              {results.length === 0
                ? 'No matches'
                : `${pluralise(results.length, 'document')}, ${pluralise(totalMatches, 'match', 'matches')}`}
            </p>
          </div>
          {results.length > 0 ? (
            <button type="button" className="btn btn--sm" onClick={() => void copyResults()}>
              <IconCopy size={13} />
              Copy results
            </button>
          ) : null}
        </div>

        {results.length === 0 ? (
          <div className="empty">
            <span className="empty__art">
              <IconSearch size={24} />
            </span>
            <h2 className="empty__title">Nothing matched “{trimmed}”</h2>
            <p className="empty__text">
              Try a shorter term, or search for a tag such as <code>#networking</code>.
            </p>
          </div>
        ) : null}

        {results.map((result) => (
          <article className="search-result" key={result.docId}>
            <div className="search-result__head">
              <button
                type="button"
                className="search-result__title"
                onClick={() => onOpenDoc(result.docId)}
              >
                {result.title}
              </button>
              <span className="search-result__file">{result.name}</span>
              <span className="badge" style={{ marginLeft: 'auto' }}>
                {pluralise(result.matchCount, 'match', 'matches')}
              </span>
            </div>

            {result.matches.map((match, index) => (
              <button
                key={`${result.docId}-${match.lineNumber}-${index}`}
                type="button"
                className="search-hit"
                onClick={() => onOpenDoc(result.docId, match.headingId)}
              >
                <span className="search-hit__context">
                  {match.headingText ? (
                    <>
                      <IconBookOpen size={11} />
                      {match.headingText}
                    </>
                  ) : (
                    <>
                      <IconHash size={11} />
                      line {match.lineNumber}
                    </>
                  )}
                  <span>· line {match.lineNumber}</span>
                </span>
                <span className="search-hit__snippet">
                  {match.truncatedStart ? '…' : ''}
                  {match.lead}
                  <mark>{match.match}</mark>
                  {match.trail}
                  {match.truncatedEnd ? '…' : ''}
                </span>
              </button>
            ))}

            {result.matchCount > result.matches.length ? (
              <div className="search-hit__more">
                + {result.matchCount - result.matches.length} more{' '}
                {result.matchCount - result.matches.length === 1 ? 'match' : 'matches'} in this document
              </div>
            ) : null}
          </article>
        ))}

        <SectionHead title="Tip" />
        <p className="muted" style={{ fontSize: 12.5 }}>
          Results are ranked by where the match appears: document titles first, then filenames, then
          headings, then body text.
        </p>
      </div>
    </div>
  )
}
