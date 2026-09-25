import type { Bookmark, Doc, Folder, Note, ReadingProgress, TocHeading } from './types'
import type { DocumentStatus } from './frontmatter'
import { classifyStatus, fmString, fmStringList, splitFrontmatter } from './frontmatter'
import { scanLines, plainTextFromLines, countCodeBlocksFromLines, headingsFromLines, firstHeadingFromLines, wordCount, readingMinutes } from './markdown'
import { sortByName, stripExtension } from './util'

/**
 * Derived, read-only views of the vault.
 *
 * `buildDocMeta` runs a *single* pass over each document's source and derives
 * the title, headings, tags, status and word count from it, so listing a few
 * hundred notes stays cheap.
 */

export interface DocMeta {
  id: string
  name: string
  /** Title from front matter, else the first `#` heading, else the file name. */
  title: string
  /** Slash-separated path relative to the library root. */
  path: string
  folderId: string | null
  tags: string[]
  category: string | null
  difficulty: string | null
  status: string | null
  statusKind: DocumentStatus
  source: string | null
  dateStarted: string | null
  dateCompleted: string | null
  headings: TocHeading[]
  words: number
  readingMinutes: number
  codeBlocks: number
  size: number
  importedAt: number
  updatedAt: number
}

export function buildDocMeta(doc: Doc, folders: Folder[]): DocMeta {
  const { frontmatter, body } = splitFrontmatter(doc.content)
  const lines = scanLines(body)
  const headings = headingsFromLines(lines)
  const plain = plainTextFromLines(lines)
  const words = wordCount(plain)
  const status = fmString(frontmatter.status)

  return {
    id: doc.id,
    name: doc.name,
    title: fmString(frontmatter.title) ?? firstHeadingFromLines(lines) ?? stripExtension(doc.name),
    path: docPath(doc, folders),
    folderId: doc.folderId,
    tags: fmStringList(frontmatter.tags),
    category: fmString(frontmatter.category),
    difficulty: fmString(frontmatter.difficulty),
    status,
    statusKind: classifyStatus(status),
    source: fmString(frontmatter.source) ?? fmString(frontmatter.course),
    dateStarted: fmString(frontmatter.date_started) ?? fmString(frontmatter.dateStart),
    dateCompleted: fmString(frontmatter.date_completed) ?? fmString(frontmatter.dateCompleted),
    headings,
    words,
    readingMinutes: readingMinutes(plain),
    codeBlocks: countCodeBlocksFromLines(lines),
    size: doc.size,
    importedAt: doc.importedAt,
    updatedAt: doc.updatedAt,
  }
}

export function buildDocMetaList(docs: Doc[], folders: Folder[]): Map<string, DocMeta> {
  const map = new Map<string, DocMeta>()
  for (const doc of docs) map.set(doc.id, buildDocMeta(doc, folders))
  return map
}

/** `📁 Cyber / 📁 TryHackMe` → `"Cyber/TryHackMe"`. */
export function folderPath(folders: Folder[], folderId: string | null): string {
  if (!folderId) return ''
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const segments: string[] = []
  let current = byId.get(folderId)
  let guard = 0
  while (current && guard < 100) {
    segments.unshift(current.name)
    current = current.parentId ? byId.get(current.parentId) : undefined
    guard += 1
  }
  return segments.join('/')
}

export function docPath(doc: Doc, folders: Folder[]): string {
  const parent = folderPath(folders, doc.folderId)
  return parent ? `${parent}/${doc.name}` : doc.name
}

export interface TreeNode {
  kind: 'folder' | 'doc'
  id: string
  name: string
  /** Folders only. */
  children: TreeNode[]
  /** Total documents inside this subtree (folders only). */
  docCount: number
  folder?: Folder
  doc?: Doc
}

