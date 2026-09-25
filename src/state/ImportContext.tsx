import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { ImportSummary } from '../lib/types'
import { entriesFromDataTransfer, entriesFromFiles, entriesFromZip, pickDirectory, pickFiles } from '../lib/importer'
import type { ReadResult } from '../lib/importer'
import { useVault } from './VaultContext'
import { useToast } from './ToastContext'
import { Modal } from '../components/Modal'

/**
 * One place that knows how to run an import and report the outcome, shared by
 * the sidebar buttons, the empty state, the command palette and drag & drop.
 */

export interface ImportController {
  importing: boolean
  importFiles(): Promise<void>
  importFolder(): Promise<void>
  importZip(): Promise<void>
  importDropped(items: DataTransferItemList): Promise<void>
}

const ImportContext = createContext<ImportController | null>(null)

const MARKDOWN_ACCEPT = '.md,.markdown,.mdown,.mkd,text/markdown'

export function ImportProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { importEntries } = useVault()
  const toast = useToast()
  const [importing, setImporting] = useState(false)
  const [report, setReport] = useState<ImportSummary['skipped'] | null>(null)

  const run = useCallback(
    async (read: () => Promise<ReadResult>, label: string) => {
      setImporting(true)
      try {
        const result = await read()
        if (result.entries.length === 0 && result.skipped.length === 0) return

        const summary = await importEntries(result.entries, result.skipped)
        const parts: string[] = []
        if (summary.imported > 0) parts.push(`${summary.imported} imported`)
        if (summary.updated > 0) parts.push(`${summary.updated} updated`)
        if (summary.unchanged > 0) parts.push(`${summary.unchanged} unchanged`)

        const changed = summary.imported + summary.updated
        toast.notify(
          parts.length > 0 ? `${label} — ${parts.join(' · ')}` : `${label} — nothing new found`,
          {
            tone: changed > 0 ? 'success' : 'info',
            duration: 6000,
            action:
              summary.skipped.length > 0
                ? { label: `Skipped (${summary.skipped.length})`, run: () => setReport(summary.skipped) }
                : undefined,
          },
        )
      } catch (error) {
        toast.notify(`Import failed: ${(error as Error).message}`, { tone: 'error' })
      } finally {
        setImporting(false)
      }
    },
    [importEntries, toast],
  )

  const controller = useMemo<ImportController>(
    () => ({
      importing,
      importFiles: async () => {
        const files = await pickFiles({ accept: MARKDOWN_ACCEPT })
        if (files.length === 0) return
        await run(() => entriesFromFiles(files), 'Import')
      },
      importFolder: async () => {
        const files = await pickDirectory()
        if (files.length === 0) return
        await run(() => entriesFromFiles(files), 'Folder import')
      },
      importZip: async () => {
        const files = await pickFiles({ accept: '.zip,application/zip' })
        const file = files[0]
        if (!file) return
        await run(() => entriesFromZip(file), 'Archive import')
      },
      importDropped: async (items) => {
        await run(() => entriesFromDataTransfer(items), 'Drop import')
      },
    }),
    [importing, run],
  )

  return (
    <ImportContext.Provider value={controller}>
      {children}
      {report ? (
        <Modal
          title="Files that were skipped"
          description={`${report.length} file${report.length === 1 ? '' : 's'} could not be imported.`}
          wide
          onClose={() => setReport(null)}
          footer={
            <button type="button" className="btn btn--primary" onClick={() => setReport(null)}>
              Close
            </button>
          }
        >
          <div className="list" style={{ maxHeight: 360, overflowY: 'auto' }}>
            {report.slice(0, 400).map((item, index) => (
              <div key={`${item.path}-${index}`} className="list__row" style={{ cursor: 'default' }}>
                <span className="list__main">
                  <span className="list__title" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                    {item.path}
                  </span>
                  <span className="list__meta">{item.reason}</span>
                </span>
              </div>
            ))}
          </div>
          {report.length > 400 ? (
            <p className="muted" style={{ fontSize: 12 }}>
              Showing the first 400 entries.
            </p>
          ) : null}
        </Modal>
      ) : null}
    </ImportContext.Provider>
  )
}

export function useImport(): ImportController {
  const context = useContext(ImportContext)
  if (!context) throw new Error('useImport must be used inside <ImportProvider>')
  return context
}
