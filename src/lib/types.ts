/**
 * Domain types for the Markdown Reader & Knowledge Manager.
 *
 * Everything is stored locally (IndexedDB + localStorage) so the app works
 * offline and no note ever leaves the machine.
 */

export type ThemeMode = 'light' | 'dark' | 'system'

/** A folder in the library. Folders nest through `parentId`. */
export interface Folder {
  id: string
  name: string
  parentId: string | null
  createdAt: number
}

/** An imported Markdown document. `content` is the full source, kept verbatim. */
export interface Doc {
  id: string
  /** File name including extension, e.g. `networking.md`. */
  name: string
  folderId: string | null
  content: string
  size: number
  importedAt: number
  updatedAt: number
}

/** A saved pointer to a heading inside a document. */
export interface Bookmark {
  id: string
  docId: string
  headingId: string
  headingText: string
  createdAt: number
}

/** A personal note, attached either to a heading or to the whole document. */
export interface Note {
  id: string
  docId: string
  headingId: string | null
  headingText: string | null
  body: string
  createdAt: number
  updatedAt: number
}

/** How far through a document the reader got. */
export interface ReadingProgress {
  docId: string
  /** 0 – 100. */
  percentage: number
  headingId: string | null
  headingText: string | null
  lastOpened: number
}

export interface Settings {
  theme: ThemeMode
  sidebarCollapsed: boolean
  codeWrap: boolean
  lineNumbers: boolean
  showToc: boolean
  /** Markdown body font scale, 0.85 – 1.35. */
  fontScale: number
  /** Max reading column width in px. */
  readingWidth: number
}

/** Raw YAML front matter, parsed into plain values. */
export type FrontmatterData = Record<string, unknown>

/** A heading discovered in a document, used for the table of contents. */
export interface TocHeading {
  id: string
  text: string
  level: number
  line: number
}

/** Where the app is currently pointed. */
export type Route =
  | { view: 'dashboard' }
  | { view: 'doc'; docId: string; headingId?: string | null }
  | { view: 'editor'; docId: string | null }
  | { view: 'bookmarks' }
  | { view: 'notes' }
  | { view: 'recent' }
  | { view: 'search' }
  | { view: 'settings' }

/** A `{ path, content }` pair produced by the importers. */
export interface ImportEntry {
  path: string
  content: string
}

export interface ImportSummary {
  /** Brand new documents. */
  imported: number
  /** Existing documents whose content changed. */
  updated: number
  /** Existing documents that were already identical. */
  unchanged: number
  skipped: { path: string; reason: string }[]
}
