import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { IconAlert, IconCheckCircle, IconInfo, IconClose } from '../components/Icons'
import { createId } from '../lib/util'

export type ToastTone = 'info' | 'success' | 'error'

export interface ToastOptions {
  tone?: ToastTone
  action?: { label: string; run: () => void }
  /** Milliseconds before auto-dismiss; 0 keeps the toast until it is dismissed. */
  duration?: number
}

interface ToastRecord extends ToastOptions {
  id: string
  message: string
}

interface ToastContextValue {
  notify(message: string, options?: ToastOptions): void
  dismiss(id: string): void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [toasts, setToasts] = useState<ToastRecord[]>([])
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
    setToasts((previous) => previous.filter((toast) => toast.id !== id))
  }, [])

  const notify = useCallback<ToastContextValue['notify']>(
    (message, options = {}) => {
      const id = createId()
      const duration = options.duration ?? 4200
      setToasts((previous) => [...previous.slice(-3), { ...options, id, message }])
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        )
      }
    },
    [dismiss],
  )

  const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts no-print" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast--${toast.tone ?? 'info'}`}>
            <span className="toast__icon">
              {toast.tone === 'success' ? (
                <IconCheckCircle size={16} />
              ) : toast.tone === 'error' ? (
                <IconAlert size={16} />
              ) : (
                <IconInfo size={16} />
              )}
            </span>
            <span className="toast__text">{toast.message}</span>
            {toast.action ? (
              <button
                type="button"
                className="toast__action"
                onClick={() => {
                  toast.action?.run()
                  dismiss(toast.id)
                }}
              >
                {toast.action.label}
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn--ghost btn--icon btn--sm"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
            >
              <IconClose size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside <ToastProvider>')
  return context
}
