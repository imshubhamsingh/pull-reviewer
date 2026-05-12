import { createRoot } from 'react-dom/client'
import '@/app/index.css'
import { App } from '@/app/App'

const container = document.getElementById('root')
if (!container) throw new Error('#root not found')

createRoot(container).render(<App />)
