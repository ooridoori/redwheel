'use client'

/**
 * A hover explanation for a derived figure.
 *
 * Rendered into `document.body` so the table's overflow cannot clip it, and
 * styled as a small dark bubble rather than the browser's native `title`.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cx } from './primitives'

export function InfoTip({ text }: { text: string }) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const tooltipId = useId()
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number; below: boolean } | null>(null)

  useEffect(() => {
    if (!open) return

    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      setCoords({
        top: rect.top < 56 ? rect.bottom : rect.top,
        left: rect.left + rect.width / 2,
        below: rect.top < 56,
      })
    }

    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={text}
        aria-describedby={open ? tooltipId : undefined}
        className="inline-flex shrink-0 text-ink-faint transition-colors hover:text-ink-muted"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(event) => event.stopPropagation()}
      >
        <svg
          width={12}
          height={12}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="8" cy="8" r="5.5" />
          <path d="M8 7.5v3M8 5.2v.3" />
        </svg>
      </button>

      {open &&
        coords &&
        createPortal(
          <div
            id={tooltipId}
            role="tooltip"
            style={{
              top: coords.top,
              left: coords.left,
              transform: coords.below
                ? 'translate(-50%, 8px)'
                : 'translate(-50%, calc(-100% - 8px))',
            }}
            className="pointer-events-none fixed z-[80] max-w-[260px]"
          >
            <div className="relative rounded-lg bg-[#2a2e38] px-2.5 py-1.5 text-[12px] leading-snug text-ink shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
              {text}
              <span
                className={cx(
                  'absolute left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-[#2a2e38]',
                  coords.below ? '-top-1' : '-bottom-1',
                )}
              />
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
