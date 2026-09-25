import type { Doc } from './types'
import type { MarkdownLine } from './markdown'
import { stripInline } from './markdown'
import { scanLines } from './markdown'
import { splitFrontmatter } from './frontmatter'

/**
 * Full-text search over the whole library.
 *
 * Searching raw Markdown would match syntax noise (`**promise**`), so each line
 * is reduced to the text a reader sees before matching, while the preview keeps
 * the line's heading context. Plain `indexOf` scans are used instead of a regex
 * so user input can never throw, and a few hundred notes scan in a few
 * milliseconds.
 */

export interface SearchIndexEntry {
  docId: string
  name: string
  title: string
  /** Text a reader would see, line by line. */
  display: string[]
  /** `display` lower-cased once, so matching stays cheap. */
  lower: string[]
  lines: MarkdownLine[]
}

export interface SearchMatch {
  headingText: string | null
  headingId: string | null
  lineNumber: number
  lead: string
  match: string
  trail: string
  truncatedStart: boolean
  truncatedEnd: boolean
  occurrences: number
}

export interface SearchResult {
  docId: string
  name: string
  title: string
  score: number
  /** Total matching lines in this document. */
  matchCount: number
  matches: SearchMatch[]
}

const LEAD_CHARS = 60
const TRAIL_CHARS = 120

function displayLine(line: MarkdownLine): string {
  return stripInline(
    line.text
      .replace(/^\s{0,3}#{1,6}\s+/, '')
      .replace(/^\s{0,3}>\s?/, '')
      .replace(/^\s{0,3}(?:[-*+]|\d+[.)])\s+/, '')
      .replace(/^\s*\|/, '')
      .replace(/\|\s*$/, '')
      .replace(/\|/g, ' · '),
  ).trim()
}

export function buildSearchIndex(docs: Doc[], titles: Map<string, string>): SearchIndexEntry[] {
  return docs.map((doc) => {
    const { body } = splitFrontmatter(doc.content)
    const scanned = scanLines(body)
    const display: string[] = []
    const lower: string[] = []
    for (const line of scanned) {
      const text = line.inCode ? line.text : displayLine(line)
      display.push(text)
      lower.push(text.toLowerCase())
    }
    return {
      docId: doc.id,
      name: doc.name,
      title: titles.get(doc.id) ?? doc.name,
      display,
      lower,
      lines: scanned,
    }
  })
}

/** Splits a query into terms, keeping `"quoted phrases"` together. */
export function parseQuery(query: string): string[] {
  const terms: string[] = []
  const pattern = /"([^"]+)"|(\S+)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(query)) !== null) {
    const term = (match[1] ?? match[2] ?? '').trim().toLowerCase()
    if (term) terms.push(term)
  }
  return terms
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0
  let count = 0
  let index = haystack.indexOf(needle)
  while (index !== -1) {
    count += 1
    index = haystack.indexOf(needle, index + needle.length)
  }
  return count
}

function buildMatch(entry: SearchIndexEntry, lineIndex: number, term: string): SearchMatch {
  const display = entry.display[lineIndex] ?? ''
  const lower = entry.lower[lineIndex] ?? ''
  const line = entry.lines[lineIndex]
  const start = lower.indexOf(term)

  if (start === -1) {
    return {
      headingText: line?.heading ?? null,
      headingId: line?.headingId ?? null,
      lineNumber: line?.lineNumber ?? lineIndex + 1,
      lead: '',
      match: '',
      trail: display.slice(0, TRAIL_CHARS),
      truncatedStart: false,
      truncatedEnd: display.length > TRAIL_CHARS,
      occurrences: 0,
    }
  }

  const windowStart = Math.max(0, start - LEAD_CHARS)
  const windowEnd = Math.min(display.length, start + term.length + TRAIL_CHARS)

  return {
    headingText: line?.heading ?? null,
    headingId: line?.headingId ?? null,
    lineNumber: line?.lineNumber ?? lineIndex + 1,
    lead: display.slice(windowStart, start),
    match: display.slice(start, start + term.length),
    trail: display.slice(start + term.length, windowEnd),
    truncatedStart: windowStart > 0,
    truncatedEnd: windowEnd < display.length,
    occurrences: countOccurrences(lower, term),
  }
}

export interface SearchOptions {
  /** Maximum number of documents returned. */
  limit?: number
  /** Maximum previews kept per document (the rest still count towards `matchCount`). */
  matchesPerDoc?: number
}

export function searchIndex(index: SearchIndexEntry[], query: string, options: SearchOptions = {}): SearchResult[] {
  const { limit = 60, matchesPerDoc = 4 } = options
  const terms = parseQuery(query)
  if (terms.length === 0) return []

  const results: SearchResult[] = []
  const phrase = query.trim().toLowerCase()

  for (const entry of index) {
    const nameLower = entry.name.toLowerCase()
    const titleLower = entry.title.toLowerCase()

    let score = 0
    if (titleLower.includes(phrase)) score += 30
    else if (terms.every((term) => titleLower.includes(term))) score += 18
    if (nameLower.includes(phrase)) score += 20
    else if (terms.every((term) => nameLower.includes(term))) score += 10

    const matches: SearchMatch[] = []
    let matchCount = 0
    let bodyScore = 0

    for (let i = 0; i < entry.lower.length; i += 1) {
      const haystack = entry.lower[i]
      if (!haystack) continue
      let all = true
      for (const term of terms) {
        if (!haystack.includes(term)) {
          all = false
          break
        }
      }
      if (!all) continue

      matchCount += 1
      bodyScore += 1

      const heading = entry.lines[i]?.heading?.toLowerCase() ?? ''
      if (heading) {
        for (const term of terms) {
          if (heading.includes(term)) {
            bodyScore += 4
            break
          }
        }
      }

      if (matches.length < matchesPerDoc) {
        matches.push(buildMatch(entry, i, terms[0]))
      }
    }

    if (matchCount === 0 && score === 0) continue

    score += Math.min(bodyScore, 24)
    results.push({
      docId: entry.docId,
      name: entry.name,
      title: entry.title,
      score,
      matchCount,
      matches,
    })
  }

  results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
  return results.slice(0, limit)
}

/** Formats results as copyable plain text — handy for pasting into a report. */
export function resultsToText(results: SearchResult[]): string {
  const lines: string[] = []
  for (const result of results) {
    lines.push(`${result.title} (${result.name}) — ${result.matchCount} match${result.matchCount === 1 ? '' : 'es'}`)
    for (const match of result.matches) {
      const context = match.headingText ? ` › ${match.headingText}` : ''
      lines.push(`  line ${match.lineNumber}${context}: ${match.lead}${match.match}${match.trail}`)
    }
    lines.push('')
  }
  return lines.join('\n').trim()
}
