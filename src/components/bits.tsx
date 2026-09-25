import type { ReactNode } from 'react'
import type { DocumentStatus } from '../lib/frontmatter'
import { cx } from '../lib/util'

/** Thin progress indicator used across the dashboard, lists and reader. */
export function ProgressBar({
  value,
  showLabel = true,
  className,
}: {
  value: number
  showLabel?: boolean
  className?: string
}): React.JSX.Element {
  const clamped = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div className={cx('progress', className)}>
      <div className="progress__track" role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100}>
        <div className="progress__fill" style={{ width: `${clamped}%` }} />
      </div>
      {showLabel ? <span className="progress__text">{clamped}%</span> : null}
    </div>
  )
}

const STATUS_LABEL: Record<DocumentStatus, string> = {
  completed: 'Completed',
  'in-progress': 'In progress',
  'not-started': 'Not started',
  other: 'Status',
}

const STATUS_TONE: Record<DocumentStatus, string> = {
  completed: 'chip--ok',
  'in-progress': 'chip--accent',
  'not-started': '',
  other: '',
}

export function StatusChip({ status }: { status: DocumentStatus }): React.JSX.Element {
  return (
    <span className={cx('chip', STATUS_TONE[status])}>
      <span aria-hidden="true">
        {status === 'completed' ? '✓' : status === 'in-progress' ? '◐' : '○'}
      </span>
      {STATUS_LABEL[status]}
    </span>
  )
}

export function Chip({
  children,
  tone,
  onClick,
  title,
}: {
  children: ReactNode
  tone?: 'accent' | 'ok' | 'warn'
  onClick?: () => void
  title?: string
}): React.JSX.Element {
  const className = cx('chip', tone === 'accent' && 'chip--accent', tone === 'ok' && 'chip--ok', tone === 'warn' && 'chip--warn', onClick && 'chip--button')
  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick} title={title}>
        {children}
      </button>
    )
  }
  return (
    <span className={className} title={title}>
      {children}
    </span>
  )
}

export function SectionHead({ title, action }: { title: string; action?: ReactNode }): React.JSX.Element {
  return (
    <div className="section__head">
      <h2 className="section__title">{title}</h2>
      {action}
    </div>
  )
}

export function Spinner(): React.JSX.Element {
  return (
    <div className="spin-center">
      <div className="spinner" role="status" aria-label="Loading" />
    </div>
  )
}
