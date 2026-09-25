import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type {
  Bookmark,
  Doc,
  Folder,
  ImportEntry,
  ImportSummary,
  Note,
  ReadingProgress,
  Settings,
} from '../lib/types'
import {
  STORE_DOCS,
  STORE_FOLDERS,
  STORE_KV,
  clearStores,
  deleteRecords,
  getAllRecords,
  putRecords,
  readKv,
  writeKv,
} from '../lib/db'
import { buildDocMetaList, computeStats, descendantDocIds, folderSubtreeIds } from '../lib/vault'
import type { DocMeta, VaultStats } from '../lib/vault'
import { buildSearchIndex, searchIndex } from '../lib/search'
import type { SearchIndexEntry, SearchOptions, SearchResult } from '../lib/search'
import { mergeEntries } from '../lib/importer'
import { upsertFrontmatterField } from '../lib/frontmatter'
import { createId, debounce, isMarkdownFile, uniqueName } from '../lib/util'

/**
 * The single source of truth for everything the user owns.
 *
 * All mutations go through `apply`, which updates a ref *synchronously* before
 * handing the new state to React. That keeps rapid interactions (import →
 * rename → open, or scroll-driven progress updates) from reading stale state,
 * and lets each action persist exactly the records it touched instead of
 * rewriting the whole vault.
 */

export const SETTINGS_STORAGE_KEY = 'mdkm:settings'

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  sidebarCollapsed: false,
  codeWrap: false,
  lineNumbers: false,
  showToc: true,
  fontScale: 1,
  readingWidth: 820,
}

export interface VaultData {
  docs: Doc[]
  folders: Folder[]
  bookmarks: Bookmark[]
  notes: Note[]
  progress: ReadingProgress[]
  settings: Settings
}

const EMPTY_DATA: VaultData = {
  docs: [],
  folders: [],
  bookmarks: [],
  notes: [],
  progress: [],
  settings: DEFAULT_SETTINGS,
}

const PROGRESS_PREFIX = 'progress:'

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<Settings>
    return { ...DEFAULT_SETTINGS, ...parsed }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    /* storage full or blocked — settings just will not persist */
  }
}

export function newDocumentTemplate(title: string): string {
  return `---
title: "${title.replace(/"/g, '\\"')}"
status: "In progress"
tags: []

---

# ${title}

Write your notes here. Markdown is fully supported — **bold**, _italic_,
\`inline code\`, tables, task lists and fenced code blocks.

## Key points

- First idea
- Second idea

## Example

\`\`\`js
console.log('hello from the markdown reader')
\`\`\`
`
}

export interface CreateDocInput {
  name: string
  folderId: string | null
  content?: string
}

export interface SaveNoteInput {
  id?: string
  docId: string
  headingId: string | null
  headingText: string | null
  body: string
}

export interface VaultActions {
  importEntries(entries: ImportEntry[], skipped?: ImportSummary['skipped']): Promise<ImportSummary>
  createDoc(input: CreateDocInput): Promise<Doc>
  saveDocContent(docId: string, content: string): Promise<void>
  renameDoc(docId: string, name: string): Promise<void>
  moveDoc(docId: string, folderId: string | null): Promise<void>
  duplicateDoc(docId: string): Promise<Doc | null>
  deleteDoc(docId: string): Promise<void>
  createFolder(name: string, parentId: string | null): Promise<Folder>
  renameFolder(folderId: string, name: string): Promise<void>
  moveFolder(folderId: string, parentId: string | null): Promise<void>
  deleteFolder(folderId: string): Promise<void>
  toggleBookmark(docId: string, headingId: string, headingText: string): Promise<boolean>
  removeBookmark(bookmarkId: string): Promise<void>
  saveNote(input: SaveNoteInput): Promise<void>
  deleteNote(noteId: string): Promise<void>
  setDocumentStatus(docId: string, status: string | null): Promise<void>
  recordProgress(docId: string, patch: Partial<ReadingProgress>): void
  resetProgress(docId: string): Promise<void>
  updateSettings(patch: Partial<Settings>): void
  resetVault(): Promise<void>
}

