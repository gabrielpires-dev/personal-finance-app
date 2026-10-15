export const cardColors = [
  { id: 'grafite', label: 'Grafite', from: '#0f172a', via: '#334155', to: '#64748b' },
  { id: 'esmeralda', label: 'Esmeralda', from: '#022c22', via: '#047857', to: '#34d399' },
  { id: 'oceano', label: 'Oceano', from: '#082f49', via: '#0369a1', to: '#38bdf8' },
  { id: 'violeta', label: 'Violeta', from: '#1e1b4b', via: '#5b21b6', to: '#c4b5fd' },
  { id: 'vinho', label: 'Vinho', from: '#4c0519', via: '#9f1239', to: '#fb7185' },
  { id: 'ambar', label: 'Âmbar', from: '#451a03', via: '#b45309', to: '#fbbf24' },
] as const

export type CardColorId = (typeof cardColors)[number]['id']

export const defaultCardColor: CardColorId = 'grafite'

export function resolveCardColor(color?: string | null): CardColorId {
  const match = cardColors.find((item) => item.id === color)
  return match?.id ?? defaultCardColor
}

export function cardGradient(color?: string | null) {
  const item = cardColors.find((entry) => entry.id === resolveCardColor(color)) ?? cardColors[0]
  return `linear-gradient(145deg, ${item.from} 0%, ${item.via} 48%, ${item.to} 100%)`
}
