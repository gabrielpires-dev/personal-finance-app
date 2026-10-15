const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

export function formatCents(cents: number): string {
  return currency.format(cents / 100)
}

export function parseMoneyInput(value: string): number | null {
  const clean = value.trim().replace(/\s/g, '').replace(/R\$/gi, '')
  if (!clean || !/^\d[\d.,]*$/.test(clean)) return null

  let normalized = clean
  if (clean.includes(',')) {
    normalized = clean.replace(/\./g, '').replace(',', '.')
  } else if (/^\d+\.\d{1,2}$/.test(clean)) {
    normalized = clean
  } else if (/^\d+$/.test(clean)) {
    normalized = clean
  } else {
    return null
  }

  const amount = Number(normalized)
  if (!Number.isFinite(amount) || amount <= 0) return null
  const cents = Math.round(amount * 100)
  if (cents <= 0) return null
  return cents
}

export function maskMoney(value: string): string {
  const integerRaw = value.replace(/R\$/gi, '').split(',')[0] ?? ''
  const digits = integerRaw.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 12)
  if (!digits) return ''
  return Number(digits).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function centsToInput(cents: number): string {
  return (Math.abs(cents) / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function parseSignedMoneyInput(value: string): number | null {
  const clean = value.trim().replace(/\s/g, '').replace(/R\$/gi, '')
  if (!clean || clean === '-') return null
  const negative = clean.startsWith('-')
  const body = negative ? clean.slice(1) : clean
  if (/^0([.,]0{1,2})?$/.test(body)) return 0
  const positive = parseMoneyInput(body)
  if (positive == null) return null
  return negative ? -positive : positive
}