export interface VaultContextValue extends VaultActions {
  ready: boolean
  docs: Doc[]
  folders: Folder[]
  bookmarks: Bookmark[]
  notes: Note[]
  progress: ReadingProgress[]
  settings: Settings
  metas: Map<string, DocMeta>
  stats: VaultStats
  getDoc(docId: string): Doc | undefined
  getMeta(docId: string): DocMeta | undefined
  search(query: string, options?: SearchOptions): SearchResult[]
  progressFor(docId: string): ReadingProgress | undefined
  isBookmarked(docId: string, headingId: string): boolean
  notesFor(docId: string): Note[]
}

const VaultContext = createContext<VaultContextValue | null>(null)

export function VaultProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [data, setData] = useState<VaultData>(() => ({ ...EMPTY_DATA, settings: loadSettings() }))
  const [ready, setReady] = useState(false)
  const dataRef = useRef(data)

  const apply = useCallback((updater: (previous: VaultData) => VaultData) => {
    const next = updater(dataRef.current)
    dataRef.current = next
    setData(next)
  }, [])

  // ---- initial load -------------------------------------------------------
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [docs, folders, kv] = await Promise.all([
        getAllRecords<Doc>(STORE_DOCS),
        getAllRecords<Folder>(STORE_FOLDERS),
        readKv<unknown>(),
      ])
      if (cancelled) return

      const progress: ReadingProgress[] = []
      for (const [key, value] of Object.entries(kv)) {
        if (key.startsWith(PROGRESS_PREFIX) && value && typeof value === 'object') {
          progress.push(value as ReadingProgress)
        }
      }

      apply(() => ({
        docs,
        folders,
        bookmarks: Array.isArray(kv.bookmarks) ? (kv.bookmarks as Bookmark[]) : [],
        notes: Array.isArray(kv.notes) ? (kv.notes as Note[]) : [],
        progress,
        settings: loadSettings(),
      }))
      setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [apply])

  // ---- theme + settings persistence --------------------------------------
  useEffect(() => {
    const { theme } = data.settings
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const applyTheme = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    }
    applyTheme()
    media.addEventListener('change', applyTheme)
    return () => media.removeEventListener('change', applyTheme)
  }, [data.settings])

  useEffect(() => {
    saveSettings(data.settings)
  }, [data.settings])

  // ---- derived values -----------------------------------------------------
  const metas = useMemo(() => buildDocMetaList(data.docs, data.folders), [data.docs, data.folders])
  const metasRef = useRef(metas)
  useEffect(() => {
    metasRef.current = metas
  }, [metas])

  const stats = useMemo(
    () => computeStats(metas, data.progress, data.bookmarks, data.notes, data.folders),
    [metas, data.progress, data.bookmarks, data.notes, data.folders],
  )

  const docIndex = useMemo(() => new Map(data.docs.map((doc) => [doc.id, doc])), [data.docs])
  const progressIndex = useMemo(
    () => new Map(data.progress.map((entry) => [entry.docId, entry])),
    [data.progress],
  )

  // Search indexes are built on first use, then cached until documents change.
  const searchCache = useRef<{ docs: Doc[]; entries: SearchIndexEntry[] } | null>(null)

  const search = useCallback((query: string, options?: SearchOptions): SearchResult[] => {
    const docs = dataRef.current.docs
    const cached = searchCache.current
    if (!cached || cached.docs !== docs) {
      const titles = new Map<string, string>()
      for (const [id, meta] of metasRef.current) titles.set(id, meta.title)
      searchCache.current = { docs, entries: buildSearchIndex(docs, titles) }
    }
    const entries = searchCache.current?.entries ?? []
    return searchIndex(entries, query, options)
  }, [])

  // ---- progress writes are batched ---------------------------------------
  const pendingProgress = useRef(new Map<string, ReadingProgress>())
  const flushProgress = useMemo(
    () =>
      debounce(() => {
        const entries = [...pendingProgress.current.values()]
        pendingProgress.current.clear()
        if (entries.length === 0) return
        void putRecords(
          STORE_KV,
          entries.map((entry) => ({ key: `${PROGRESS_PREFIX}${entry.docId}`, value: entry })),
        )
      }, 600),
    [],
  )

  useEffect(() => {
    const handler = () => flushProgress.flush()
    window.addEventListener('beforeunload', handler)
    return () => {
      window.removeEventListener('beforeunload', handler)
      handler()
    }
  }, [flushProgress])

  // ---- actions ------------------------------------------------------------
  const importEntries = useCallback<VaultActions['importEntries']>(
    async (entries, skipped = []) => {
      const current = dataRef.current
      const result = mergeEntries(entries, current.folders, current.docs, skipped)

      const foldersChanged =
        result.folders.length !== current.folders.length ||
        result.folders.some((folder, index) => folder !== current.folders[index])

      apply((previous) => ({ ...previous, folders: result.folders, docs: result.docs }))

      if (foldersChanged) await putRecords(STORE_FOLDERS, result.folders)
      await putRecords(STORE_DOCS, result.upserted)

      return {
        imported: result.imported,
        updated: result.updated,
        unchanged: result.unchanged,
        skipped: result.skipped,
      }
    },
    [apply],
  )

  const createDoc = useCallback<VaultActions['createDoc']>(
    async ({ name, folderId, content }) => {
      const now = Date.now()
      const siblings = dataRef.current.docs
        .filter((doc) => doc.folderId === folderId)
        .map((doc) => doc.name)
      const desired = isMarkdownFile(name) ? name : `${name.trim() || 'untitled'}.md`
      const finalName = uniqueName(siblings, desired)
      const title = finalName.replace(/\.(md|markdown|mdown|mkd)$/i, '')
      const body = content ?? newDocumentTemplate(title)

      const doc: Doc = {
        id: createId(),
        name: finalName,
        folderId,
        content: body,
        size: body.length,
        importedAt: now,
        updatedAt: now,
      }

      apply((previous) => ({ ...previous, docs: [...previous.docs, doc] }))
      await putRecords(STORE_DOCS, [doc])
      return doc
    },
    [apply],
  )

  const saveDocContent = useCallback<VaultActions['saveDocContent']>(
    async (docId, content) => {
      let updated: Doc | undefined
      apply((previous) => ({
        ...previous,
        docs: previous.docs.map((doc) => {
          if (doc.id !== docId) return doc
          updated = { ...doc, content, size: content.length, updatedAt: Date.now() }
          return updated
        }),
      }))
      if (updated) await putRecords(STORE_DOCS, [updated])
    },
    [apply],
  )

  const updateDocRecord = useCallback(
    async (docId: string, patch: (doc: Doc, siblings: Doc[]) => Doc | null) => {
      let updated: Doc | undefined
      apply((previous) => ({
        ...previous,
        docs: previous.docs.map((doc) => {
          if (doc.id !== docId) return doc
          const next = patch(doc, previous.docs)
          if (!next) return doc
          updated = next
          return next
        }),
      }))
      if (updated) await putRecords(STORE_DOCS, [updated])
      return updated
    },
    [apply],
  )

  const renameDoc = useCallback<VaultActions['renameDoc']>(
    async (docId, name) => {
      await updateDocRecord(docId, (doc, siblings) => {
        const trimmed = name.trim() || doc.name
        const desired = isMarkdownFile(trimmed) ? trimmed : `${trimmed}.md`
        const taken = siblings.filter((other) => other.folderId === doc.folderId && other.id !== doc.id).map((other) => other.name)
        return { ...doc, name: uniqueName(taken, desired), updatedAt: Date.now() }
      })
    },
    [updateDocRecord],
  )

  const moveDoc = useCallback<VaultActions['moveDoc']>(
    async (docId, folderId) => {
      await updateDocRecord(docId, (doc, siblings) => {
        if (doc.folderId === folderId) return doc
        const taken = siblings.filter((other) => other.folderId === folderId).map((other) => other.name)
        return { ...doc, folderId, name: uniqueName(taken, doc.name), updatedAt: Date.now() }
      })
    },
    [updateDocRecord],
  )

  const duplicateDoc = useCallback<VaultActions['duplicateDoc']>(
    async (docId) => {
      const source = dataRef.current.docs.find((doc) => doc.id === docId)
      if (!source) return null
      const now = Date.now()
      const taken = dataRef.current.docs
        .filter((doc) => doc.folderId === source.folderId)
        .map((doc) => doc.name)
      const base = source.name.replace(/\.(md|markdown|mdown|mkd)$/i, '')
      const copy: Doc = {
        ...source,
        id: createId(),
        name: uniqueName(taken, `${base} copy.md`),
        importedAt: now,
        updatedAt: now,
      }
      apply((previous) => ({ ...previous, docs: [...previous.docs, copy] }))
      await putRecords(STORE_DOCS, [copy])
      return copy
    },
    [apply],
  )

  const deleteDoc = useCallback<VaultActions['deleteDoc']>(
    async (docId) => {
      const current = dataRef.current
      const bookmarks = current.bookmarks.filter((bookmark) => bookmark.docId !== docId)
      const notes = current.notes.filter((note) => note.docId !== docId)
      const progress = current.progress.filter((entry) => entry.docId !== docId)

      apply((previous) => ({
        ...previous,
        docs: previous.docs.filter((doc) => doc.id !== docId),
        bookmarks,
        notes,
        progress,
      }))

      await deleteRecords(STORE_DOCS, [docId])
      await putRecords(STORE_KV, [
        { key: 'bookmarks', value: bookmarks },
        { key: 'notes', value: notes },
      ])
      await deleteRecords(STORE_KV, [`${PROGRESS_PREFIX}${docId}`])
    },
    [apply],
  )

  const createFolder = useCallback<VaultActions['createFolder']>(
    async (name, parentId) => {
      const siblings = dataRef.current.folders
        .filter((folder) => folder.parentId === parentId)
        .map((folder) => folder.name)
      const unique = uniqueName(siblings, name.trim() || 'New folder')
      const folder: Folder = { id: createId(), name: unique, parentId, createdAt: Date.now() }
      apply((previous) => ({ ...previous, folders: [...previous.folders, folder] }))
      await putRecords(STORE_FOLDERS, [folder])
      return folder
    },
    [apply],
  )

  const renameFolder = useCallback<VaultActions['renameFolder']>(
    async (folderId, name) => {
      let updated: Folder | undefined
      apply((previous) => ({
        ...previous,
        folders: previous.folders.map((folder) => {
          if (folder.id !== folderId) return folder
          const taken = previous.folders
            .filter((other) => other.parentId === folder.parentId && other.id !== folder.id)
            .map((other) => other.name)
          updated = { ...folder, name: uniqueName(taken, name.trim() || folder.name) }
          return updated
        }),
      }))
      if (updated) await putRecords(STORE_FOLDERS, [updated])
    },
    [apply],
  )

  const moveFolder = useCallback<VaultActions['moveFolder']>(
    async (folderId, parentId) => {
      let updated: Folder | undefined
      apply((previous) => {
        const target = previous.folders.find((folder) => folder.id === folderId)
        if (!target || target.parentId === parentId) return previous
        // Refuse to nest a folder inside itself.
        const descendants = folderSubtreeIds(previous.folders, folderId)
        if (parentId && descendants.includes(parentId)) return previous
        const taken = previous.folders
          .filter((other) => other.parentId === parentId && other.id !== folderId)
          .map((other) => other.name)
        updated = { ...target, parentId, name: uniqueName(taken, target.name) }
        return {
          ...previous,
          folders: previous.folders.map((folder) => (folder.id === folderId ? (updated as Folder) : folder)),
        }
      })
      if (updated) await putRecords(STORE_FOLDERS, [updated])
    },
    [apply],
  )

  const deleteFolder = useCallback<VaultActions['deleteFolder']>(
    async (folderId) => {
      const current = dataRef.current
      const folderIds = folderSubtreeIds(current.folders, folderId)
      const removedDocs = descendantDocIds(current.docs, current.folders, folderId)
      const removedSet = new Set(removedDocs)

      const bookmarks = current.bookmarks.filter((bookmark) => !removedSet.has(bookmark.docId))
      const notes = current.notes.filter((note) => !removedSet.has(note.docId))
      const progress = current.progress.filter((entry) => !removedSet.has(entry.docId))

      apply((previous) => ({
        ...previous,
        folders: previous.folders.filter((folder) => !folderIds.includes(folder.id)),
        docs: previous.docs.filter((doc) => !removedSet.has(doc.id)),
        bookmarks,
        notes,
        progress,
      }))

      await deleteRecords(STORE_FOLDERS, folderIds)
      await deleteRecords(STORE_DOCS, removedDocs)
      await deleteRecords(
        STORE_KV,
        removedDocs.map((id) => `${PROGRESS_PREFIX}${id}`),
      )
      await putRecords(STORE_KV, [
        { key: 'bookmarks', value: bookmarks },
        { key: 'notes', value: notes },
      ])
    },
    [apply],
  )

  const toggleBookmark = useCallback<VaultActions['toggleBookmark']>(
    async (docId, headingId, headingText) => {
      const existing = dataRef.current.bookmarks.find(
        (bookmark) => bookmark.docId === docId && bookmark.headingId === headingId,
      )
      const bookmarks = existing
        ? dataRef.current.bookmarks.filter((bookmark) => bookmark.id !== existing.id)
        : [
            ...dataRef.current.bookmarks,
            { id: createId(), docId, headingId, headingText, createdAt: Date.now() },
          ]
      apply((previous) => ({ ...previous, bookmarks }))
      await writeKv('bookmarks', bookmarks)
      return !existing
    },
    [apply],
  )

  const removeBookmark = useCallback<VaultActions['removeBookmark']>(
    async (bookmarkId) => {
      const bookmarks = dataRef.current.bookmarks.filter((bookmark) => bookmark.id !== bookmarkId)
      apply((previous) => ({ ...previous, bookmarks }))
      await writeKv('bookmarks', bookmarks)
    },
    [apply],
  )

  const saveNote = useCallback<VaultActions['saveNote']>(
    async (input) => {
      const body = input.body.trim()
      const now = Date.now()
      const existing = input.id
        ? dataRef.current.notes.find((note) => note.id === input.id)
        : dataRef.current.notes.find(
            (note) => note.docId === input.docId && note.headingId === input.headingId,
          )

      let notes: Note[]
      if (!body) {
        notes = existing
          ? dataRef.current.notes.filter((note) => note.id !== existing.id)
          : dataRef.current.notes
      } else if (existing) {
        notes = dataRef.current.notes.map((note) =>
          note.id === existing.id ? { ...note, body, updatedAt: now } : note,
        )
      } else {
        notes = [
          ...dataRef.current.notes,
          {
            id: createId(),
            docId: input.docId,
            headingId: input.headingId,
            headingText: input.headingText,
            body,
            createdAt: now,
            updatedAt: now,
          },
        ]
      }

      apply((previous) => ({ ...previous, notes }))
      await writeKv('notes', notes)
    },
    [apply],
  )

  const deleteNote = useCallback<VaultActions['deleteNote']>(
    async (noteId) => {
      const notes = dataRef.current.notes.filter((note) => note.id !== noteId)
      apply((previous) => ({ ...previous, notes }))
      await writeKv('notes', notes)
    },
    [apply],
  )

  const setDocumentStatus = useCallback<VaultActions['setDocumentStatus']>(
    async (docId, status) => {
      await updateDocRecord(docId, (doc) => ({
        ...doc,
        content: upsertFrontmatterField(doc.content, 'status', status),
        updatedAt: Date.now(),
      }))
    },
    [updateDocRecord],
  )

  const recordProgress = useCallback<VaultActions['recordProgress']>(
    (docId, patch) => {
      const existing = dataRef.current.progress.find((entry) => entry.docId === docId)
      const merged: ReadingProgress = {
        docId,
        percentage: patch.percentage ?? existing?.percentage ?? 0,
        headingId: patch.headingId !== undefined ? patch.headingId : (existing?.headingId ?? null),
        headingText: patch.headingText !== undefined ? patch.headingText : (existing?.headingText ?? null),
        lastOpened: patch.lastOpened ?? existing?.lastOpened ?? Date.now(),
      }

      apply((previous) => ({
        ...previous,
        progress: existing
          ? previous.progress.map((entry) => (entry.docId === docId ? merged : entry))
          : [...previous.progress, merged],
      }))

      pendingProgress.current.set(docId, merged)
      flushProgress()
    },
    [apply, flushProgress],
  )

  const resetProgress = useCallback<VaultActions['resetProgress']>(
    async (docId) => {
      apply((previous) => ({
        ...previous,
        progress: previous.progress.filter((entry) => entry.docId !== docId),
      }))
      await deleteRecords(STORE_KV, [`${PROGRESS_PREFIX}${docId}`])
    },
    [apply],
  )

  const updateSettings = useCallback<VaultActions['updateSettings']>(
    (patch) => {
      apply((previous) => ({ ...previous, settings: { ...previous.settings, ...patch } }))
    },
    [apply],
  )

  const resetVault = useCallback<VaultActions['resetVault']>(async () => {
    pendingProgress.current.clear()
    await clearStores([STORE_DOCS, STORE_FOLDERS, STORE_KV])
    apply((previous) => ({ ...previous, docs: [], folders: [], bookmarks: [], notes: [], progress: [] }))
    searchCache.current = null
  }, [apply])

  const value = useMemo<VaultContextValue>(() => {
    return {
      ready,
      docs: data.docs,
      folders: data.folders,
      bookmarks: data.bookmarks,
      notes: data.notes,
      progress: data.progress,
      settings: data.settings,
      metas,
      stats,
      getDoc: (docId) => docIndex.get(docId),
      getMeta: (docId) => metas.get(docId),
      search,
      progressFor: (docId) => progressIndex.get(docId),
      isBookmarked: (docId, headingId) =>
        data.bookmarks.some((bookmark) => bookmark.docId === docId && bookmark.headingId === headingId),
      notesFor: (docId) => data.notes.filter((note) => note.docId === docId),
      importEntries,
      createDoc,
      saveDocContent,
      renameDoc,
      moveDoc,
      duplicateDoc,
      deleteDoc,
      createFolder,
      renameFolder,
      moveFolder,
      deleteFolder,
      toggleBookmark,
      removeBookmark,
      saveNote,
      deleteNote,
      setDocumentStatus,
      recordProgress,
      resetProgress,
      updateSettings,
      resetVault,
    }
  }, [
    ready,
    data,
    metas,
    stats,
    docIndex,
    progressIndex,
    search,
    importEntries,
    createDoc,
    saveDocContent,
    renameDoc,
    moveDoc,
    duplicateDoc,
    deleteDoc,
    createFolder,
    renameFolder,
    moveFolder,
    deleteFolder,
    toggleBookmark,
    removeBookmark,
    saveNote,
    deleteNote,
    setDocumentStatus,
    recordProgress,
    resetProgress,
    updateSettings,
    resetVault,
  ])

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>
}

export function useVault(): VaultContextValue {
  const context = useContext(VaultContext)
  if (!context) throw new Error('useVault must be used inside <VaultProvider>')
  return context
}
