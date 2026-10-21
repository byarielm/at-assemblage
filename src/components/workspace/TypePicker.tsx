import { CONNECTION_TYPES } from '../../services/sources/semble/connectionTypes'
import { Icon } from '../ui/Icon'
import { TypeSwatch } from './TypeSwatch'

export type TypeRecommendation = { type: string; reason: string }

type Props = {
  name: string
  value: string
  onChange: (value: string) => void
  recommendation?: TypeRecommendation | null
  /** A stored value this app doesn't know, kept selectable so editing never silently changes it. */
  currentUnknown?: string
  legend?: string
  /** Matches the surrounding UI: form dialogs use a plain label, the inspector its section headings. */
  legendClassName?: string
}

/**
 * Single-column radio list of connection types: icon, edge swatch, label and
 * description per row, with a "Recommended" badge when there's a strong signal.
 */
export function TypePicker({
  name,
  value,
  onChange,
  recommendation,
  currentUnknown,
  legend = 'Relationship',
  legendClassName = 'mb-1.5 text-sm font-medium',
}: Props) {
  const options = [
    ...CONNECTION_TYPES,
    ...(currentUnknown !== undefined
      ? [{ value: currentUnknown, label: currentUnknown || 'Untyped', description: 'Current type (not one Semble defines)' }]
      : []),
  ]
  return (
    <fieldset>
      <legend className={legendClassName}>{legend}</legend>
      <div className="space-y-1">
        {options.map((t) => {
          const recommended = recommendation?.type === t.value
          return (
            <label
              key={t.value || '__untyped__'}
              className="flex cursor-pointer items-start gap-2.5 rounded-md border border-line px-2.5 py-1.5 has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
            >
              <input
                type="radio"
                name={name}
                value={t.value}
                checked={value === t.value}
                onChange={() => onChange(t.value)}
                className="mt-1 accent-[var(--color-accent)]"
              />
              <span className="mt-0.5">
                <TypeSwatch type={t.value || undefined} withIcon width={14} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] font-medium">
                  {t.label}
                  {recommended ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent px-1.5 py-px text-[10.5px] font-semibold text-accent-ink">
                      <Icon name="sparkle" size={11} />
                      Recommended
                    </span>
                  ) : null}
                </span>
                <span className="block text-[11.5px] leading-snug text-ink-3">{t.description}</span>
                {recommended ? <span className="block text-[11.5px] leading-snug text-accent">{recommendation.reason}</span> : null}
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
