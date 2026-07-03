import { useState } from 'react'

function formatWithCommas(raw: string): string {
  if (!raw) return ''
  const negative = raw.startsWith('-')
  const unsigned = negative ? raw.slice(1) : raw
  const [intPart, decPart] = unsigned.split('.')
  if (intPart === '') return raw
  const withCommas = Number(intPart).toLocaleString()
  const sign = negative ? '-' : ''
  return decPart !== undefined ? `${sign}${withCommas}.${decPart}` : `${sign}${withCommas}`
}

interface NumberInputProps {
  value: string
  onChange: (value: string) => void
  className?: string
  placeholder?: string
  disabled?: boolean
}

/** 편집 중에는 순수 숫자, 포커스를 벗어나면 천 단위 콤마를 붙여 보여주는 숫자 입력. */
function NumberInput({ value, onChange, className, placeholder, disabled }: NumberInputProps): React.JSX.Element {
  const [focused, setFocused] = useState(false)
  const display = focused ? value : formatWithCommas(value)

  return (
    <input
      type="text"
      inputMode="decimal"
      className={className}
      placeholder={placeholder}
      disabled={disabled}
      value={display}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        const raw = e.target.value.replace(/,/g, '')
        if (raw === '' || raw === '-' || /^-?\d*\.?\d*$/.test(raw)) {
          onChange(raw)
        }
      }}
    />
  )
}

export default NumberInput
