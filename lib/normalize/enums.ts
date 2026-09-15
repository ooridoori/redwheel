import type { BikeClass, Size, Trim } from '../domain'

export class EnumError extends Error {}

/** Accepts `road`/`Road` and `mtb`/`MTB`. */
export function toBikeClass(value: string): BikeClass {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'road') return 'road'
  if (normalized === 'mtb') return 'mtb'
  throw new EnumError(`Unknown bike class "${value}"`)
}

/** Accepts `base`/`Base` and `carbon`/`Carbon`, from columns named either Trim or Material. */
export function toTrim(value: string): Trim {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'base') return 'base'
  if (normalized === 'carbon') return 'carbon'
  throw new EnumError(`Unknown trim "${value}"`)
}

/** Accepts S/M/L in any case, from columns named either Size or Length. */
export function toSize(value: string): Size {
  const normalized = value.trim().toUpperCase()
  if (normalized === 'S' || normalized === 'M' || normalized === 'L') return normalized
  throw new EnumError(`Unknown size "${value}"`)
}

/** Accepts `true`/`false`, `Y`/`N`, and `Yes`/`No`. */
export function toBoolean(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'true' || normalized === 'y' || normalized === 'yes') return true
  if (normalized === 'false' || normalized === 'n' || normalized === 'no') return false
  throw new EnumError(`Unknown boolean "${value}"`)
}
