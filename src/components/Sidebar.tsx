import { useState } from 'react'
import type { Route } from '../lib/types'
import { useVault } from '../state/VaultContext'
import { useImport } from '../state/ImportContext'
import { useToast } from '../state/ToastContext'
import { cx, pluralise } from '../lib/util'
import { LibraryTree } from './LibraryTree'
import { PromptDialog } from './Modal'
import { IconArchive, IconBookmark, IconClock, IconFolder, IconGrid, IconNote, IconPlus, IconSliders, IconUpload } from './Icons'

export interface SidebarProps {
  collapsed: boolean
  route: Route
  selectedDocId: string | null
  expanded: Set<string>
  onToggleExpanded: (folderId: string) => void
  onNavigate: (route: Route) => void
  onOpenDoc: (docId: string) => void
  onOpenEditor: (docId: string) => void
}

export function Sidebar({
  collapsed,
  route,
  selectedDocId,
  expanded,
  onToggleExpanded,
  onNavigate,
  onOpenDoc,
  onOpenEditor,
}: SidebarProps): React.JSX.Element {
  const { stats, createDoc, createFolder } = useVault()
  const { importing, importFiles, importFolder, importZip } = useImport()
  const toast = useToast()
  const [newFolderOpen, setNewFolderOpen] = useState(false)

  const navItems: { key: Route['view']; label: string; icon: React.JSX.Element; count?: number }[] = [
    { key: 'dashboard', label: 'Dashboard', icon: <IconGrid size={15} /> },
    { key: 'recent', label: 'Recent', icon: <IconClock size={15} /> },
    { key: 'bookmarks', label: 'Bookmarks', icon: <IconBookmark size={15} />, count: stats.bookmarks },
    { key: 'notes', label: 'Notes', icon: <IconNote size={15} />, count: stats.notes },
  ]

  return (
    <aside className={cx('sidebar', 'no-print', collapsed && 'sidebar--collapsed')} aria-label="Library">
      <div className="sidebar__scroll">
        <div className="sidebar__section">
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={cx('nav-item', route.view === item.key && 'nav-item--active')}
              onClick={() => onNavigate({ view: item.key } as Route)}
            >
              {item.icon}
              <span className="nav-item__label">{item.label}</span>
              {item.count ? <span className="nav-item__count">{item.count}</span> : null}
            </button>
          ))}
        </div>

        <div className="sidebar__section">
          <div className="sidebar__heading">
            <span>Library ({stats.documents})</span>
            <span className="row" style={{ gap: 2 }}>
              <button
                type="button"
                className="btn btn--ghost btn--icon btn--sm"
                title="Create a new Markdown file"
                onClick={() => {
                  void (async () => {
                    const doc = await createDoc({ name: 'Untitled note.md', folderId: null })
                    onOpenEditor(doc.id)
                  })()
                }}
              >
                <IconPlus size={13} />
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--icon btn--sm"
                title="Create a folder"
                onClick={() => setNewFolderOpen(true)}
              >
                <IconFolder size={13} />
              </button>
            </span>
          </div>

          <LibraryTree
            selectedDocId={selectedDocId}
            expanded={expanded}
            onToggleExpanded={onToggleExpanded}
            onOpenDoc={onOpenDoc}
            onOpenEditor={onOpenEditor}
          />
        </div>
      </div>

      <div className="sidebar__footer">
        <div className="row" style={{ gap: 6 }}>
          <button type="button" className="btn btn--sm" style={{ flex: 1 }} onClick={() => void importFiles()} disabled={importing}>
            <IconUpload size={13} />
            Files
          </button>
          <button type="button" className="btn btn--sm" style={{ flex: 1 }} onClick={() => void importFolder()} disabled={importing}>
            <IconFolder size={13} />
            Folder
          </button>
          <button
            type="button"
            className="btn btn--icon btn--sm"
            onClick={() => void importZip()}
            disabled={importing}
            title="Import a .zip archive of Markdown files"
          >
            <IconArchive size={13} />
          </button>
        </div>

        <button
          type="button"
          className={cx('nav-item', route.view === 'settings' && 'nav-item--active')}
          onClick={() => onNavigate({ view: 'settings' })}
        >
          <IconSliders size={15} />
          <span className="nav-item__label">Settings</span>
        </button>

        <p className="muted" style={{ fontSize: 11.5, margin: 0, paddingLeft: 9 }}>
          {pluralise(stats.documents, 'document')} ·{' '}
          {stats.readingMinutes >= 60
            ? `${Math.round(stats.readingMinutes / 60)} h reading`
            : `${stats.readingMinutes} min reading`}
        </p>
      </div>

      {newFolderOpen ? (
        <PromptDialog
          title="New folder"
          description="Folders group related notes and can be nested as deep as you need."
          placeholder="e.g. Networking"
          confirmLabel="Create folder"
          onSubmit={(name) => {
            void createFolder(name, null)
            toast.notify(`Folder “${name}” created`, { tone: 'success', duration: 2200 })
          }}
          onClose={() => setNewFolderOpen(false)}
        />
      ) : null}
    </aside>
  )
}
