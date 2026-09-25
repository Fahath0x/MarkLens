import { useEffect, useState } from 'react'
import type { RefObject } from 'react'
import { useVault } from '../state/VaultContext'
import { IconColumns, IconCommand, IconMoon, IconPanelLeft, IconSearch, IconSun } from './Icons'
import { cx } from '../lib/util'

/** Resolves the effective theme, including the `system` preference. */
export function useIsDark(): boolean {
  const { settings } = useVault()
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches,
  )

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSystemDark(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  return settings.theme === 'dark' || (settings.theme === 'system' && systemDark)
}

export interface TopBarProps {
  searchQuery: string
  onSearchQuery: (value: string) => void
  onToggleSidebar: () => void
  onOpenPalette: () => void
  searchInputRef: RefObject<HTMLInputElement | null>
  sidebarCollapsed: boolean
}

export function TopBar({
  searchQuery,
  onSearchQuery,
  onToggleSidebar,
  onOpenPalette,
  searchInputRef,
  sidebarCollapsed,
}: TopBarProps): React.JSX.Element {
  const { settings, updateSettings } = useVault()
  const isDark = useIsDark()

  return (
    <header className="topbar no-print">
      <button
        type="button"
        className={cx('btn', 'btn--ghost', 'btn--icon')}
        onClick={onToggleSidebar}
        title={sidebarCollapsed ? 'Show library' : 'Hide library'}
        aria-label="Toggle library sidebar"
      >
        <IconPanelLeft size={16} />
      </button>

      <div className="topbar__brand">
        <span className="topbar__mark" aria-hidden="true">
          M
        </span>
        <span>Markdown Reader</span>
      </div>

      <div className="topbar__search">
        <span className="topbar__search-icon">
          <IconSearch size={15} />
        </span>
        <input
          ref={searchInputRef}
          type="search"
          value={searchQuery}
          placeholder="Search all notes…"
          aria-label="Search all notes"
          onChange={(event) => onSearchQuery(event.target.value)}
        />
        <span className="kbd">Ctrl K</span>
      </div>

      <div className="topbar__spacer" />

      <div className="topbar__actions">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={onOpenPalette}
          title="Open the command palette (Ctrl+P)"
        >
          <IconCommand size={14} />
          <span className="kbd">Ctrl</span>
          <span className="kbd">P</span>
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          onClick={() => updateSettings({ theme: isDark ? 'light' : 'dark' })}
          title={isDark ? 'Switch to the light theme' : 'Switch to the dark theme'}
          aria-label="Toggle colour theme"
        >
          {isDark ? <IconSun size={16} /> : <IconMoon size={16} />}
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          onClick={() => updateSettings({ showToc: !settings.showToc })}
          title={settings.showToc ? 'Hide the table of contents' : 'Show the table of contents'}
          aria-label="Toggle table of contents"
        >
          <IconColumns size={16} />
        </button>
      </div>
    </header>
  )
}
