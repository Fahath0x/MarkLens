import { useEffect, useMemo, useRef, useState } from 'react'
import type { TocHeading } from '../lib/types'
import { formatRelativeTime } from '../lib/util'
import { useVault } from '../state/VaultContext'
import { useToast } from '../state/ToastContext'
import { IconCheck, IconNote, IconPlus, IconTrash, IconClose } from './Icons'
import { SectionHead } from './bits'

export interface NoteTarget {
  headingId: string | null
  headingText: string | null
  /** Bumped on every request so repeated clicks on the same section re-open the composer. */
  nonce: number
}

export interface DocumentNotesProps {
  docId: string
  headings: TocHeading[]
  target: NoteTarget | null
  onJump: (headingId: string) => void
}

const WHOLE_DOC = '__document__'

/**
 * Notes belong either to a heading or to the whole document, so a note can
 * answer "what did I not understand in this section?" rather than only
 * "what did I think of this file?".
 */
export function DocumentNotes({ docId, headings, target, onJump }: DocumentNotesProps): React.JSX.Element {
  const { notes, saveNote, deleteNote } = useVault()
  const toast = useToast()

  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | undefined>(undefined)
  const [targetKey, setTargetKey] = useState<string>(WHOLE_DOC)
  const [body, setBody] = useState('')
  const textarea = useRef<HTMLTextAreaElement>(null)

  const docNotes = useMemo(
    () =>
      notes
        .filter((note) => note.docId === docId)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [notes, docId],
  )

  const openComposer = (headingId: string | null) => {
    const existing = docNotes.find((note) => note.headingId === headingId)
    setTargetKey(headingId ?? WHOLE_DOC)
    setBody(existing?.body ?? '')
    setEditingId(existing?.id)
    setOpen(true)
  }

  // A heading's note button asks the panel to open with that section selected.
  useEffect(() => {
    if (!target) return
    const existing = notes.find((note) => note.docId === docId && note.headingId === target.headingId)
    setTargetKey(target.headingId ?? WHOLE_DOC)
    setBody(existing?.body ?? '')
    setEditingId(existing?.id)
    setOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.nonce, docId])

  useEffect(() => {
    if (!open) return
    const node = textarea.current
    if (!node) return
    node.focus()
    node.setSelectionRange(node.value.length, node.value.length)
  }, [open, editingId])

  const handleSave = async () => {
    const headingId = targetKey === WHOLE_DOC ? null : targetKey
    const headingText =
      headingId === null ? null : (headings.find((heading) => heading.id === headingId)?.text ?? null)

    await saveNote({ id: editingId, docId, headingId, headingText, body })
    toast.notify(body.trim() ? 'Note saved' : 'Note removed', { tone: 'success' })
    setOpen(false)
    setBody('')
    setEditingId(undefined)
  }

  return (
    <section className="section" id="document-notes" data-export-remove>
      <SectionHead
        title={`Notes${docNotes.length > 0 ? ` (${docNotes.length})` : ''}`}
        action={
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => {
              if (open) {
                setOpen(false)
                return
              }
              openComposer(null)
            }}
          >
            {open ? <IconClose size={13} /> : <IconPlus size={13} />}
            {open ? 'Close' : 'Add note'}
          </button>
        }
      />

      {open ? (
        <div className="note-editor">
          <div className="note-editor__target">
            <span className="row" style={{ gap: 6 }}>
              <IconNote size={13} />
              Attached to
            </span>
            <select
              className="select"
              value={targetKey}
              onChange={(event) => {
                const next = event.target.value
                setTargetKey(next)
                const existing = docNotes.find(
                  (note) => note.headingId === (next === WHOLE_DOC ? null : next),
                )
                setEditingId(existing?.id)
                setBody(existing?.body ?? '')
              }}
            >
              <option value={WHOLE_DOC}>Whole document</option>
              {headings.map((heading) => (
                <option key={heading.id} value={heading.id}>
                  {heading.level <= 2 ? '' : '— '}
                  {heading.text}
                </option>
              ))}
            </select>
          </div>
          <textarea
            ref={textarea}
            value={body}
            placeholder="What do you want to remember about this section?"
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault()
                void handleSave()
              }
            }}
          />
          <div className="note-editor__actions">
            <button type="button" className="btn btn--primary btn--sm" onClick={() => void handleSave()}>
              <IconCheck size={13} />
              Save note
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                setOpen(false)
                setBody('')
                setEditingId(undefined)
              }}
            >
              Cancel
            </button>
            <span className="muted" style={{ fontSize: 11.5, marginLeft: 'auto' }}>
              <span className="kbd">Ctrl</span> + <span className="kbd">Enter</span> to save
            </span>
          </div>
        </div>
      ) : null}

      {docNotes.length === 0 && !open ? (
        <p className="muted" style={{ fontSize: 13 }}>
          No notes on this document yet. Hover a heading and click the note icon to attach one to a
          specific section.
        </p>
      ) : null}

      {docNotes.map((note) => (
        <div key={note.id} className="note-card">
          <div className="note-card__head">
            {note.headingId ? (
              <button
                type="button"
                className="note-card__where"
                onClick={() => onJump(note.headingId as string)}
                title="Jump to this section"
              >
                <IconNote size={11} />
                {note.headingText}
              </button>
            ) : (
              <span className="note-card__where" style={{ color: 'var(--text-3)' }}>
                <IconNote size={11} />
                Whole document
              </span>
            )}
            <span>· updated {formatRelativeTime(note.updatedAt)}</span>
            <span className="note-card__actions">
              <button
                type="button"
                className="btn btn--ghost btn--icon btn--sm"
                title="Edit note"
                onClick={() => openComposer(note.headingId)}
              >
                <IconNote size={13} />
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--icon btn--sm"
                title="Delete note"
                onClick={() => void deleteNote(note.id)}
              >
                <IconTrash size={13} />
              </button>
            </span>
          </div>
          <div className="note-card__body">{note.body}</div>
        </div>
      ))}
    </section>
  )
}
