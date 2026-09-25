import JSZip from 'jszip'
import type { Bookmark, Doc, Folder, Note, ReadingProgress } from './types'
import type { DocMeta } from './vault'
import { docPath } from './vault'
import { splitFrontmatter } from './frontmatter'
import { downloadBlob, stripExtension, toSafeFileName } from './util'

/**
 * Exporting.
 *
 * HTML and PDF exports reuse the *already rendered* article markup, so what you
 * export is exactly what you read — syntax highlighting, tables and all. The
 * stylesheet is harvested from the live document rather than duplicated, which
 * keeps the theme in one place; PDF goes through the browser's own print
 * pipeline (Save as PDF) driven by the `@media print` rules in the theme.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** All CSS currently applied to the page, in cascade order. */
export function collectStyles(): string {
  const chunks: string[] = []
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) chunks.push(rule.cssText)
    } catch {
      // Cross-origin stylesheets cannot be read; skip them.
    }
  }
  return chunks.join('\n')
}

export interface StandaloneHtmlOptions {
  title: string
  articleHtml: string
  theme: 'light' | 'dark'
  /** Extra markup injected above the article, e.g. a metadata strip. */
  headerHtml?: string
  css?: string
}

export function buildStandaloneHtml(options: StandaloneHtmlOptions): string {
  const { title, articleHtml, theme, headerHtml = '', css = collectStyles() } = options
  const printed = new Date().toLocaleString()

  return `<!doctype html>
<html lang="en" data-theme="${theme}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
${css}

/* --- standalone document chrome ------------------------------------- */
html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text-1); }
body { font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
.export-page { max-width: 860px; margin: 0 auto; padding: 56px 24px 120px; }
.export-footer { max-width: 860px; margin: 0 auto; padding: 0 24px 64px; color: var(--text-3); font-size: 12px; }
.export-header { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 32px; }
@media print {
  .export-page { padding: 0; max-width: none; }
  [data-export-remove] { display: none !important; }
  .export-footer { display: none; }
}
</style>
</head>
<body>
<main class="export-page">
${headerHtml}
<article class="markdown-body">${articleHtml}</article>
</main>
<footer class="export-footer">Exported from Markdown Reader &amp; Knowledge Manager on ${escapeHtml(printed)}.</footer>
</body>
</html>`
}

/**
 * Clones the rendered article and strips anything interactive, so the exported
 * file has no copy buttons or bookmark toggles baked in.
 */
export function articleHtmlFrom(element: HTMLElement | null): string {
  if (!element) return ''
  const clone = element.cloneNode(true) as HTMLElement
  clone.querySelectorAll('[data-export-remove]').forEach((node) => node.remove())
  return clone.innerHTML
}

export function exportDocHtml(meta: DocMeta, articleHtml: string, theme: 'light' | 'dark'): void {
  const chips: string[] = []
  if (meta.category) chips.push(`<span class="chip">${escapeHtml(meta.category)}</span>`)
  if (meta.difficulty) chips.push(`<span class="chip">${escapeHtml(meta.difficulty)}</span>`)
  if (meta.status) chips.push(`<span class="chip">${escapeHtml(meta.status)}</span>`)
  for (const tag of meta.tags) chips.push(`<span class="chip">#${escapeHtml(tag)}</span>`)

  const html = buildStandaloneHtml({
    title: meta.title,
    articleHtml,
    theme,
    headerHtml: chips.length > 0 ? `<div class="export-header">${chips.join('')}</div>` : '',
  })

  downloadBlob(`${toSafeFileName(meta.title)}.html`, new Blob([html], { type: 'text/html;charset=utf-8' }))
}

/** Opens the browser print dialog; "Save as PDF" is the PDF export. */
export function printDocument(): void {
  window.print()
}

export function exportDocMarkdown(doc: Doc): void {
  downloadBlob(
    `${toSafeFileName(stripExtension(doc.name))}.md`,
    new Blob([doc.content], { type: 'text/markdown;charset=utf-8' }),
  )
}

export function exportDocText(doc: Doc, plain: string, title: string): void {
  const header = `${title}\n${'='.repeat(Math.min(title.length, 60))}\n\n`
  downloadBlob(
    `${toSafeFileName(stripExtension(doc.name))}.txt`,
    new Blob([header + plain], { type: 'text/plain;charset=utf-8' }),
  )
}

export function exportBookmarks(bookmarks: Bookmark[], docs: Doc[]): void {
  const byId = new Map(docs.map((doc) => [doc.id, doc]))
  const lines = ['# Bookmarks', '']
  for (const bookmark of bookmarks) {
    const doc = byId.get(bookmark.docId)
    const label = doc ? stripExtension(doc.name) : 'missing document'
    lines.push(`- **${label} › ${bookmark.headingText}**  _(saved ${new Date(bookmark.createdAt).toLocaleDateString()})_`)
  }
  downloadBlob('bookmarks.md', new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' }))
}

/** Turns every note into a Markdown digest — useful as a revision sheet. */
export function exportNotes(notes: Note[], docs: Doc[]): void {
  const byId = new Map(docs.map((doc) => [doc.id, doc]))
  const grouped = new Map<string, Note[]>()
  for (const note of notes) {
    const list = grouped.get(note.docId) ?? []
    list.push(note)
    grouped.set(note.docId, list)
  }

  const lines = ['# My notes', '', `_Exported ${new Date().toLocaleString()}_`, '']
  for (const [docId, list] of grouped) {
    const doc = byId.get(docId)
    lines.push(`## ${doc ? stripExtension(doc.name) : 'Missing document'}`, '')
    for (const note of list) {
      lines.push(`### ${note.headingText ?? 'Whole document'}`, '', note.body, '')
    }
  }

  downloadBlob('my-notes.md', new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' }))
}

export interface VaultBackupOptions {
  docs: Doc[]
  folders: Folder[]
  bookmarks: Bookmark[]
  notes: Note[]
  progress: ReadingProgress[]
}

/** Full backup: every Markdown file at its original path, plus a metadata side-car. */
export async function exportVaultZip(options: VaultBackupOptions): Promise<void> {
  const { docs, folders, bookmarks, notes, progress } = options
  const zip = new JSZip()

  for (const doc of docs) {
    zip.file(docPath(doc, folders) || doc.name, doc.content)
  }

  zip.file(
    '_meta/vault.json',
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        documents: docs.length,
        folders,
        bookmarks,
        notes,
        progress,
      },
      null,
      2,
    ),
  )

  const blob = await zip.generateAsync({ type: 'blob' })
  const stamp = new Date().toISOString().slice(0, 10)
  downloadBlob(`markdown-vault-${stamp}.zip`, blob)
}

/** A document's body with the front matter removed, for the .txt export. */
export function bodyWithoutFrontmatter(doc: Doc): string {
  return splitFrontmatter(doc.content).body
}
