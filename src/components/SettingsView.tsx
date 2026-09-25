import { useState } from 'react'
import { useVault } from '../state/VaultContext'
import { useImport } from '../state/ImportContext'
import { useToast } from '../state/ToastContext'
import { exportVaultZip } from '../lib/exporter'
import { SETTINGS_STORAGE_KEY } from '../state/VaultContext'
import type { ThemeMode } from '../lib/types'
import { formatDuration, formatNumber, pluralise } from '../lib/util'
import { ConfirmDialog } from './Modal'
import { IconArchive, IconCheck, IconDownload, IconFolder, IconMonitor, IconMoon, IconSun, IconTrash, IconUpload } from './Icons'

const SHORTCUTS: { keys: string[]; description: string }[] = [
  { keys: ['Ctrl', 'K'], description: 'Jump to search' },
  { keys: ['Ctrl', 'P'], description: 'Command palette' },
  { keys: ['Ctrl', 'B'], description: 'Bookmark the current section' },
  { keys: ['Ctrl', 'F'], description: 'Find in all notes' },
  { keys: ['Ctrl', 'S'], description: 'Force-save while editing' },
  { keys: ['Ctrl', 'Enter'], description: 'Save a note in the note composer' },
  { keys: ['Esc'], description: 'Close any dialog or menu' },
]

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch${checked ? ' switch--on' : ''}`}
      onClick={() => onChange(!checked)}
    />
  )
}

export function SettingsView(): React.JSX.Element {
  const vault = useVault()
  const { importFiles, importFolder, importZip, importing } = useImport()
  const toast = useToast()
  const { settings, updateSettings, stats, docs, folders, bookmarks, notes, progress } = vault
  const [confirmReset, setConfirmReset] = useState(false)
  const [exporting, setExporting] = useState(false)

  const themes: { value: ThemeMode; label: string; icon: React.JSX.Element }[] = [
    { value: 'light', label: 'Light', icon: <IconSun size={13} /> },
    { value: 'dark', label: 'Dark', icon: <IconMoon size={13} /> },
    { value: 'system', label: 'System', icon: <IconMonitor size={13} /> },
  ]

  return (
    <div className="view-scroll">
      <div className="page">
        <div className="page__head">
          <div>
            <h1 className="page__title">Settings</h1>
            <p className="page__sub">Everything here is stored locally in your browser.</p>
          </div>
        </div>

        <div className="settings-group">
          <h2 className="settings-group__title">Appearance</h2>
          <p className="settings-group__desc">Reading comfort settings apply to the reader and the editor preview.</p>

          <div className="field">
            <div className="field__main">
              <div className="field__label">Theme</div>
              <div className="field__hint">Follow the system, or pin light / dark.</div>
            </div>
            <div className="field__control">
              <div className="segmented">
                {themes.map((theme) => (
                  <button
                    key={theme.value}
                    type="button"
                    className={`segmented__btn${settings.theme === theme.value ? ' segmented__btn--active' : ''}`}
                    onClick={() => updateSettings({ theme: theme.value })}
                  >
                    {theme.icon}
                    {theme.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="field">
            <div className="field__main">
              <div className="field__label">Body text size</div>
              <div className="field__hint">{Math.round(settings.fontScale * 100)}% of the base size</div>
            </div>
            <div className="field__control">
              <input
                className="slider"
                type="range"
                min={0.85}
                max={1.35}
                step={0.05}
                value={settings.fontScale}
                onChange={(event) => updateSettings({ fontScale: Number(event.target.value) })}
              />
            </div>
          </div>

          <div className="field">
            <div className="field__main">
              <div className="field__label">Reading column width</div>
              <div className="field__hint">{settings.readingWidth}px — narrower lines are easier to scan.</div>
            </div>
            <div className="field__control">
              <input
                className="slider"
                type="range"
                min={620}
                max={1180}
                step={20}
                value={settings.readingWidth}
                onChange={(event) => updateSettings({ readingWidth: Number(event.target.value) })}
              />
            </div>
          </div>

          <div className="field">
            <div className="field__main">
              <div className="field__label">Wrap long code lines</div>
              <div className="field__hint">Otherwise code blocks scroll horizontally.</div>
            </div>
            <div className="field__control">
              <Toggle
                checked={settings.codeWrap}
                onChange={(next) => updateSettings({ codeWrap: next })}
                label="Wrap long code lines"
              />
            </div>
          </div>

          <div className="field">
            <div className="field__main">
              <div className="field__label">Line numbers in code blocks</div>
              <div className="field__hint">Adds a numbered gutter (wrapping is disabled for numbered blocks).</div>
            </div>
            <div className="field__control">
              <Toggle
                checked={settings.lineNumbers}
                onChange={(next) => updateSettings({ lineNumbers: next })}
                label="Show line numbers"
              />
            </div>
          </div>

          <div className="field">
            <div className="field__main">
              <div className="field__label">Show the contents panel</div>
              <div className="field__hint">The generated table of contents while reading.</div>
            </div>
            <div className="field__control">
              <Toggle
                checked={settings.showToc}
                onChange={(next) => updateSettings({ showToc: next })}
                label="Show contents panel"
              />
            </div>
          </div>
        </div>

        <div className="settings-group">
          <h2 className="settings-group__title">Library</h2>
          <p className="settings-group__desc">
            {pluralise(stats.documents, 'document')} in {pluralise(stats.folders, 'folder')} ·{' '}
            {formatNumber(stats.words)} words · about {formatDuration(stats.readingMinutes)} of reading ·{' '}
            {stats.bookmarks} bookmarks · {stats.notes} notes
          </p>

          <div className="field">
            <div className="field__main">
              <div className="field__label">Add more content</div>
              <div className="field__hint">Re-importing a folder updates changed files instead of duplicating them.</div>
            </div>
            <div className="field__control">
              <button type="button" className="btn btn--sm" onClick={() => void importFiles()} disabled={importing}>
                <IconUpload size={13} />
                Files
              </button>
              <button type="button" className="btn btn--sm" onClick={() => void importFolder()} disabled={importing}>
                <IconFolder size={13} />
                Folder
              </button>
              <button type="button" className="btn btn--sm" onClick={() => void importZip()} disabled={importing}>
                <IconArchive size={13} />
                .zip
              </button>
            </div>
          </div>

          <div className="field">
            <div className="field__main">
              <div className="field__label">Back up the whole vault</div>
              <div className="field__hint">
                Downloads every file at its original path plus a <code>_meta/vault.json</code> side-car with
                bookmarks, notes and progress.
              </div>
            </div>
            <div className="field__control">
              <button
                type="button"
                className="btn btn--sm"
                disabled={exporting || docs.length === 0}
                onClick={() => {
                  void (async () => {
                    setExporting(true)
                    try {
                      await exportVaultZip({ docs, folders, bookmarks, notes, progress })
                      toast.notify('Vault exported as a .zip archive', { tone: 'success' })
                    } finally {
                      setExporting(false)
                    }
                  })()
                }}
              >
                <IconDownload size={13} />
                {exporting ? 'Packaging…' : 'Export .zip'}
              </button>
            </div>
          </div>

          <div className="field">
            <div className="field__main">
              <div className="field__label">Where is my data?</div>
              <div className="field__hint">
                In this browser's IndexedDB and localStorage (<code>{SETTINGS_STORAGE_KEY}</code> for these
                preferences). No server, no account, no uploads.
              </div>
            </div>
            <div className="field__control">
              <IconCheck size={15} />
            </div>
          </div>
        </div>

        <div className="settings-group">
          <h2 className="settings-group__title">Keyboard shortcuts</h2>
          <p className="settings-group__desc">Available everywhere unless you are typing in a field.</p>
          <div className="shortcut-list">
            {SHORTCUTS.map((shortcut) => (
              <div className="shortcut-row" key={shortcut.description}>
                <span className="muted">{shortcut.description}</span>
                <span className="shortcut-row__keys">
                  {shortcut.keys.map((key) => (
                    <span className="kbd" key={key}>
                      {key}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="settings-group">
          <h2 className="settings-group__title">Danger zone</h2>
          <p className="settings-group__desc">
            Removes every imported document, folder, bookmark, note and reading position from this browser.
          </p>
          <button type="button" className="btn btn--danger" onClick={() => setConfirmReset(true)}>
            <IconTrash size={14} />
            Erase the library
          </button>
        </div>
      </div>

      {confirmReset ? (
        <ConfirmDialog
          title="Erase the entire library?"
          description="This deletes all documents, folders, bookmarks, notes and reading progress from this browser. Export a backup first if you are unsure."
          confirmLabel="Erase everything"
          destructive
          onConfirm={() => {
            void (async () => {
              await vault.resetVault()
              toast.notify('Library erased', { duration: 2600 })
            })()
          }}
          onClose={() => setConfirmReset(false)}
        />
      ) : null}
    </div>
  )
}
