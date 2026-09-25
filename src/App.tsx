import { useCallback, useEffect, useRef, useState } from 'react'
import type { Route } from './lib/types'
import { ToastProvider, useToast } from './state/ToastContext'
import { VaultProvider, useVault } from './state/VaultContext'
import { ImportProvider, useImport } from './state/ImportContext'
import { buildDocMeta } from './lib/vault'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { Dashboard } from './components/Dashboard'
import { Reader } from './components/Reader'
import { Editor } from './components/Editor'
import { SearchView } from './components/SearchView'
import { BookmarksView } from './components/BookmarksView'
import { NotesView } from './components/NotesView'
import { RecentView } from './components/RecentView'
import { SettingsView } from './components/SettingsView'
import { CommandPalette } from './components/CommandPalette'
import { Spinner } from './components/bits'
import { IconBookOpen, IconUpload } from './components/Icons'

import './styles/base.css'
import './styles/markdown.css'
import './styles/ui.css'

function NotFound({ onHome }: { onHome: () => void }): React.JSX.Element {
  return (
    <div className="view-scroll">
      <div className="page">
        <div className="empty empty--tall">
          <span className="empty__art">
            <IconBookOpen size={24} />
          </span>
          <h2 className="empty__title">That document is gone</h2>
          <p className="empty__text">It may have been deleted or renamed in another view.</p>
          <button type="button" className="btn btn--primary" onClick={onHome}>
            Back to the dashboard
          </button>
        </div>
      </div>
    </div>
  )
}

