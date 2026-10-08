import { Select as S } from '@base-ui/react/select'
import { CheckIcon, ChevronDownIcon } from './icons'
import { usePortal } from './portal'

export function Select<T extends string>({ value, options, onChange, placeholder, ...aria }: {
  value: T | ''; options: readonly T[]; onChange(v: T): void; placeholder?: string; 'aria-labelledby'?: string; 'aria-label'?: string
}) {
  const container = usePortal()
  return (
    <S.Root value={value || null} onValueChange={(v: T | null) => { if (v) onChange(v) }}>
      <S.Trigger className="field" {...aria}>
        <S.Value className="field-value" placeholder={placeholder} />
        <ChevronDownIcon />
      </S.Trigger>
      <S.Portal container={container}>
        <S.Positioner className="pop-positioner" sideOffset={4} alignItemWithTrigger={false}>
          <S.Popup className="pop">
            <S.List className="menu">
              {options.map(o => (
                <S.Item key={o} value={o} className="menu-item">
                  <S.ItemIndicator><CheckIcon /></S.ItemIndicator>
                  <S.ItemText style={{ gridColumn: 2 }}>{o}</S.ItemText>
                </S.Item>
              ))}
            </S.List>
          </S.Popup>
        </S.Positioner>
      </S.Portal>
    </S.Root>
  )
}
