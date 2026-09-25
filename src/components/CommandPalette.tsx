import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Route } from '../lib/types'
import { useVault } from '../state/VaultContext'
import { useImport } from '../state/ImportContext'
import { useToast } from '../state/ToastContext'
import { exportVaultZip } from '../lib/exporter'
import { useIsDark } from './TopBar'
import {
  IconArchive,
  IconBookmark,
  IconClock,
  IconColumns,
  IconDownload,
  IconFile,
  IconFolder,
  IconGrid,
  IconMoon,
  IconNote,
  IconPlus,
  IconSearch,
  IconSliders,
  IconSun,
  IconUpload,
  IconWrap,
} from './Icons'

export interface CommandPaletteProps {
  onClose: () => void
  onOpenDoc: (docId: string, headingId?: string | null) => void
  onOpenEditor: (docId: string) => void
  onNavigate: (route: Route) => void
  onSearch: (query: string) => void
}

interface PaletteItem {
  id: string
  group: string
  label: string
  hint?: string
  icon?: ReactNode
  run: () => void
}

export function CommandPalette({
  onClose,
  onOpenDoc,
  onOpenEditor,
  onNavigate,
  onSearch,
}: CommandPaletteProps): React.JSX.Element {
  const vault = useVault()
  const { importFiles, importFolder, importZip } = useImport()
  const toast = useToast()
  const isDark = useIsDark()

  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const items = useMemo<PaletteItem[]>(() => {
    const commands: PaletteItem[] = [
      {
        id: 'new-note',
        group: 'Actions',
        label: 'New Markdown file',
        hint: 'creates at the library root',
        icon: <IconPlus size={14} />,
        run: () => {
          void (async () => {
            const doc = await vault.createDoc({ name: 'Untitled note.md', folderId: null })
            onOpenEditor(doc.id)
          })()
        },
      },
      {
        id: 'import-files',
        group: 'Actions',
        label: 'Import Markdown files',
        icon: <IconUpload size={14} />,
        run: () => void importFiles(),
      },
      {
        id: 'import-folder',
        group: 'Actions',
        label: 'Import a folder',
        icon: <IconFolder size={14} />,
        run: () => void importFolder(),
      },
      {
        id: 'import-zip',
        group: 'Actions',
        label: 'Import a .zip archive',
        icon: <IconArchive size={14} />,
        run: () => void importZip(),
      },
      {
        id: 'export-vault',
        group: 'Actions',
        label: 'Export the whole vault (.zip)',
        icon: <IconDownload size={14} />,
        run: () => {
          void (async () => {
            await exportVaultZip({
              docs: vault.docs,
              folders: vault.folders,
              bookmarks: vault.bookmarks,
              notes: vault.notes,
              progress: vault.progress,
            })
            toast.notify('Vault exported', { tone: 'success' })
          })()
        },
      },
      {
        id: 'go-dashboard',
        group: 'Go to',
        label: 'Dashboard',
        icon: <IconGrid size={14} />,
        run: () => onNavigate({ view: 'dashboard' }),
      },
      {
        id: 'go-recent',
        group: 'Go to',
        label: 'Recently opened',
        icon: <IconClock size={14} />,
        run: () => onNavigate({ view: 'recent' }),
      },
      {
        id: 'go-bookmarks',
        group: 'Go to',
        label: 'Bookmarks',
        icon: <IconBookmark size={14} />,
        run: () => onNavigate({ view: 'bookmarks' }),
      },
      {
        id: 'go-notes',
        group: 'Go to',
        label: 'My notes',
        icon: <IconNote size={14} />,
        run: () => onNavigate({ view: 'notes' }),
      },
      {
        id: 'go-settings',
        group: 'Go to',
        label: 'Settings',
        icon: <IconSliders size={14} />,
        run: () => onNavigate({ view: 'settings' }),
      },
      {
        id: 'search',
        group: 'Go to',
        label: 'Search all notes',
        hint: 'Ctrl K',
        icon: <IconSearch size={14} />,
        run: () => onSearch(''),
      },
      {
        id: 'toggle-theme',
        group: 'Preferences',
        label: isDark ? 'Switch to the light theme' : 'Switch to the dark theme',
        icon: isDark ? <IconSun size={14} /> : <IconMoon size={14} />,
        run: () => vault.updateSettings({ theme: isDark ? 'light' : 'dark' }),
      },
      {
        id: 'toggle-toc',
        group: 'Preferences',
        label: vault.settings.showToc ? 'Hide the contents panel' : 'Show the contents panel',
        icon: <IconColumns size={14} />,
        run: () => vault.updateSettings({ showToc: !vault.settings.showToc }),
      },
      {
        id: 'toggle-wrap',
        group: 'Preferences',
        label: vault.settings.codeWrap ? 'Stop wrapping code lines' : 'Wrap long code lines',
        icon: <IconWrap size={14} />,
        run: () => vault.updateSettings({ codeWrap: !vault.settings.codeWrap }),
      },
      {
        id: 'toggle-numbers',
        group: 'Preferences',
        label: vault.settings.lineNumbers ? 'Hide code line numbers' : 'Show code line numbers',
        icon: <IconFile size={14} />,
        run: () => vault.updateSettings({ lineNumbers: !vault.settings.lineNumbers }),
      },
    ]

    const docs: PaletteItem[] = [...vault.metas.values()]
      .sort((a, b) => a.title.localeCompare(b.title))
      .slice(0, 400)
      .map((meta) => ({
        id: `doc-${meta.id}`,
        group: 'Documents',
        label: meta.title,
        hint: meta.path,
        icon: <IconFile size={14} />,
        run: () => onOpenDoc(meta.id),
      }))

    return [...commands, ...docs]
  }, [importFiles, importFolder, importZip, isDark, onNavigate, onOpenDoc, onOpenEditor, onSearch, toast, vault])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return items.filter((item) => item.group !== 'Documents').concat(items.filter((item) => item.group === 'Documents').slice(0, 8))
    const terms = needle.split(/\s+/)
    return items
      .filter((item) => {
        const haystack = `${item.label} ${item.hint ?? ''} ${item.group}`.toLowerCase()
        return terms.every((term) => haystack.includes(term))
      })
      .slice(0, 60)
  }, [items, query])

  useEffect(() => setCursor(0), [query])

  // Escape must close the palette even if focus moved off the input.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  useEffect(() => {
    const active = listRef.current?.querySelector('.palette__item--active')
    if (active instanceof HTMLElement) active.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  const runItem = (item: PaletteItem | undefined) => {
    if (!item) return
    onClose()
    item.run()
  }

  let lastGroup = ''

  return (
    <div
      className="modal-overlay no-print"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="palette__input-row">
          <IconSearch size={16} />
          <input
            className="palette__input"
            autoFocus
            value={query}
            placeholder="Search documents or run a command…"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                onClose()
              }
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setCursor((current) => Math.min(filtered.length - 1, current + 1))
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault()
                setCursor((current) => Math.max(0, current - 1))
              }
              if (event.key === 'Enter') {
                event.preventDefault()
                runItem(filtered[cursor])
              }
            }}
          />
          <span className="kbd">Esc</span>
        </div>

        <div className="palette__list" ref={listRef}>
          {filtered.length === 0 ? (
            <p className="palette__empty">Nothing matches “{query}”.</p>
          ) : (
            filtered.map((item, index) => {
              const showGroup = item.group !== lastGroup
              lastGroup = item.group
              return (
                <div key={item.id}>
                  {showGroup ? <div className="palette__group">{item.group}</div> : null}
                  <button
                    type="button"
                    className={`palette__item${index === cursor ? ' palette__item--active' : ''}`}
                    onMouseEnter={() => setCursor(index)}
                    onClick={() => runItem(item)}
                  >
                    {item.icon}
                    <span className="palette__item-main">{item.label}</span>
                    {item.hint ? <span className="palette__item-hint">{item.hint}</span> : null}
                  </button>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
