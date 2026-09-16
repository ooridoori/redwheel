/** Inline 16px stroke icons. Hand-drawn rather than a dependency. */

type IconProps = { className?: string }

const base = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.4,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function ChevronDownIcon({ className }: IconProps) {
  return (
    <svg {...base} width={12} height={12} viewBox="0 0 12 12" className={className} aria-hidden>
      <path d="m3 4.75 3 3 3-3" />
    </svg>
  )
}

export function ChevronRightIcon({ className }: IconProps) {
  return (
    <svg {...base} width={12} height={12} viewBox="0 0 12 12" className={className} aria-hidden>
      <path d="m4.25 3 3 3-3 3" />
    </svg>
  )
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg {...base} width={12} height={12} viewBox="0 0 12 12" className={className} aria-hidden>
      <path d="M2.5 6.25 5 8.75 9.5 3.5" />
    </svg>
  )
}

export function RunIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M5.5 3.5v9l7-4.5z" />
    </svg>
  )
}

export function SpinnerIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden>
      <circle cx="8" cy="8" r="5.5" opacity="0.25" />
      <path d="M8 2.5a5.5 5.5 0 0 1 5.5 5.5" />
    </svg>
  )
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="m4 4 8 8M12 4l-8 8" />
    </svg>
  )
}

export function WarningIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M8 2.5 14 13H2z" />
      <path d="M8 6.5v3M8 11.2v.3" />
    </svg>
  )
}

export function InfoIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 7.5v3M8 5.2v.3" />
    </svg>
  )
}
