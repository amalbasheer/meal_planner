import React from 'react'
import ReactDOM from 'react-dom/client'
import Page from './app/page' // Adjust this path if your folder name is singular/plural (e.g., './app/page.tsx')
// @ts-expect-error CSS side-effect imports are handled by the bundler.
import './app/globals.css' // Make sure Tailwind or your global CSS is imported here

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Page />
  </React.StrictMode>,
)