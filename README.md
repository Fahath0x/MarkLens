# Markdown Reader & Knowledge Manager

A local-first reading app for a folder of Markdown notes. Import your `.md` files (or a whole
folder tree, or a `.zip`), and get a library with full-text search, a generated table of contents,
per-section bookmarks and notes, reading progress you can resume, and HTML/PDF export.

Everything runs in the browser. There is no backend, no account, and no upload — your notes stay on
your machine.

```bash
npm install
npm run dev      # http://localhost:5173
```

```bash
npm run build    # typecheck + production bundle into dist/
npm run preview  # serve the built bundle
npm run typecheck
```

---

## What it does

**Reading**

- Renders CommonMark + GitHub-flavoured Markdown: tables, task lists, strikethrough, autolinks,
  images, blockquotes, footnotes-style links and fenced code.
- Syntax highlighting with automatic language detection for unlabelled blocks.
- Every code block gets a toolbar: language label, **copy**, **line numbers** and **wrap** toggles —
  per block, with reader-wide defaults in Settings.
- Heading anchors, plus a bookmark and note button that appear on hover, so an action always targets
  the exact section you are looking at.
- Reading column width and text size are adjustable; light, dark and system themes.
- Long code lines and wide tables scroll inside their own box, so the layout never stretches: the
  contents panel stays put next to a reader that shrinks to make room for it, and steps aside below
  1000px wide.

**Organising**

- Folder tree built from the paths in the files you import; folder and file counts in the sidebar.
- Create, rename, duplicate, move and delete files and folders. Drag a document onto a folder to
  move it, or onto the root drop zone to pull it back out.
- A built-in split-view editor (write / split / preview) with autosave, so you can keep notes in the
  same place you read them.

**Finding things**

- Full-text search across the entire library, including inside code blocks and front matter.
- Ranked results: title matches beat filename matches beat heading matches beat body matches.
- Snippets show the surrounding line, the section it lives in and the line number, with the match
  highlighted. Quoted phrases (`"osi model"`) match exactly.

**Learning features**

- **Table of contents** generated from the source, with hierarchical numbering (`1`, `1.1`, `1.2`)
  and the active section tracked as you scroll. Ids are generated with the same slugger the renderer
  uses, so every entry resolves.
- **Reading progress** per document: percentage, the section you were last on, and when you last
  opened it. Reopening a document scrolls back to where you stopped.
- **Bookmarks** for any section, collected in one place and jumpable.
- **Notes** attached to a heading or to a whole document, editable inline.
- **Dashboard** with totals (documents, completed, in progress, bookmarks, notes, words, reading
  time), "continue reading" with progress bars, recently opened, per-collection rollups and tags.
- **Front matter** is parsed and shown as metadata chips: `title`, `category`, `difficulty`,
  `status`, `source`/`course`, `tags`, `date_started`, `date_completed`. "Mark complete" writes the
  `status` field back into the file without disturbing the rest of the document.

**Getting content in and out**

- Import Markdown files, a folder (native directory picker where available, `webkitdirectory`
  elsewhere), a `.zip` archive, or just drag files or folders onto the window.
- Re-importing is safe: a file that already exists at the same path is updated, not duplicated, and
  files that have not changed are counted as unchanged.
- Export a document to a **standalone HTML** file (with the live stylesheet, so it looks identical),
  **PDF** via the browser print pipeline, **plain text**, or the original **`.md`**.
