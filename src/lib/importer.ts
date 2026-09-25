import JSZip from 'jszip'
import type { Doc, Folder, ImportEntry, ImportSummary } from './types'
import { createId, isMarkdownFile, uniqueName } from './util'

/**
 * Importers.
 *
 * Three input paths all funnel into `ImportEntry[]` so the vault merge logic
 * only has to be written once:
 *   • `<input type="file">` (single files or a whole directory)
 *   • drag & drop, walking `DataTransferItem.webkitGetAsEntry()` for folders
 *   • `.zip` archives, which are how most people share a notes vault
 */

const MAX_FILE_BYTES = 4 * 1024 * 1024
const IGNORED_SEGMENTS = new Set(['__MACOSX', '.git', 'node_modules', '.obsidian', '.trash'])

export interface ReadResult {
  entries: ImportEntry[]
  skipped: { path: string; reason: string }[]
}

export function normalisePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .join('/')
}

function isIgnored(path: string): boolean {
  return normalisePath(path)
    .split('/')
    .some((segment) => IGNORED_SEGMENTS.has(segment) || (segment.startsWith('.') && segment.length > 1))
}

/** Removes a shared top-level directory, e.g. `my-notes/` inside a zip. */
export function stripCommonRoot(paths: string[]): string[] {
  if (paths.length === 0) return paths
  const split = paths.map((path) => path.split('/'))
  if (split.some((segments) => segments.length < 2)) return paths
  const first = split[0][0]
  if (!split.every((segments) => segments[0] === first)) return paths
  return split.map((segments) => segments.slice(1).join('/'))
}

function toEntry(path: string, content: string, skipped: ReadResult['skipped']): ImportEntry | null {
  const clean = normalisePath(path)
  if (!clean || !isMarkdownFile(clean)) {
    skipped.push({ path: clean || path, reason: 'Not a Markdown file' })
    return null
  }
  if (isIgnored(clean)) {
    skipped.push({ path: clean, reason: 'Ignored folder' })
    return null
  }
  if (content.includes('\u0000')) {
    skipped.push({ path: clean, reason: 'Binary file' })
    return null
  }
  if (content.length > MAX_FILE_BYTES) {
    skipped.push({ path: clean, reason: 'Larger than 4 MB' })
    return null
  }
  return { path: clean, content }
}

/** Files picked through an `<input type="file">`, honouring `webkitRelativePath`. */
export async function entriesFromFiles(files: File[]): Promise<ReadResult> {
  const skipped: ReadResult['skipped'] = []
  const entries: ImportEntry[] = []

  for (const file of files) {
    const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath
    const path = normalisePath(relative && relative.length > 0 ? relative : file.name)
    if (!isMarkdownFile(path)) {
      skipped.push({ path, reason: 'Not a Markdown file' })
      continue
    }
    if (file.size > MAX_FILE_BYTES) {
      skipped.push({ path, reason: 'Larger than 4 MB' })
      continue
    }
    try {
      const entry = toEntry(path, await file.text(), skipped)
      if (entry) entries.push(entry)
    } catch {
      skipped.push({ path, reason: 'Could not be read' })
    }
  }

  return { entries, skipped }
}

function fileFromEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject)
  })
}

function readDirectory(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    // Browsers hand back directory entries in batches, so keep reading until empty.
    const collected: FileSystemEntry[] = []
    const next = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(collected)
          return
        }
        collected.push(...batch)
        next()
      }, reject)
    }
    next()
  })
}

async function walkEntry(entry: FileSystemEntry, prefix: string, files: { file: File; path: string }[]): Promise<void> {
  if (entry.isFile) {
    const file = await fileFromEntry(entry as FileSystemFileEntry)
    files.push({ file, path: `${prefix}${file.name}` })
    return
  }
  if (!entry.isDirectory) return
  const directory = entry as FileSystemDirectoryEntry
  const children = await readDirectory(directory.createReader())
  for (const child of children) {
    await walkEntry(child, `${prefix}${entry.name}/`, files)
  }
}

