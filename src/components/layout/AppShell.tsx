import { useEffect, useState } from 'react'
import { CalendarRange, Contact, CreditCard, Landmark, LayoutDashboard, Menu, Plus, Repeat, Settings, Tags } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { CompetenceSwitcher } from '@/components/finance/CompetenceSwitcher'
import { isCompetence } from '@/domain/dates'
import { storesOnServer } from '@/db/database'
import { useFinance } from '@/state/FinanceContext'
import { cn } from '@/lib/cn'

const links = [
  { to: '/', label: 'Início', icon: LayoutDashboard },
  { to: '/mes', label: 'Mês', icon: CalendarRange },
  { to: '/novo', label: 'Novo', icon: Plus },
]

const registers = [
  { to: '/categorias', label: 'Categorias', icon: Tags },
  { to: '/cartoes', label: 'Cartões', icon: CreditCard },
  { to: '/bancos', label: 'Bancos', icon: Landmark },
  { to: '/contatos', label: 'Contatos', icon: Contact },
  { to: '/recorrencias', label: 'Recorrências', icon: Repeat },
]

export function AppShell() {
  const { competence, setCompetence, notice, error, snapshot } = useFinance()
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const showMonthNav = pathname === '/' || pathname === '/mes'
  const savedFavorite = snapshot?.settings.favoriteCompetence
  const favoriteMonth = savedFavorite && isCompetence(savedFavorite) ? savedFavorite : null
  const withCompetence = (path: string) => {
    if (path === '/novo') return path
    if ((path === '/' || path === '/mes') && favoriteMonth) return `${path}?c=${favoriteMonth}`
    return `${path}?c=${competence}`
  }
  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  const backup = snapshot?.settings.lastBackupAt
    ? new Date(snapshot.settings.lastBackupAt).toLocaleDateString('pt-BR')
    : null

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[240px_1fr]">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-3 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2">
        Ir para o conteúdo
      </a>
      <aside className="hidden border-r border-border bg-card md:flex md:min-h-dvh md:flex-col md:px-4 md:py-6">
        <div className="flex items-center gap-3 px-2">
          <img src="/profile.jpg" alt="" className="h-11 w-11 rounded-full object-cover" />
          <div>
            <p className="font-semibold">Personal Finance</p>
            <p className="text-xs text-muted-foreground">{storesOnServer() ? 'Arquivo no servidor' : 'Neste navegador'}</p>
          </div>
        </div>
        <nav className="mt-8 flex flex-col gap-1" aria-label="Principal">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={withCompetence(link.to)}
              end={link.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex h-11 items-center gap-3 rounded-xl px-3 font-semibold',
                  isActive ? 'bg-secondary text-income' : 'text-foreground hover:bg-secondary',
                )
              }
            >
              <link.icon className="h-5 w-5" aria-hidden />
              {link.label}
            </NavLink>
          ))}
          <p className="mt-6 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cadastros</p>
          {registers.map((link) => (
            <NavLink
              key={link.to}
              to={withCompetence(link.to)}
              className={({ isActive }) =>
                cn(
                  'flex h-11 items-center gap-3 rounded-xl px-3 font-semibold',
                  isActive ? 'bg-secondary text-income' : 'text-foreground hover:bg-secondary',
                )
              }
            >
              <link.icon className="h-5 w-5" aria-hidden />
              {link.label}
            </NavLink>
          ))}
          <NavLink
            to={withCompetence('/configuracoes')}
            className={({ isActive }) =>
              cn('mt-6 flex h-11 items-center gap-3 rounded-xl px-3 font-semibold', isActive ? 'bg-secondary text-income' : 'hover:bg-secondary')
            }
          >
            <Settings className="h-5 w-5" aria-hidden />
            Ajustes
          </NavLink>
        </nav>
        <p className="mt-auto px-2 text-xs leading-5 text-muted-foreground">
          {storesOnServer()
            ? 'Os dados ficam no arquivo do servidor. Faça backup para recuperar ou mudar de aparelho.'
            : 'Os dados ficam neste navegador. Faça backup para recuperar ou mudar de aparelho.'}
          {backup ? ` Último backup: ${backup}.` : ''}
        </p>
      </aside>
      <div className="min-w-0">
        {menuOpen ? (
          <button type="button" className="fixed inset-0 z-20 md:hidden" aria-label="Fechar menu" onClick={() => setMenuOpen(false)} />
        ) : null}
        <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur md:hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
                aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <Menu className="h-5 w-5" />
              </button>
              <span className="font-semibold">Finanças</span>
            </div>
            <img src="/profile.jpg" alt="Perfil" className="h-9 w-9 rounded-full object-cover" />
          </div>
          {menuOpen ? (
            <nav className="grid gap-1 px-4 pb-3" aria-label="Cadastros">
              {registers.map((link) => (
                <NavLink
                  key={link.to}
                  to={withCompetence(link.to)}
                  className={({ isActive }) =>
                    cn(
                      'flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold',
                      isActive ? 'bg-secondary text-income' : 'hover:bg-secondary',
                    )
                  }
                >
                  <link.icon className="h-4 w-4" aria-hidden />
                  {link.label}
                </NavLink>
              ))}
              <NavLink
                to={withCompetence('/configuracoes')}
                className={({ isActive }) =>
                  cn('flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold', isActive ? 'bg-secondary text-income' : 'hover:bg-secondary')
                }
              >
                <Settings className="h-4 w-4" aria-hidden />
                Ajustes
              </NavLink>
            </nav>
          ) : null}
          {showMonthNav ? (
            <div className="px-4 pb-3">
              <CompetenceSwitcher competence={competence} onChange={setCompetence} slide={pathname === '/mes'} showFavorite={pathname === '/mes'} />
            </div>
          ) : null}
        </header>
        {notice ? (
          <div className="mx-4 mt-4 rounded-2xl bg-secondary px-4 py-3 text-sm text-income" role="status">
            <p>{notice}</p>
          </div>
        ) : null}
        {error ? (
          <div className="mx-4 mt-4 rounded-2xl bg-[#f8e8e8] px-4 py-3 text-sm text-expense" role="alert">
            {error}
          </div>
        ) : null}
        <main id="conteudo" className="px-4 py-4 pb-28 md:px-8 md:py-8 md:pb-10">
          <Outlet />
        </main>
      </div>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Principal"
      >
        <ul className="grid grid-cols-3">
          {links.map((link) => (
            <li key={link.to}>
              <NavLink
                to={withCompetence(link.to)}
                end={link.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold',
                    isActive ? 'text-income' : 'text-muted-foreground',
                  )
                }
              >
                <link.icon className={cn('h-5 w-5', link.to === '/novo' && 'rounded-full bg-primary p-2 text-white h-10 w-10')} aria-hidden />
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