- Export bookmarks or all notes as a Markdown digest, and back up the whole vault as a `.zip`
  (every file at its original path plus a `_meta/vault.json` side-car with bookmarks, notes and
  progress).

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl/⌘ K` | Focus search |
| `Ctrl/⌘ P` | Command palette (documents + commands) |
| `Ctrl/⌘ B` | Bookmark the section you are reading |
| `Ctrl/⌘ F` | Find across all notes |
| `Ctrl/⌘ S` | Save immediately while editing (edits autosave anyway) |
| `Ctrl/⌘ Enter` | Save a note in the note composer |
| `Esc` | Close any dialog, menu or palette |

## How it is built

React 19 + TypeScript + Vite, with `react-markdown` (`remark-gfm`, `rehype-slug`,
`rehype-highlight`) for rendering, `github-slugger` for heading ids, `js-yaml` for front matter and
`jszip` for archive import/backup. Styling is hand-written CSS with design tokens — no UI framework.

```
src/
  lib/          pure logic, no React
    types.ts      domain types
    db.ts         promise wrapper over IndexedDB (+ in-memory fallback)
    markdown.ts   single-pass source scanner: headings, code fences, plain text
    frontmatter.ts YAML split / parse / upsert
    vault.ts      derived views: doc metadata, tree, paths, stats, collections
    search.ts     index + query engine with ranking and snippets
    importer.ts   files / folder drag-drop / zip → path-keyed entries, then merged
    exporter.ts   HTML, print, Markdown, text and vault backup
    util.ts       small shared helpers
  state/        React context providers (vault, import controller, toasts)
  components/   UI
  styles/       tokens + shell, Markdown typography, UI components
```

A few decisions worth calling out:

- **Derived data is derived.** `buildDocMeta` runs one pass over each document and produces the
  title, headings, tags, status, word count and code-block count together, so listing a few hundred
  notes stays cheap. The search index is built lazily on the first query and cached until documents
  change.
- **Writes are targeted.** Every mutation updates a ref synchronously (so rapid interactions never
  read stale state) and persists only the records it touched. Reading progress is batched and
  written on a debounce.
- **The renderer is isolated from scroll state.** The rendered Markdown tree is memoised on the
  document body alone, while the small per-heading bookmark buttons subscribe to the vault directly
  — so scrolling updates progress without re-rendering thousands of nodes.
- **Search reads what you see.** Each line is reduced to its rendered text before matching, so
  searching for `promise` does not match `**promise**` as syntax noise, but code blocks and front
  matter are still searched.
- **Exports reuse the live stylesheet**, harvested from `document.styleSheets`, so the exported HTML
  matches the reader instead of drifting from a duplicated copy.

## Deploying

The build is a fully static bundle — no server, no environment variables — so it runs on any static
host, and the free tier is enough.

**Vercel (recommended):** push the repo to GitHub, then import it at [vercel.com/new](https://vercel.com/new).
Vercel auto-detects Vite and fills in `npm run build` → `dist`; there is nothing else to configure.
Every push to the production branch deploys, and pull requests get preview URLs.

**Vercel CLI, without Git:**

```bash
npx vercel login
npx vercel --prod
```

`vercel.json` already contains what the deploy needs: a rewrite that serves `index.html` for unknown
paths (handy if routing is added later — Vercel checks real files first, so `/assets/*` is untouched),
immutable caching for the content-hashed bundle, and a few baseline security headers.

Two things worth knowing before you share the link:

- **Notes live in the browser, per origin.** A reader's library is their own IndexedDB on your
  deployed domain — nothing is uploaded, and nothing is shared between devices or browsers. Moving
  to a different custom domain later means everyone starts a fresh library (they can use
  **Settings → Back up the whole vault** and re-import the zip).
- **Clearing site data deletes the library.** That is the trade-off of being local-first; the zip
  backup is the safety net.

## Storage

| Store | Contents |
| --- | --- |
| IndexedDB `mdkm` → `docs` | document content and metadata |
| IndexedDB `mdkm` → `folders` | the folder tree |
| IndexedDB `mdkm` → `kv` | bookmarks, notes, and one record per document for reading progress |
| `localStorage` `mdkm:settings` | theme, reading width, text size, code display defaults |

Importing copies file contents into the browser; the original files on disk are never modified
(except that you can download an edited `.md` back out, or export the vault as a zip). Clearing site
data, or **Settings → Erase the library**, removes everything.

## Known limitations / next steps

- Setext headings (`Title` underlined with `===`) render but are not listed in the contents; use ATX
  (`##`) headings.
- Imported files are snapshots — editing a file on disk after import does not update the library.
  Re-import the folder to pick up changes, or edit in the app.
- No wikilink (`[[note]]`) or LaTeX rendering yet.
- The production bundle is a single ~830 kB chunk (≈250 kB gzipped); code-splitting the editor,
  the exporter and `highlight.js` languages is the obvious next win.