/**
 * Drag & dropped items. Entries must be captured synchronously — the
 * `DataTransferItemList` is emptied as soon as the event handler returns.
 */
export async function entriesFromDataTransfer(items: DataTransferItemList): Promise<ReadResult> {
  const roots: FileSystemEntry[] = []
  const plainFiles: File[] = []

  for (const item of Array.from(items)) {
    if (item.kind !== 'file') continue
    const entry = typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null
    if (entry) roots.push(entry)
    else {
      const file = item.getAsFile()
      if (file) plainFiles.push(file)
    }
  }

  const collected: { file: File; path: string }[] = []
  for (const entry of roots) {
    try {
      await walkEntry(entry, '', collected)
    } catch {
      /* a single unreadable folder should not abort the whole drop */
    }
  }
  for (const file of plainFiles) collected.push({ file, path: file.name })

  const skipped: ReadResult['skipped'] = []
  const entries: ImportEntry[] = []
  for (const { file, path } of collected) {
    const clean = normalisePath(path)
    if (!isMarkdownFile(clean)) {
      skipped.push({ path: clean, reason: 'Not a Markdown file' })
      continue
    }
    if (file.size > MAX_FILE_BYTES) {
      skipped.push({ path: clean, reason: 'Larger than 4 MB' })
      continue
    }
    try {
      const entry = toEntry(clean, await file.text(), skipped)
      if (entry) entries.push(entry)
    } catch {
      skipped.push({ path: clean, reason: 'Could not be read' })
    }
  }

  return { entries, skipped }
}

export async function entriesFromZip(file: File): Promise<ReadResult> {
  const skipped: ReadResult['skipped'] = []
  const entries: ImportEntry[] = []

  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(file)
  } catch {
    return { entries, skipped: [{ path: file.name, reason: 'Not a readable .zip archive' }] }
  }

  const names = Object.keys(zip.files).filter((name) => {
    const entry = zip.files[name]
    if (!entry || entry.dir) return false
    return isMarkdownFile(name) && !isIgnored(name)
  })

  const stripped = stripCommonRoot(names)
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index]
    try {
      const content = await zip.files[name].async('string')
      const entry = toEntry(stripped[index], content, skipped)
      if (entry) entries.push(entry)
    } catch {
      skipped.push({ path: name, reason: 'Could not be extracted' })
    }
  }

  return { entries, skipped }
}

/** The subset of the File System Access API we rely on for directory import. */
interface DirectoryHandleLike {
  name: string
  values(): AsyncIterableIterator<DirectoryEntryLike>
}

interface DirectoryEntryLike {
  kind: 'file' | 'directory'
  name: string
  getFile(): Promise<File>
}

/**
 * Opens a native directory picker when the browser has one, otherwise falls
 * back to `<input webkitdirectory>` (which is what Firefox and Safari use).
 */
export async function pickDirectory(): Promise<File[]> {
  const picker = (window as unknown as { showDirectoryPicker?: () => Promise<unknown> }).showDirectoryPicker

  if (typeof picker === 'function') {
    try {
      const handle = (await picker()) as DirectoryHandleLike
      const files: File[] = []
      const walk = async (directory: DirectoryHandleLike, prefix: string): Promise<void> => {
        for await (const child of directory.values()) {
          if (child.kind === 'file') {
            const file = await child.getFile()
            Object.defineProperty(file, 'webkitRelativePath', {
              value: `${prefix}${child.name}`,
              configurable: true,
            })
            files.push(file)
          } else {
            await walk(child as unknown as DirectoryHandleLike, `${prefix}${child.name}/`)
          }
        }
      }
      await walk(handle, `${handle.name}/`)
      return files
    } catch (error) {
      // AbortError means the user cancelled — treat that as an empty selection.
      if ((error as DOMException)?.name === 'AbortError') return []
    }
  }

  return pickFiles({ directory: true })
}

interface PickOptions {
  accept?: string
  multiple?: boolean
  directory?: boolean
}

