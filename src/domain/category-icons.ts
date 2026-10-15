import {
  Baby,
  Banknote,
  BookOpen,
  Briefcase,
  Bus,
  Car,
  Coffee,
  Coins,
  CreditCard,
  Dumbbell,
  Fuel,
  Gift,
  GraduationCap,
  HandCoins,
  HeartPulse,
  Home,
  Landmark,
  Music,
  PawPrint,
  PiggyBank,
  Plane,
  Repeat,
  Shirt,
  ShoppingBag,
  Smartphone,
  Tag,
  Ticket,
  Utensils,
  Wifi,
  type LucideIcon,
} from 'lucide-react'

export const categoryIcons = {
  banknote: Banknote,
  gift: Gift,
  coins: Coins,
  handCoins: HandCoins,
  briefcase: Briefcase,
  piggyBank: PiggyBank,
  home: Home,
  utensils: Utensils,
  shoppingBag: ShoppingBag,
  bus: Bus,
  car: Car,
  fuel: Fuel,
  heartPulse: HeartPulse,
  graduationCap: GraduationCap,
  bookOpen: BookOpen,
  dumbbell: Dumbbell,
  repeat: Repeat,
  pawPrint: PawPrint,
  ticket: Ticket,
  music: Music,
  landmark: Landmark,
  creditCard: CreditCard,
  coffee: Coffee,
  plane: Plane,
  baby: Baby,
  shirt: Shirt,
  wifi: Wifi,
  smartphone: Smartphone,
  tag: Tag,
} satisfies Record<string, LucideIcon>

export type CategoryIcon = keyof typeof categoryIcons

export const categoryIconChoices: Array<{ id: CategoryIcon; label: string }> = [
  { id: 'banknote', label: 'Dinheiro' },
  { id: 'gift', label: 'Presente' },
  { id: 'coins', label: 'Moedas' },
  { id: 'handCoins', label: 'Reembolso' },
  { id: 'briefcase', label: 'Trabalho' },
  { id: 'piggyBank', label: 'Poupança' },
  { id: 'home', label: 'Casa' },
  { id: 'utensils', label: 'Alimentação' },
  { id: 'shoppingBag', label: 'Compras' },
  { id: 'bus', label: 'Transporte' },
  { id: 'car', label: 'Carro' },
  { id: 'fuel', label: 'Combustível' },
  { id: 'heartPulse', label: 'Saúde' },
  { id: 'graduationCap', label: 'Educação' },
  { id: 'bookOpen', label: 'Livros' },
  { id: 'dumbbell', label: 'Academia' },
  { id: 'repeat', label: 'Assinatura' },
  { id: 'pawPrint', label: 'Pets' },
  { id: 'ticket', label: 'Lazer' },
  { id: 'music', label: 'Música' },
  { id: 'landmark', label: 'Impostos' },
  { id: 'creditCard', label: 'Cartão' },
  { id: 'coffee', label: 'Café' },
  { id: 'plane', label: 'Viagem' },
  { id: 'baby', label: 'Família' },
  { id: 'shirt', label: 'Roupas' },
  { id: 'wifi', label: 'Internet' },
  { id: 'smartphone', label: 'Telefone' },
  { id: 'tag', label: 'Outros' },
]

const suggestions: Array<[string, CategoryIcon]> = [
  ['salario', 'banknote'],
  ['beneficio', 'gift'],
  ['renda', 'coins'],
  ['reembolso', 'handCoins'],
  ['moradia', 'home'],
  ['aluguel', 'home'],
  ['aliment', 'utensils'],
  ['mercado', 'shoppingBag'],
  ['transporte', 'bus'],
  ['combust', 'fuel'],
  ['saude', 'heartPulse'],
  ['educa', 'graduationCap'],
  ['academia', 'dumbbell'],
  ['assinatura', 'repeat'],
  ['pet', 'pawPrint'],
  ['lazer', 'ticket'],
  ['imposto', 'landmark'],
  ['cartao', 'creditCard'],
  ['internet', 'wifi'],
  ['telefone', 'smartphone'],
  ['viagem', 'plane'],
  ['cafe', 'coffee'],
]

export function normalizeCategoryName(name: string): string {
  return name
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

export function isCategoryIcon(value: string | null | undefined): value is CategoryIcon {
  return Boolean(value && value in categoryIcons)
}

export function suggestCategoryIcon(name: string): CategoryIcon {
  const normalized = normalizeCategoryName(name)
  const match = suggestions.find(([hint]) => normalized.includes(hint))
  return match?.[1] ?? 'tag'
}

export function resolveCategoryIcon(icon: string | null | undefined, name: string): CategoryIcon {
  if (isCategoryIcon(icon)) return icon
  return suggestCategoryIcon(name)
}
