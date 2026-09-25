import { useMemo, useState } from 'react'
import { useVault } from '../state/VaultContext'
import { cx, sortByName } from '../lib/util'
import { Modal } from './Modal'
import { IconFolder, IconLayers } from './Icons'
import { IconCheck } from './Icons'

export interface MoveDialogProps {
  title: string
  currentFolderId: string | null
  /** Folder ids that cannot be selected (the item itself and its descendants). */
  disabledIds?: string[]
  onMove: (folderId: string | null) => void
  onClose: () => void
}

interface PickerRow {
  id: string | null
  name: string
  depth: number
  disabled: boolean
}

/** A flattened folder picker — easier to scan than another nested tree. */
export function MoveDialog({
  title,
  currentFolderId,
  disabledIds = [],
  onMove,
  onClose,
}: MoveDialogProps): React.JSX.Element {
  const { folders } = useVault()
  const [selected, setSelected] = useState<string | null>(currentFolderId)

  const rows = useMemo<PickerRow[]>(() => {
    const out: PickerRow[] = [{ id: null, name: 'Library (root)', depth: 0, disabled: false }]
    const walk = (parentId: string | null, depth: number) => {
      if (depth > 12) return
      for (const folder of sortByName(folders.filter((candidate) => candidate.parentId === parentId))) {
        out.push({
          id: folder.id,
          name: folder.name,
          depth: depth + 1,
          disabled: disabledIds.includes(folder.id),
        })
        walk(folder.id, depth + 1)
      }
    }
    walk(null, 0)
    return out
  }, [folders, disabledIds])

  return (
    <Modal
      title={title}
      description="Pick the destination folder."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={selected === currentFolderId}
            onClick={() => {
              onMove(selected)
              onClose()
            }}
          >
            <IconCheck size={14} />
            Move here
          </button>
        </>
      }
    >
      <div className="folder-picker">
        {rows.map((row) => (
          <button
            key={row.id ?? 'root'}
            type="button"
            className={cx('folder-picker__item', selected === row.id && 'folder-picker__item--active')}
            style={{ paddingLeft: 9 + row.depth * 16 }}
            disabled={row.disabled}
            onClick={() => setSelected(row.id)}
          >
            {row.id === null ? <IconLayers size={14} /> : <IconFolder size={14} />}
            <span className="truncate">{row.name}</span>
            {row.id === currentFolderId ? (
              <span className="badge" style={{ marginLeft: 'auto' }}>
                current
              </span>
            ) : null}
            {row.disabled ? (
              <span className="badge muted" style={{ marginLeft: 'auto' }}>
                not allowed
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </Modal>
  )
}
