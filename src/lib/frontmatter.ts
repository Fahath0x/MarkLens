// js-yaml v5 is ESM with named exports only — there is no default export.
import { dump, load } from 'js-yaml'
import type { FrontmatterData } from './types'

/**
 * YAML front matter support.
 *
 * The block is split off before rendering so the renderer never sees it, and
 * `upsertFrontmatterField` lets the UI write values (status, tags, category)
 * back into the file without disturbing the body.
 */

const FRONTMATTER_RE = /^\ufeff?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

export interface SplitDocument {
  frontmatter: FrontmatterData
  /** Body with the front matter removed. */
  body: string
  /** The raw front matter block including delimiters, or null when absent. */
  raw: string | null
}

export function splitFrontmatter(content: string): SplitDocument {
  const normalised = content.replace(/^\ufeff/, '')
  const match = FRONTMATTER_RE.exec(normalised)
  if (!match) return { frontmatter: {}, body: normalised, raw: null }

  let frontmatter: FrontmatterData = {}
  try {
    const parsed = load(match[1])
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      frontmatter = parsed as FrontmatterData
    }
  } catch {
    // Malformed front matter should never break the reader — show the body.
    frontmatter = {}
  }

  return { frontmatter, body: normalised.slice(match[0].length), raw: match[0] }
}

function serialise(frontmatter: FrontmatterData): string {
  if (Object.keys(frontmatter).length === 0) return ''
  const text = dump(frontmatter, { lineWidth: 100, noRefs: true, sortKeys: false }).trimEnd()
  return text === '{}' ? '' : text
}

/**
 * Sets (or removes, when `value` is null/undefined/empty) a single front matter
 * key, creating the block if the document does not have one yet.
 */
export function upsertFrontmatterField(
  content: string,
  key: string,
  value: string | string[] | null | undefined,
): string {
  const { frontmatter, body, raw } = splitFrontmatter(content)
  const next: FrontmatterData = { ...frontmatter }

  const isEmpty = value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)
  if (isEmpty) delete next[key]
  else next[key] = value

  const block = serialise(next)
  const trimmedBody = body.replace(/^\r?\n+/, '')

  if (!block) return raw ? trimmedBody : content
  if (!raw) return `---\n${block}\n---\n\n${trimmedBody}`
  return `---\n${block}\n---\n\n${trimmedBody}`
}

export function fmString(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return null
}

export function fmStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => fmStringList(item))
  const single = fmString(value)
  if (!single) return []
  // `tags: networking, ccna` is common enough to support.
  return single
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

/** Reads a `status` value and normalises it to one of three buckets. */
export type DocumentStatus = 'completed' | 'in-progress' | 'not-started' | 'other'

export function classifyStatus(status: string | null): DocumentStatus {
  if (!status) return 'not-started'
  const value = status.toLowerCase()
  if (/(complete|done|finished|read|mastered)/.test(value)) return 'completed'
  if (/(progress|reading|started|learning|review|wip)/.test(value)) return 'in-progress'
  if (/(not|todo|to-do|planned|backlog|new)/.test(value)) return 'not-started'
  return 'other'
}
