import { styleForType } from '../../services/sources/semble/connectionTypes'
import { Icon } from '../ui/Icon'

/** Line sample in a connection type's colour and dash pattern, optionally led by its icon. */
export function TypeSwatch({ type, width = 18, withIcon = false }: { type?: string; width?: number; withIcon?: boolean }) {
  const style = styleForType(type)
  const line = (
    <svg width={width} height="6" aria-hidden="true" className="shrink-0">
      <line x1="0" y1="3" x2={width} y2="3" stroke={style.colour} strokeWidth="2.5" strokeDasharray={style.dash} />
    </svg>
  )
  if (!withIcon) return line
  return (
    <span className="inline-flex shrink-0 items-center gap-1" style={{ color: style.colour }}>
      <Icon name={style.icon} size={15} />
      {line}
    </span>
  )
}
