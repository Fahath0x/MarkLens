import GithubSlugger from 'github-slugger'
import type { TocHeading } from './types'
import { slugify } from './util'

/**
 * Markdown source analysis.
 *
 * The reader needs the *source* view of a document for three things the
 * renderer cannot give us: a table of contents whose ids match the rendered
 * headings, plain text for search previews and reading-time estimates, and
 * per-line heading context so search results can say "found in › Promises".
 */

export interface MarkdownLine {
  text: string
  lineNumber: number
  /** True for fenced-code lines (including the fence markers themselves). */
  inCode: boolean
  /** Nearest heading, including the line's own heading when it is one. */
  heading: string | null
  headingId: string | null
  headingLevel: number
  /** True when this very line *is* a heading. */
  isHeading: boolean
}

const FENCE_OPEN_RE = /^\s{0,3}(`{3,}|~{3,})/
const HEADING_RE = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/

/**
 * Removes inline Markdown syntax, leaving the text a reader would see.
 * Intentionally conservative: CommonMark only treats `_`/`*` as emphasis when
 * they are not surrounded by word characters, and heading slugs must match
 * what `rehype-slug` produces from the rendered text.
 */
export function stripInline(raw: string): string {
  return raw
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    .replace(/`+([^`]*)`+/g, '$1')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(?<![\w*])\*([^*\n]+)\*(?![\w*])/g, '$1')
    .replace(/(?<![\w_])__([^_]+)__(?![\w_])/g, '$1')
    .replace(/(?<![\w_])_([^_\n]+)_(?![\w_])/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .trim()
}

/**
 * Walks the source line by line, tracking fenced code spans and the current
 * heading. Heading ids come from the same slugger `rehype-slug` uses, so
 * anchors generated here always resolve in the rendered document.
 */
export function scanLines(body: string): MarkdownLine[] {
  const lines = body.split(/\r?\n/)
  const slugger = new GithubSlugger()
  const result: MarkdownLine[] = []

  let fence: string | null = null
  let heading: string | null = null
  let headingId: string | null = null
  let headingLevel = 0

  lines.forEach((text, index) => {
    const lineNumber = index + 1

    if (fence) {
      const closes = new RegExp(`^\\s{0,3}${fence}{3,}\\s*$`).test(text)
      if (closes) fence = null
      result.push({ text, lineNumber, inCode: true, heading, headingId, headingLevel, isHeading: false })
      return
    }

    const open = FENCE_OPEN_RE.exec(text)
    if (open) {
      fence = open[1][0]
      result.push({ text, lineNumber, inCode: true, heading, headingId, headingLevel, isHeading: false })
      return
    }

    const match = HEADING_RE.exec(text)
    const isHeading = match !== null
    if (match) {
      headingLevel = match[1].length
      heading = stripInline(match[2]) || match[2].trim()
      headingId = slugger.slug(heading)
    }

    result.push({ text, lineNumber, inCode: false, heading, headingId, headingLevel, isHeading })
  })

  return result
}

/**
 * Plain text for a pre-scanned document, with code blocks dropped.
 * Taking already-scanned lines lets callers derive headings, word counts and
 * code-block counts from a single pass over the source.
 */
export function plainTextFromLines(lines: MarkdownLine[]): string {
  return lines
    .filter((line) => !line.inCode)
    .map((line) =>
      stripInline(
        line.text
          .replace(/^\s{0,3}#{1,6}\s+/, '')
          .replace(/^\s{0,3}>\s?/, '')
          .replace(/^\s{0,3}(?:[-*+]|\d+[.)])\s+/, '')
          .replace(/\|/g, ' '),
      ),
    )
    .filter((line) => line.length > 0)
    .join('\n')
}

/** Markdown → plain text, with code blocks dropped. */
export function stripMarkdown(source: string): string {
  return plainTextFromLines(scanLines(source))
}

/** Every heading in document order, already slugged. */
export function headingsFromLines(lines: MarkdownLine[]): TocHeading[] {
  const headings: TocHeading[] = []
  for (const line of lines) {
    if (!line.isHeading || !line.heading) continue
    headings.push({
      id: line.headingId ?? slugify(line.heading),
      text: line.heading,
      level: line.headingLevel,
      line: line.lineNumber,
    })
  }
  return headings
}

export function wordCount(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

/** Average adult reading speed, 220 words per minute. */
export function readingMinutes(text: string): number {
  const words = wordCount(text)
  if (words === 0) return 0
  return Math.max(1, Math.round(words / 220))
}

export function readingTimeLabel(text: string): string {
  const minutes = readingMinutes(text)
  if (minutes === 0) return 'Empty'
  if (minutes < 60) return `${minutes} min read`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} h read` : `${hours} h ${rest} min read`
}

/** Counts fenced code blocks, shown in the document metadata bar. */
export function countCodeBlocksFromLines(lines: MarkdownLine[]): number {
  let inside = false
  let count = 0
  for (const line of lines) {
    if (line.inCode) {
      if (!inside) {
        inside = true
        count += 1
      }
    } else {
      inside = false
    }
  }
  return count
}

/** The first level-1 heading, used as a fallback document title. */
export function firstHeadingFromLines(lines: MarkdownLine[]): string | null {
  for (const line of lines) {
    if (line.isHeading && line.headingLevel === 1) return line.heading
  }
  return null
}
