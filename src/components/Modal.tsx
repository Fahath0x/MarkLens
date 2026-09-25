import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { cx } from '../lib/util'
import { IconClose } from './Icons'

export interface ModalProps {
  title: string
  description?: string
  children?: ReactNode
  footer?: ReactNode
  onClose: () => void
  wide?: boolean
}

export function Modal({ title, description, children, footer, onClose, wide }: ModalProps): React.JSX.Element {
  const overlay = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="modal-overlay no-print"
      ref={overlay}
      onMouseDown={(event) => {
        if (event.target === overlay.current) onClose()
      }}
    >
      <div className={cx('modal', wide && 'modal--wide')} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal__head">
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 className="modal__title">{title}</h2>
            {description ? <p className="modal__desc">{description}</p> : null}
          </div>
          <button
            type="button"
            className="btn btn--ghost btn--icon btn--sm"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <IconClose size={15} />
          </button>
        </div>
        {children ? <div className="modal__body">{children}</div> : null}
        {footer ? <div className="modal__foot">{footer}</div> : null}
      </div>
    </div>
  )
}

export interface PromptDialogProps {
  title: string
  description?: string
  placeholder?: string
  defaultValue?: string
  confirmLabel?: string
  onSubmit: (value: string) => void
  onClose: () => void
}

/** A single-field dialog, used instead of `window.prompt`. */
export function PromptDialog({
  title,
  description,
  placeholder,
  defaultValue = '',
  confirmLabel = 'Create',
  onSubmit,
  onClose,
}: PromptDialogProps): React.JSX.Element {
  const [value, setValue] = useState(defaultValue)
  const submit = () => {
    const trimmed = value.trim()
    if (trimmed) onSubmit(trimmed)
    onClose()
  }

  return (
    <Modal
      title={title}
      description={description}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={submit} disabled={value.trim().length === 0}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <input
        className="modal__field"
        autoFocus
        value={value}
        placeholder={placeholder}
        aria-label={title}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            submit()
          }
        }}
      />
      <div style={{ height: 12 }} />
    </Modal>
  )
}

export interface ConfirmDialogProps {
  title: string
  description?: string
  confirmLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel = 'Confirm',
  destructive = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps): React.JSX.Element {
  return (
    <Modal
      title={title}
      description={description}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={cx('btn', destructive ? 'btn--danger' : 'btn--primary')}
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    />
  )
}