function Workspace(): React.JSX.Element {
  const vault = useVault()
  const { importDropped, importing } = useImport()
  const toast = useToast()

  const [route, setRoute] = useState<Route>({ view: 'dashboard' })
  const [searchQuery, setSearchQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [dropActive, setDropActive] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const selectedDocId = route.view === 'doc' || route.view === 'editor' ? route.docId : null

  const openDoc = useCallback(
    (docId: string, headingId?: string | null) => {
      setRoute({ view: 'doc', docId, headingId: headingId ?? null })

      // Reveal the document in the library tree.
      const doc = vault.docs.find((candidate) => candidate.id === docId)
      if (!doc?.folderId) return
      const byId = new Map(vault.folders.map((folder) => [folder.id, folder]))
      setExpanded((previous) => {
        const next = new Set(previous)
        let current = doc.folderId ? byId.get(doc.folderId) : undefined
        let guard = 0
        while (current && guard < 40) {
          next.add(current.id)
          current = current.parentId ? byId.get(current.parentId) : undefined
          guard += 1
        }
        return next
      })
    },
    [vault.docs, vault.folders],
  )

  const openEditor = useCallback((docId: string) => {
    setRoute({ view: 'editor', docId })
  }, [])

  const goSearch = useCallback((query: string) => {
    setSearchQuery(query)
    setRoute({ view: 'search' })
    window.setTimeout(() => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    }, 30)
  }, [])

  const toggleExpanded = useCallback((folderId: string) => {
    setExpanded((previous) => {
      const next = new Set(previous)
      if (next.has(folderId)) next.delete(folderId)
      else next.add(folderId)
      return next
    })
  }, [])

  // ---- global shortcuts ---------------------------------------------------
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      const key = event.key.toLowerCase()
      const target = event.target as HTMLElement | null
      const typing =
        !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)

      if (key === 'k') {
        event.preventDefault()
        goSearch(searchQuery)
        return
      }
      if (key === 'p') {
        event.preventDefault()
        setPaletteOpen(true)
        return
      }
      if (key === 'f' && !typing) {
        event.preventDefault()
        goSearch('')
        return
      }
      if (key === 's') {
        event.preventDefault()
        if (route.view !== 'editor') {
          toast.notify('Your library saves automatically — Ctrl+S is only needed while editing.', {
            duration: 2800,
          })
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [goSearch, route.view, searchQuery, toast])

  // ---- drag & drop import -------------------------------------------------
  useEffect(() => {
    let depth = 0

    const hasFiles = (event: DragEvent) => !!event.dataTransfer?.types.includes('Files')

    const onDragEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return
      depth += 1
      setDropActive(true)
    }
    const onDragOver = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
    }
    const onDragLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDropActive(false)
    }
    const onDrop = (event: DragEvent) => {
      if (!event.dataTransfer) return
      event.preventDefault()
      depth = 0
      setDropActive(false)
      const items = event.dataTransfer.items
      if (items && items.length > 0) void importDropped(items)
    }

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [importDropped])

  // ---- reveal freshly imported top-level folders --------------------------
  const folderCount = useRef(vault.folders.length)
  useEffect(() => {
    if (vault.folders.length > folderCount.current) {
      setExpanded((previous) => {
        const next = new Set(previous)
        for (const folder of vault.folders) if (folder.parentId === null) next.add(folder.id)
        return next
      })
    }
    folderCount.current = vault.folders.length
  }, [vault.folders])

  const renderMain = (): React.JSX.Element => {
    if (!vault.ready) return <Spinner />

    switch (route.view) {
      case 'dashboard':
        return <Dashboard onOpenDoc={openDoc} onSearch={goSearch} />

      case 'doc': {
        const doc = vault.getDoc(route.docId)
        if (!doc) return <NotFound onHome={() => setRoute({ view: 'dashboard' })} />
        const meta = vault.getMeta(route.docId) ?? buildDocMeta(doc, vault.folders)
        return (
          <Reader
            key={doc.id}
            doc={doc}
            meta={meta}
            initialHeadingId={route.headingId ?? null}
            onEdit={openEditor}
            onSearch={goSearch}
            onToggleToc={() => vault.updateSettings({ showToc: !vault.settings.showToc })}
          />
        )
      }

      case 'editor': {
        const doc = route.docId ? vault.getDoc(route.docId) : undefined
        if (!doc) return <NotFound onHome={() => setRoute({ view: 'dashboard' })} />
        return <Editor key={doc.id} doc={doc} onOpenReader={(docId) => openDoc(docId)} />
      }

      case 'bookmarks':
        return <BookmarksView onOpenDoc={openDoc} />

      case 'notes':
        return <NotesView onOpenDoc={openDoc} />

      case 'recent':
        return <RecentView onOpenDoc={openDoc} />

      case 'search':
        return <SearchView query={searchQuery} onOpenDoc={openDoc} />

      case 'settings':
        return <SettingsView />
    }
  }

  return (
    <div className="app">
      <TopBar
        searchQuery={searchQuery}
        onSearchQuery={(value) => {
          setSearchQuery(value)
          setRoute({ view: 'search' })
        }}
        onToggleSidebar={() => vault.updateSettings({ sidebarCollapsed: !vault.settings.sidebarCollapsed })}
        onOpenPalette={() => setPaletteOpen(true)}
        searchInputRef={searchInputRef}
        sidebarCollapsed={vault.settings.sidebarCollapsed}
      />

      <div className="app-body">
        <Sidebar
          collapsed={vault.settings.sidebarCollapsed}
          route={route}
          selectedDocId={selectedDocId}
          expanded={expanded}
          onToggleExpanded={toggleExpanded}
          onNavigate={setRoute}
          onOpenDoc={openDoc}
          onOpenEditor={openEditor}
        />
        <main className="app-main">{renderMain()}</main>
      </div>

      {paletteOpen ? (
        <CommandPalette
          onClose={() => setPaletteOpen(false)}
          onOpenDoc={openDoc}
          onOpenEditor={openEditor}
          onNavigate={setRoute}
          onSearch={goSearch}
        />
      ) : null}

      {dropActive ? (
        <div className="drop-overlay no-print">
          <div className="drop-overlay__inner">
            <IconUpload size={30} />
            <span className="drop-overlay__title">
              {importing ? 'Importing…' : 'Drop Markdown files or folders'}
            </span>
            <span className="muted" style={{ fontSize: 12.5 }}>
              Folder structure is preserved · nothing is uploaded
            </span>
          </div>
        </div>
      ) : null}

      {importing && !dropActive ? (
        <div
          className="toast no-print"
          style={{ position: 'fixed', left: '50%', bottom: 20, transform: 'translateX(-50%)', zIndex: 150 }}
        >
          <span className="spinner" />
          <span className="toast__text">Importing your notes…</span>
        </div>
      ) : null}
    </div>
  )
}

export default function App(): React.JSX.Element {
  return (
    <ToastProvider>
      <VaultProvider>
        <ImportProvider>
          <Workspace />
        </ImportProvider>
      </VaultProvider>
    </ToastProvider>
  )
}
