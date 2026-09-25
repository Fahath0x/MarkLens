import { useCallback, useMemo, useState } from 'react'
import type { DragEvent as ReactDragEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { Doc } from '../lib/types'
import { buildDocMetaList, buildTree, folderSubtreeIds } from '../lib/vault'
import type { TreeNode } from '../lib/vault'
import { useVault } from '../state/VaultContext'
import { useToast } from '../state/ToastContext'
import { classifyStatus } from '../lib/frontmatter'
import { cx, pluralise } from '../lib/util'
import { ContextMenu } from './ContextMenu'
import type { MenuItem } from './ContextMenu'
import { ConfirmDialog } from './Modal'
import { MoveDialog } from './MoveDialog'
import {
  IconBookmarkFilled,
  IconChevronRight,
  IconDownload,
  IconEdit,
  IconFile,
  IconFolder,
  IconFolderOpen,
  IconMove,
  IconMore,
  IconNote,
  IconPlus,
  IconTrash,
} from './Icons'

export const DRAG_MIME = 'application/x-mdkm-doc'

export interface LibraryTreeProps {
  selectedDocId: string | null
  expanded: Set<string>
  onToggleExpanded: (folderId: string) => void
  onOpenDoc: (docId: string) => void
  onOpenEditor: (docId: string) => void
}

interface RenameState {
  kind: 'doc' | 'folder'
  id: string
  value: string
}

interface CreateState {
  kind: 'doc' | 'folder'
  parentId: string | null
  value: string
}

type MoveState =
  | { kind: 'doc'; id: string; name: string; folderId: string | null }
  | { kind: 'folder'; id: string; name: string; folderId: string | null }

export function LibraryTree({
  selectedDocId,
  expanded,
  onToggleExpanded,
  onOpenDoc,
  onOpenEditor,
}: LibraryTreeProps): React.JSX.Element {
  const vault = useVault()
  const toast = useToast()
  const { docs, folders, bookmarks, notes, createDoc, createFolder } = vault

  const [menu, setMenu] = useState<{ x: number; y: number; node: TreeNode } | null>(null)
  const [renaming, setRenaming] = useState<RenameState | null>(null)
  const [creating, setCreating] = useState<CreateState | null>(null)
  const [moving, setMoving] = useState<MoveState | null>(null)
  const [confirming, setConfirming] = useState<{ kind: 'doc' | 'folder'; id: string; name: string; extra?: string } | null>(null)
  const [dropTarget, setDropTarget] = useState<string | 'root' | null>(null)
  const [dragging, setDragging] = useState(false)

  const tree = useMemo(() => buildTree(folders, docs), [folders, docs])
  const metas = useMemo(() => buildDocMetaList(docs, folders), [docs, folders])

  const commitRename = useCallback(
    async (state: RenameState) => {
      setRenaming(null)
      const value = state.value.trim()
      if (!value) return
      if (state.kind === 'doc') await vault.renameDoc(state.id, value)
      else await vault.renameFolder(state.id, value)
    },
    [vault],
  )

  const commitCreate = useCallback(
    async (state: CreateState) => {
      const value = state.value.trim()
      setCreating(null)
      if (!value) return
      if (state.kind === 'folder') {
        await createFolder(value, state.parentId)
        if (state.parentId) onToggleExpanded(state.parentId)
        toast.notify(`Folder “${value}” created`, { tone: 'success', duration: 2400 })
        return
      }
      const doc = await createDoc({ name: value, folderId: state.parentId })
      if (state.parentId) onToggleExpanded(state.parentId)
      onOpenEditor(doc.id)
    },
    [createDoc, createFolder, onOpenEditor, onToggleExpanded, toast],
  )

  const startCreate = useCallback((kind: 'doc' | 'folder', parentId: string | null) => {
    if (parentId) onToggleExpanded(parentId)
    setCreating({ kind, parentId, value: '' })
  }, [onToggleExpanded])

  const handleDropOn = useCallback(
    (event: ReactDragEvent, folderId: string | null) => {
      event.preventDefault()
      event.stopPropagation()
      setDropTarget(null)
      const docId = event.dataTransfer.getData(DRAG_MIME)
      if (!docId) return
      void vault.moveDoc(docId, folderId)
      const doc = docs.find((candidate) => candidate.id === docId)
      toast.notify(`Moved ${doc?.name ?? 'document'}`, { duration: 2000 })
      if (folderId) onToggleExpanded(folderId)
    },
    [docs, onToggleExpanded, toast, vault],
  )

  const allowDrop = (event: ReactDragEvent) => {
    if (!event.dataTransfer.types.includes(DRAG_MIME)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  const menuItems = (node: TreeNode): MenuItem[] => {
    if (node.kind === 'folder') {
      return [
        { label: 'New note here', icon: <IconFile size={14} />, onSelect: () => startCreate('doc', node.id) },
        { label: 'New subfolder', icon: <IconFolder size={14} />, onSelect: () => startCreate('folder', node.id) },
        {
          label: 'Rename',
          icon: <IconEdit size={14} />,
          separatorBefore: true,
          onSelect: () => setRenaming({ kind: 'folder', id: node.id, value: node.name }),
        },
        {
          label: 'Move to…',
          icon: <IconMove size={14} />,
          onSelect: () => setMoving({ kind: 'folder', id: node.id, name: node.name, folderId: node.folder?.parentId ?? null }),
        },
        {
          label: 'Delete folder',
          icon: <IconTrash size={14} />,
          danger: true,
          separatorBefore: true,
          onSelect: () =>
            setConfirming({
              kind: 'folder',
              id: node.id,
              name: node.name,
              extra: `${pluralise(node.docCount, 'document')} inside will also be deleted.`,
            }),
        },
      ]
    }

    const doc = node.doc as Doc
    return [
      { label: 'Open', icon: <IconFile size={14} />, onSelect: () => onOpenDoc(doc.id) },
      { label: 'Edit', icon: <IconEdit size={14} />, onSelect: () => onOpenEditor(doc.id) },
      {
        label: 'Rename',
        icon: <IconEdit size={14} />,
        separatorBefore: true,
        onSelect: () => setRenaming({ kind: 'doc', id: doc.id, value: doc.name }),
      },
      { label: 'Duplicate', icon: <IconPlus size={14} />, onSelect: () => void vault.duplicateDoc(doc.id) },
      {
        label: 'Move to…',
        icon: <IconMove size={14} />,
        onSelect: () => setMoving({ kind: 'doc', id: doc.id, name: doc.name, folderId: doc.folderId }),
      },
      {
        label: 'Download .md',
        icon: <IconDownload size={14} />,
        separatorBefore: true,
        onSelect: () => {
          const blob = new Blob([doc.content], { type: 'text/markdown;charset=utf-8' })
          const url = URL.createObjectURL(blob)
          const anchor = document.createElement('a')
          anchor.href = url
          anchor.download = doc.name
          anchor.click()
          setTimeout(() => URL.revokeObjectURL(url), 2000)
        },
      },
      {
        label: 'Delete',
        icon: <IconTrash size={14} />,
        danger: true,
        onSelect: () => setConfirming({ kind: 'doc', id: doc.id, name: doc.name }),
      },
    ]
  }

  const renderInlineInput = (kind: 'doc' | 'folder', depth: number) => (
    <div key={`create-${kind}`} className="tree__row" style={{ paddingLeft: 6 + depth * 13 }}>
      <span className="tree__toggle" aria-hidden="true" />
      <span className="tree__icon">{kind === 'folder' ? <IconFolder size={14} /> : <IconFile size={14} />}</span>
      <input
        className="tree__rename"
        autoFocus
        placeholder={kind === 'folder' ? 'Folder name' : 'note.md'}
        value={creating?.value ?? ''}
        onChange={(event) => setCreating((state) => (state ? { ...state, value: event.target.value } : state))}
        onBlur={() => creating && void commitCreate(creating)}
        onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            if (creating) void commitCreate(creating)
          }
          if (event.key === 'Escape') setCreating(null)
        }}
      />
    </div>
  )

  const renderNodes = (nodes: TreeNode[], depth: number): React.ReactNode =>
    nodes.map((node) => {
      if (node.kind === 'folder') {
        const isOpen = expanded.has(node.id)
        const isRenaming = renaming?.kind === 'folder' && renaming.id === node.id
        const hasChildren = node.children.length > 0
        return (
          <div key={node.id}>
            <div
              className={cx(
                'tree__row',
                'tree__row--folder',
                isOpen && 'tree__row--open',
                dropTarget === node.id && 'tree__row--drop',
              )}
              style={{ paddingLeft: 4 + depth * 13 }}
              onClick={() => onToggleExpanded(node.id)}
              onDragOver={(event) => {
                allowDrop(event)
                setDropTarget(node.id)
              }}
              onDragLeave={() => setDropTarget((current) => (current === node.id ? null : current))}
              onDrop={(event) => handleDropOn(event, node.id)}
              onContextMenu={(event) => {
                event.preventDefault()
                setMenu({ x: event.clientX, y: event.clientY, node })
              }}
            >
              <button
                type="button"
                className={cx('tree__toggle', isOpen && 'tree__toggle--open')}
                onClick={(event) => {
                  event.stopPropagation()
                  onToggleExpanded(node.id)
                }}
                aria-label={isOpen ? 'Collapse folder' : 'Expand folder'}
              >
                {hasChildren || isOpen ? <IconChevronRight size={13} /> : <span style={{ width: 13 }} />}
              </button>
              <span className="tree__icon">{isOpen ? <IconFolderOpen size={14} /> : <IconFolder size={14} />}</span>
              {isRenaming ? (
                <input
                  className="tree__rename"
                  autoFocus
                  value={renaming.value}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => setRenaming({ ...renaming, value: event.target.value })}
                  onBlur={() => void commitRename(renaming)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void commitRename(renaming)
                    }
                    if (event.key === 'Escape') setRenaming(null)
                  }}
                />
              ) : (
                <>
                  <span className="tree__label" title={node.name}>
                    {node.name}
                  </span>
                  <span className="tree__meta">{node.docCount}</span>
                  <span className="tree__actions">
                    <button
                      type="button"
                      className="btn btn--ghost btn--icon btn--sm"
                      title="New note in this folder"
                      onClick={(event) => {
                        event.stopPropagation()
                        startCreate('doc', node.id)
                      }}
                    >
                      <IconPlus size={13} />
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--icon btn--sm"
                      title="More actions"
                      onClick={(event) => {
                        event.stopPropagation()
                        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
                        setMenu({ x: rect.right, y: rect.bottom + 4, node })
                      }}
                    >
                      <IconMore size={13} />
                    </button>
                  </span>
                </>
              )}
            </div>

            {isOpen ? (
              <div className="tree__children">
                {creating && creating.parentId === node.id ? renderInlineInput(creating.kind, depth + 1) : null}
                {renderNodes(node.children, depth + 1)}
                {node.children.length === 0 && !(creating && creating.parentId === node.id) ? (
                  <p className="tree__empty" style={{ paddingLeft: 6 + (depth + 1) * 13 }}>
                    Empty folder
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        )
      }

      const doc = node.doc as Doc
      const meta = metas.get(doc.id)
      const flagged = bookmarks.some((bookmark) => bookmark.docId === doc.id)
      const noted = notes.some((note) => note.docId === doc.id)
      const isRenaming = renaming?.kind === 'doc' && renaming.id === doc.id
      const status = classifyStatus(meta?.status ?? null)

      return (
        <div
          key={node.id}
          className={cx('tree__row', selectedDocId === doc.id && 'tree__row--active')}
          style={{ paddingLeft: 4 + depth * 13 }}
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData(DRAG_MIME, doc.id)
            event.dataTransfer.effectAllowed = 'move'
            setDragging(true)
          }}
          onDragEnd={() => {
            setDragging(false)
            setDropTarget(null)
          }}
          onClick={() => onOpenDoc(doc.id)}
          onDoubleClick={() => onOpenEditor(doc.id)}
          onContextMenu={(event) => {
            event.preventDefault()
            setMenu({ x: event.clientX, y: event.clientY, node })
          }}
          title={meta?.path}
        >
          <span className="tree__toggle" aria-hidden="true" />
          <span className="tree__icon">
            <IconFile size={14} />
          </span>
          {isRenaming ? (
            <input
              className="tree__rename"
              autoFocus
              value={renaming.value}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => setRenaming({ ...renaming, value: event.target.value })}
              onBlur={() => void commitRename(renaming)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void commitRename(renaming)
                }
                if (event.key === 'Escape') setRenaming(null)
              }}
            />
          ) : (
            <>
              <span className="tree__label">
                {doc.name.replace(/\.(md|markdown|mdown|mkd)$/i, '')}
              </span>
              <span className="tree__flag">
                {status === 'completed' ? <IconFile size={11} /> : null}
                {noted ? <IconNote size={11} /> : null}
                {flagged ? <IconBookmarkFilled size={11} /> : null}
              </span>
              <span className="tree__actions">
                <button
                  type="button"
                  className="btn btn--ghost btn--icon btn--sm"
                  title="More actions"
                  onClick={(event) => {
                    event.stopPropagation()
                    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
                    setMenu({ x: rect.right, y: rect.bottom + 4, node })
                  }}
                >
                  <IconMore size={13} />
                </button>
              </span>
            </>
          )}
        </div>
      )
    })

  return (
    <>
      <div className="tree">
        {/* Only shown while a document is being dragged inside the tree. */}
        {dragging ? (
          <div
            className={cx('tree__row', dropTarget === 'root' && 'tree__row--drop')}
            style={{ paddingLeft: 4, color: 'var(--text-3)', fontSize: 12 }}
            onDragOver={(event) => {
              allowDrop(event)
              setDropTarget('root')
            }}
            onDragLeave={() => setDropTarget((current) => (current === 'root' ? null : current))}
            onDrop={(event) => handleDropOn(event, null)}
          >
            <span className="tree__toggle" aria-hidden="true" />
            <span className="tree__label">Drop here to move to the library root</span>
          </div>
        ) : null}

        {creating && creating.parentId === null ? renderInlineInput(creating.kind, 0) : null}
        {tree.length === 0 && !creating ? (
          <p className="tree__empty">No documents yet — import a folder to get started.</p>
        ) : null}
        {renderNodes(tree, 0)}
      </div>

      {menu ? (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.node)} onClose={() => setMenu(null)} />
      ) : null}

      {moving ? (
        <MoveDialog
          title={moving.kind === 'folder' ? `Move “${moving.name}”` : `Move “${moving.name}”`}
          currentFolderId={moving.folderId}
          disabledIds={
            moving.kind === 'folder'
              ? folderSubtreeIds(folders, moving.id)
              : []
          }
          onMove={(folderId) => {
            if (moving.kind === 'folder') void vault.moveFolder(moving.id, folderId)
            else void vault.moveDoc(moving.id, folderId)
            toast.notify(`Moved ${moving.name}`, { tone: 'success', duration: 2200 })
          }}
          onClose={() => setMoving(null)}
        />
      ) : null}

      {confirming ? (
        <ConfirmDialog
          title={confirming.kind === 'folder' ? `Delete “${confirming.name}”?` : `Delete “${confirming.name}”?`}
          description={
            confirming.kind === 'folder'
              ? `${confirming.extra ?? ''} Its notes and bookmarks will be removed too. This cannot be undone.`
              : 'Its notes and bookmarks will be removed too. This cannot be undone.'
          }
          confirmLabel="Delete"
          destructive
          onConfirm={() => {
            if (confirming.kind === 'folder') void vault.deleteFolder(confirming.id)
            else void vault.deleteDoc(confirming.id)
            toast.notify(`Deleted ${confirming.name}`, { duration: 2600 })
          }}
          onClose={() => setConfirming(null)}
        />
      ) : null}
    </>
  )
}