/** Small helper that opens a native picker through a throwaway input element. */
export function pickFiles(options: PickOptions = {}): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    if (options.accept) input.accept = options.accept
    if (options.multiple !== false) input.multiple = true
    if (options.directory) {
      input.setAttribute('webkitdirectory', '')
      input.setAttribute('directory', '')
    }
    let settled = false
    const finish = (files: File[]) => {
      if (settled) return
      settled = true
      resolve(files)
    }
    input.addEventListener('change', () => finish(Array.from(input.files ?? [])))
    // `cancel` fires in modern browsers; the fallback timer keeps us from leaking.
    input.addEventListener('cancel', () => finish([]))
    input.click()
  })
}

export interface MergeResult extends ImportSummary {
  /** The complete folder list after the merge, ready to persist. */
  folders: Folder[]
  /** The complete document list after the merge, ready to persist. */
  docs: Doc[]
  /** Documents that need writing to storage (new or changed). */
  upserted: Doc[]
}

/**
 * Merges imported entries into the library.
 *
 * Folders named in the entry paths are created on demand (and reused on
 * re-import), and a file that already exists at the same path has its content
 * refreshed instead of being duplicated.
 */
export function mergeEntries(
  entries: ImportEntry[],
  existingFolders: Folder[],
  existingDocs: Doc[],
  skipped: { path: string; reason: string }[] = [],
): MergeResult {
  const folders = existingFolders.map((folder) => ({ ...folder }))
  const docs = existingDocs.map((doc) => ({ ...doc }))
  const upserted: Doc[] = []
  const result: MergeResult = {
    folders,
    docs,
    upserted,
    imported: 0,
    updated: 0,
    unchanged: 0,
    skipped: [...skipped],
  }

  const folderKey = (parentId: string | null, name: string) => `${parentId ?? 'root'}\u0000${name.toLowerCase()}`
  const folderIndex = new Map<string, string>()
  for (const folder of folders) folderIndex.set(folderKey(folder.parentId, folder.name), folder.id)

  const docIndex = new Map<string, Doc>()
  for (const doc of docs) docIndex.set(`${doc.folderId ?? 'root'}\u0000${doc.name.toLowerCase()}`, doc)

  const ensureFolder = (segments: string[], createdAt: number): string | null => {
    let parentId: string | null = null
    for (const segment of segments) {
      const name = segment.trim()
      if (!name) continue
      const key = folderKey(parentId, name)
      let id = folderIndex.get(key)
      if (!id) {
        const folder: Folder = { id: createId(), name, parentId, createdAt }
        folders.push(folder)
        id = folder.id
        folderIndex.set(key, id)
      }
      parentId = id
    }
    return parentId
  }

  const now = Date.now()

  for (const entry of entries) {
    const segments = normalisePath(entry.path).split('/').filter(Boolean)
    const fileName = segments.pop()
    if (!fileName || !isMarkdownFile(fileName)) {
      result.skipped.push({ path: entry.path, reason: 'Not a Markdown file' })
      continue
    }

    const folderId = ensureFolder(segments, now)
    const key = `${folderId ?? 'root'}\u0000${fileName.toLowerCase()}`
    const existing = docIndex.get(key)

    if (existing) {
      if (existing.content === entry.content) {
        result.unchanged += 1
        continue
      }
      const index = docs.findIndex((doc) => doc.id === existing.id)
      const updated: Doc = {
        ...existing,
        content: entry.content,
        size: entry.content.length,
        updatedAt: now,
      }
      if (index >= 0) docs[index] = updated
      docIndex.set(key, updated)
      upserted.push(updated)
      result.updated += 1
      continue
    }

    // Same folder, different file name → keep both, disambiguating the new one.
    const siblings = docs.filter((doc) => doc.folderId === folderId).map((doc) => doc.name)
    const distinctName = uniqueName(siblings, fileName)

    const doc: Doc = {
      id: createId(),
      name: distinctName,
      folderId,
      content: entry.content,
      size: entry.content.length,
      importedAt: now,
      updatedAt: now,
    }
    docs.push(doc)
    docIndex.set(`${folderId ?? 'root'}\u0000${distinctName.toLowerCase()}`, doc)
    upserted.push(doc)
    result.imported += 1
  }

  return result
}
