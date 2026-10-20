import { styleForType } from '../../services/sources/semble/connectionTypes'

/** Line sample in a connection type's colour and dash pattern. */
export function TypeSwatch({ type, width = 18 }: { type?: string; width?: number }) {
  const style = styleForType(type)
  return (
    <svg width={width} height="6" aria-hidden="true" className="shrink-0">
      <line x1="0" y1="3" x2={width} y2="3" stroke={style.colour} strokeWidth="2.5" strokeDasharray={style.dash} />
    </svg>
  )
}
