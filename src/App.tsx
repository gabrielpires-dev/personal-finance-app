import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { DashboardPage } from '@/pages/DashboardPage'
import { MonthPage } from '@/pages/MonthPage'
import { NewEntryPage } from '@/pages/NewEntryPage'
import { BanksPage } from '@/pages/BanksPage'
import { CardsPage } from '@/pages/CardsPage'
import { CategoriesPage } from '@/pages/CategoriesPage'
import { PartiesPage } from '@/pages/PartiesPage'
import { RecurrencesPage } from '@/pages/RecurrencesPage'
import { SettingsPage } from '@/pages/SettingsPage'

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="mes" element={<MonthPage />} />
        <Route path="novo" element={<NewEntryPage />} />
        <Route path="categorias" element={<CategoriesPage />} />
        <Route path="cartoes" element={<CardsPage />} />
        <Route path="bancos" element={<BanksPage />} />
        <Route path="contatos" element={<PartiesPage />} />
        <Route path="recorrencias" element={<RecurrencesPage />} />
        <Route path="configuracoes" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
