import React from 'react'
import ReactDOM from 'react-dom/client'
import Page from './app/page' // Adjust this path if your folder name is singular/plural (e.g., './app/page.tsx')
// @ts-ignore
import './app/globals.css' // Make sure Tailwind or your global CSS is imported here
// @ts-ignore -- provided by the Vite PWA plugin at build time
import { registerSW } from 'virtual:pwa-register'

// Register service worker immediately
registerSW({ immediate: true })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Page />
  </React.StrictMode>,
)