import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'

export function Segmented<T extends string>({ label, labelledBy, value, options, onChange, size, ui }: {
  label?: string; labelledBy?: string; value: T; options: readonly T[]; onChange(v: T): void; size?: 'lg'; ui?: boolean
}) {
  const cls = ['seg', size === 'lg' && 'seg-lg', ui && 'seg-ui'].filter(Boolean).join(' ')
  return (
    <ToggleGroup
      className={cls} aria-label={label} aria-labelledby={labelledBy} value={[value]}
      // A single-choice group lets the pressed item be pressed off; that would leave nothing chosen.
      onValueChange={(v: string[]) => { if (v[0]) onChange(v[0] as T) }}
    >
      {options.map(o => <Toggle key={o} value={o} className="seg-item">{o}</Toggle>)}
    </ToggleGroup>
  )
}
