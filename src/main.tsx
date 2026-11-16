import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './components/styles.css'
import './demo/theme.css'
import { App } from './demo/App.tsx'

const root = document.getElementById('root')
if (root === null) {
  throw new Error('missing #root element')
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
