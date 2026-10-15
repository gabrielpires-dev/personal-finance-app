export interface Institution {
  id: string
  name: string
  color: string
  ink: string
  mark: string
}

const catalog: Institution[] = [
  { id: 'banco-do-brasil', name: 'Banco do Brasil', color: '#f7d117', ink: '#003882', mark: 'BB' },
  { id: 'bmg', name: 'BMG', color: '#ff6a00', ink: '#ffffff', mark: 'BMG' },
  { id: 'bradesco', name: 'Bradesco', color: '#cc092f', ink: '#ffffff', mark: 'B' },
  { id: 'caixa', name: 'Caixa', color: '#005ca9', ink: '#ffffff', mark: 'CX' },
  { id: 'inter', name: 'Inter', color: '#ff7a00', ink: '#ffffff', mark: 'in' },
  { id: 'itau', name: 'Itaú', color: '#ec7000', ink: '#ffffff', mark: 'Itaú' },
  { id: 'nubank', name: 'Nubank', color: '#820ad1', ink: '#ffffff', mark: 'nu' },
  { id: 'picpay', name: 'PicPay', color: '#21c25e', ink: '#ffffff', mark: 'P' },
  { id: 'safra', name: 'Safra', color: '#10243e', ink: '#d4b06a', mark: 'S' },
  { id: 'santander', name: 'Santander', color: '#ec0000', ink: '#ffffff', mark: 'S' },
  { id: 'sicredi', name: 'Sicredi', color: '#3fa110', ink: '#ffffff', mark: 'Si' },
  { id: 'xp', name: 'XP', color: '#111111', ink: '#ffc709', mark: 'XP' },
]

export const institutions: Institution[] = [...catalog].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))

export function institutionById(id: string | null | undefined) {
  return institutions.find((item) => item.id === id) ?? null
}
