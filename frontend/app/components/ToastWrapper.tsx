'use client'

import { ToastContainer } from 'react-toastify'
import { useTheme } from './ThemeProvider'

export default function ToastWrapper() {
  const { actualTheme } = useTheme()

  return (
    <ToastContainer
      position="top-right"
      autoClose={5000}
      hideProgressBar={false}
      newestOnTop={false}
      closeOnClick
      rtl={false}
      pauseOnFocusLoss
      draggable
      pauseOnHover
      theme={actualTheme}
      className="toast-custom"
    />
  )
}