export function buildTree(folders: Folder[], docs: Doc[]): TreeNode[] {
  const nodes = new Map<string, TreeNode>()
  for (const folder of folders) {
    nodes.set(folder.id, {
      kind: 'folder',
      id: folder.id,
      name: folder.name,
      children: [],
      docCount: 0,
      folder,
    })
  }

  const roots: TreeNode[] = []
  for (const folder of folders) {
    const node = nodes.get(folder.id)
    if (!node) continue
    const parent = folder.parentId ? nodes.get(folder.parentId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  for (const doc of docs) {
    const node: TreeNode = { kind: 'doc', id: doc.id, name: doc.name, children: [], docCount: 0, doc }
    const parent = doc.folderId ? nodes.get(doc.folderId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  const finalise = (node: TreeNode): number => {
    if (node.kind === 'doc') return 1
    node.children.sort(compareNodes)
    let total = 0
    for (const child of node.children) total += finalise(child)
    node.docCount = total
    return total
  }

  roots.sort(compareNodes)
  for (const root of roots) finalise(root)
  return roots
}

function compareNodes(a: TreeNode, b: TreeNode): number {
  if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
}

/** Ids of `folderId` and every folder nested inside it. */
export function folderSubtreeIds(folders: Folder[], folderId: string): string[] {
  const ids = [folderId]
  for (const folder of folders) {
    if (folder.parentId && ids.includes(folder.parentId)) ids.push(folder.id)
  }
  // `folders` may not be ordered parent-first, so repeat until stable.
  let grew = true
  while (grew) {
    grew = false
    for (const folder of folders) {
      if (folder.parentId && ids.includes(folder.parentId) && !ids.includes(folder.id)) {
        ids.push(folder.id)
        grew = true
      }
    }
  }
  return ids
}

export function descendantDocIds(docs: Doc[], folders: Folder[], folderId: string): string[] {
  const folderIds = new Set(folderSubtreeIds(folders, folderId))
  return docs.filter((doc) => doc.folderId && folderIds.has(doc.folderId)).map((doc) => doc.id)
}

/** True when `candidateId` is `folderId` itself or nested inside it. */
export function isFolderDescendant(folders: Folder[], folderId: string, candidateId: string): boolean {
  if (folderId === candidateId) return true
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  let current = byId.get(candidateId)
  let guard = 0
  while (current?.parentId && guard < 100) {
    if (current.parentId === folderId) return true
    current = byId.get(current.parentId)
    guard += 1
  }
  return false
}

/**
 * Front matter wins, but a document can also be "completed" by reading it to
 * the end, so a note without metadata still shows up in the dashboard stats.
 */
export function effectiveStatus(
  meta: DocMeta | undefined,
  progress: ReadingProgress | undefined,
): DocumentStatus {
  if (meta && meta.statusKind !== 'not-started' && meta.statusKind !== 'other') return meta.statusKind
  if (progress && progress.percentage >= 97) return 'completed'
  if (progress && progress.percentage > 2) return 'in-progress'
  return meta?.statusKind === 'other' ? 'other' : 'not-started'
}

export function progressByDocId(progress: ReadingProgress[]): Map<string, ReadingProgress> {
  return new Map(progress.map((entry) => [entry.docId, entry]))
}

export interface RecentEntry {
  doc: Doc
  progress: ReadingProgress
}

/** Progress entries sorted newest-first, filtered to documents that still exist. */
export function recentDocs(docs: Doc[], progress: ReadingProgress[], limit?: number): RecentEntry[] {
  const byId = new Map(docs.map((doc) => [doc.id, doc]))
  const entries: RecentEntry[] = []
  for (const entry of progress) {
    const doc = byId.get(entry.docId)
    if (doc) entries.push({ doc, progress: entry })
  }
  entries.sort((a, b) => b.progress.lastOpened - a.progress.lastOpened)
  return typeof limit === 'number' ? entries.slice(0, limit) : entries
}

export interface VaultStats {
  documents: number
  completed: number
  inProgress: number
  notStarted: number
  bookmarks: number
  notes: number
  words: number
  readingMinutes: number
  folders: number
  tags: string[]
}

export function computeStats(
  metas: Map<string, DocMeta>,
  progress: ReadingProgress[],
  bookmarkList: Bookmark[],
  noteList: Note[],
  folderList: Folder[],
): VaultStats {
  const progressMap = progressByDocId(progress)
  const stats: VaultStats = {
    documents: metas.size,
    completed: 0,
    inProgress: 0,
    notStarted: 0,
    bookmarks: bookmarkList.length,
    notes: noteList.length,
    words: 0,
    readingMinutes: 0,
    folders: folderList.length,
    tags: [],
  }

  const tagSet = new Set<string>()
  for (const meta of metas.values()) {
    const status = effectiveStatus(meta, progressMap.get(meta.id))
    if (status === 'completed') stats.completed += 1
    else if (status === 'in-progress') stats.inProgress += 1
    else stats.notStarted += 1
    stats.words += meta.words
    stats.readingMinutes += meta.readingMinutes
    for (const tag of meta.tags) tagSet.add(tag)
  }

  stats.tags = [...tagSet].sort((a, b) => a.localeCompare(b))
  return stats
}

/** Folder-level rollup used by the "Learning" dashboard cards. */
export interface CategorySummary {
  id: string
  name: string
  documents: number
  completed: number
  inProgress: number
  notes: number
  bookmarks: number
  readingMinutes: number
  children: CategorySummary[]
}

export function summariseCategories(
  folders: Folder[],
  metas: Map<string, DocMeta>,
  progress: ReadingProgress[],
  bookmarkList: Bookmark[],
  noteList: Note[],
): CategorySummary[] {
  const progressMap = progressByDocId(progress)
  const metaList = [...metas.values()]

  const build = (folder: Folder): CategorySummary => {
    const childFolders = folders.filter((candidate) => candidate.parentId === folder.id)
    const children = sortByName(childFolders).map(build)
    const direct = metaList.filter((meta) => meta.folderId === folder.id)

    const summary: CategorySummary = {
      id: folder.id,
      name: folder.name,
      documents: direct.length,
      completed: 0,
      inProgress: 0,
      notes: 0,
      bookmarks: 0,
      readingMinutes: 0,
      children,
    }

    for (const meta of direct) {
      const status = effectiveStatus(meta, progressMap.get(meta.id))
      if (status === 'completed') summary.completed += 1
      else if (status === 'in-progress') summary.inProgress += 1
      summary.readingMinutes += meta.readingMinutes
      summary.notes += noteList.filter((note) => note.docId === meta.id).length
      summary.bookmarks += bookmarkList.filter((bookmark) => bookmark.docId === meta.id).length
    }

    for (const child of children) {
      summary.documents += child.documents
      summary.completed += child.completed
      summary.inProgress += child.inProgress
      summary.notes += child.notes
      summary.bookmarks += child.bookmarks
      summary.readingMinutes += child.readingMinutes
    }

    return summary
  }

  return sortByName(folders.filter((folder) => folder.parentId === null)).map(build)
}
