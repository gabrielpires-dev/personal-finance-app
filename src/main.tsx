import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import { AuthGate } from './auth/AuthGate'
import { App } from './App'
import { FinanceProvider } from './state/FinanceContext'
import './index.css'

registerSW({ immediate: true })

const root = document.getElementById('root')
if (!root) throw new Error('Elemento raiz não encontrado.')

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <AuthGate>
        <FinanceProvider>
          <App />
        </FinanceProvider>
      </AuthGate>
    </BrowserRouter>
  </StrictMode>,
)
