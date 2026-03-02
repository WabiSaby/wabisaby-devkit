import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@wabisaby/ui/styles'
import './styles/main.scss'
import App from './App'
import { ToastProvider } from '@wabisaby/ui'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
)
