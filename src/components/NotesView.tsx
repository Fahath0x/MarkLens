import { useMemo, useState } from 'react'
import { useVault } from '../state/VaultContext'
import { useToast } from '../state/ToastContext'
import { exportNotes } from '../lib/exporter'
import { formatDateTime, pluralise } from '../lib/util'
import { IconCheck, IconDownload, IconEdit, IconNote, IconTrash } from './Icons'

export interface NotesViewProps {
  onOpenDoc: (docId: string, headingId?: string | null) => void
}

interface EditingState {
  id: string
  body: string
}

export function NotesView({ onOpenDoc }: NotesViewProps): React.JSX.Element {
  const { notes, docs, metas, saveNote, deleteNote } = useVault()
  const toast = useToast()
  const [editing, setEditing] = useState<EditingState | null>(null)

  const grouped = useMemo(() => {
    const byDoc = new Map<string, typeof notes>()
    for (const note of notes) {
      const list = byDoc.get(note.docId) ?? []
      list.push(note)
      byDoc.set(note.docId, list)
    }
    return [...byDoc.entries()]
      .map(([docId, list]) => ({
        docId,
        list: [...list].sort((a, b) => b.updatedAt - a.updatedAt),
        newest: Math.max(...list.map((note) => note.updatedAt)),
      }))
      .sort((a, b) => b.newest - a.newest)
  }, [notes])

  if (notes.length === 0) {
    return (
      <div className="view-scroll">
        <div className="page">
          <div className="empty empty--tall">
            <span className="empty__art">
              <IconNote size={26} />
            </span>
            <h2 className="empty__title">No notes yet</h2>
            <p className="empty__text">
              Notes attach to a specific section or to a whole document, so you can capture “revise this
              tomorrow” right where the gap in your understanding is.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="view-scroll">
      <div className="page">
        <div className="page__head">
          <div>
            <h1 className="page__title">My notes</h1>
            <p className="page__sub">
              {pluralise(notes.length, 'note')} across {pluralise(grouped.length, 'document')}
            </p>
          </div>
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => {
              exportNotes(notes, docs)
              toast.notify('Notes exported as Markdown', { tone: 'success' })
            }}
          >
            <IconDownload size={13} />
            Export as Markdown
          </button>
        </div>

        {grouped.map((group) => {
          const meta = metas.get(group.docId)
          return (
            <section className="section" key={group.docId}>
              <div className="section__head">
                <button type="button" className="search-result__title" onClick={() => onOpenDoc(group.docId)}>
                  {meta?.title ?? 'Missing document'}
                </button>
                <span className="muted" style={{ fontSize: 12 }}>
                  {meta?.path ?? 'deleted'}
                </span>
              </div>

              {group.list.map((note) => (
                <div className="note-card" key={note.id}>
                  <div className="note-card__head">
                    {note.headingId ? (
                      <button
                        type="button"
                        className="note-card__where"
                        onClick={() => onOpenDoc(note.docId, note.headingId)}
                      >
                        <IconNote size={11} />
                        {note.headingText ?? 'Section'}
                      </button>
                    ) : (
                      <span className="note-card__where" style={{ color: 'var(--text-3)' }}>
                        <IconNote size={11} />
                        Whole document
                      </span>
                    )}
                    <span>· {formatDateTime(note.updatedAt)}</span>
                    <span className="note-card__actions">
                      <button
                        type="button"
                        className="btn btn--ghost btn--icon btn--sm"
                        title="Edit note"
                        onClick={() => setEditing({ id: note.id, body: note.body })}
                      >
                        <IconEdit size={13} />
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

                  {editing?.id === note.id ? (
                    <div className="stack">
                      <textarea
                        autoFocus
                        value={editing.body}
                        onChange={(event) => setEditing({ id: note.id, body: event.target.value })}
                        style={{
                          width: '100%',
                          minHeight: 90,
                          padding: '9px 11px',
                          borderRadius: 7,
                          border: '1px solid var(--border)',
                          background: 'var(--bg)',
                          fontFamily: 'var(--font-sans)',
                          fontSize: 13.5,
                          lineHeight: 1.6,
                          outline: 'none',
                        }}
                      />
                      <div className="row">
                        <button
                          type="button"
                          className="btn btn--primary btn--sm"
                          onClick={() => {
                            void saveNote({
                              id: note.id,
                              docId: note.docId,
                              headingId: note.headingId,
                              headingText: note.headingText,
                              body: editing.body,
                            })
                            setEditing(null)
                            toast.notify('Note updated', { tone: 'success', duration: 2000 })
                          }}
                        >
                          <IconCheck size={13} />
                          Save
                        </button>
                        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="note-card__body">{note.body}</div>
                  )}
                </div>
              ))}
            </section>
          )
        })}
      </div>
    </div>
  )
}
