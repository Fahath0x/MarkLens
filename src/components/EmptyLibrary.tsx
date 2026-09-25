import { useImport } from '../state/ImportContext'
import { IconArchive, IconBookOpen, IconBookmark, IconFolder, IconNote, IconSearch, IconUpload, IconZap } from './Icons'

export interface EmptyLibraryProps {
  onSearch?: (query: string) => void
}

const FEATURES = [
  { icon: <IconSearch size={15} />, title: 'Full-text search', text: 'Search inside every file, including code blocks, with ranked snippets.' },
  { icon: <IconBookOpen size={15} />, title: 'Real Markdown', text: 'GFM tables, task lists, syntax highlighting and clickable contents.' },
  { icon: <IconBookmark size={15} />, title: 'Bookmarks', text: 'Save any section and jump back to it in one click.' },
  { icon: <IconNote size={15} />, title: 'Section notes', text: 'Attach your own notes to a heading or a whole document.' },
  { icon: <IconZap size={15} />, title: 'Reading progress', text: 'Pick up exactly where you left off, per document.' },
  { icon: <IconFolder size={15} />, title: 'Folder library', text: 'Import folders or zips; drag files between folders any time.' },
]

export function EmptyLibrary({ onSearch }: EmptyLibraryProps): React.JSX.Element {
  const { importFiles, importFolder, importZip, importing } = useImport()

  return (
    <div className="view-scroll">
      <div className="page">
        <div className="empty" style={{ paddingBottom: 24 }}>
          <span className="empty__art">
            <IconUpload size={26} />
          </span>
          <h2 className="empty__title">Bring your Markdown notes</h2>
          <p className="empty__text">
            This is a local-first reader. Import your <code>.md</code> files, a whole folder tree, or a
            zip archive — everything stays in this browser and never leaves your machine.
          </p>
          <div className="empty__actions">
            <button type="button" className="btn btn--primary" onClick={() => void importFolder()} disabled={importing}>
              <IconFolder size={14} />
              Import a folder
            </button>
            <button type="button" className="btn" onClick={() => void importFiles()} disabled={importing}>
              <IconUpload size={14} />
              Choose files
            </button>
            <button type="button" className="btn" onClick={() => void importZip()} disabled={importing}>
              <IconArchive size={14} />
              Import a .zip
            </button>
            {onSearch ? (
              <button type="button" className="btn btn--ghost" onClick={() => onSearch('')}>
                <IconSearch size={14} />
                Search instead
              </button>
            ) : null}
          </div>
          <p className="empty__hint">
            Tip: you can also drag files or folders anywhere onto this window.
          </p>
        </div>

        <div className="course-grid" style={{ marginTop: 18 }}>
          {FEATURES.map((feature) => (
            <div className="card" key={feature.title} style={{ cursor: 'default' }}>
              <div className="row" style={{ gap: 8, marginBottom: 6, color: 'var(--accent)' }}>
                {feature.icon}
                <strong style={{ fontSize: 13.5, color: 'var(--text-1)' }}>{feature.title}</strong>
              </div>
              <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
                {feature.text}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
