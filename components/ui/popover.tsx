'use client'

/**
 * A pill that opens a panel beneath it, as Mercury's filter row does.
 *
 * Exists so the planner stays a single screen: controls that would otherwise
 * need their own column live behind a trigger instead.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDownIcon } from './icons'
import { cx } from './primitives'

export function Popover({
  label,
  children,
  badge,
  align = 'left',
  width = 380,
}: {
  label: ReactNode
  children: ReactNode | ((close: () => void) => ReactNode)
  /** A dot or count shown on the trigger, for unapplied changes. */
  badge?: 'dot' | null
  align?: 'left' | 'right'
  width?: number
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cx(
          'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] transition-colors',
          open
            ? 'border-accent/50 bg-accent-soft text-ink'
            : 'border-edge bg-raised text-ink-muted hover:border-edge-strong hover:text-ink',
        )}
      >
        {label}
        {badge === 'dot' && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
        <ChevronDownIcon className={cx('transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          style={{ width }}
          className={cx(
            'absolute top-[calc(100%+6px)] z-50 rounded-xl border border-edge-strong bg-surface p-4 shadow-2xl',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  )
}
