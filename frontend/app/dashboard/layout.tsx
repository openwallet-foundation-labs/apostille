'use client'

import { ReactNode, Suspense } from 'react'
import ClientLayout from '../components/ClientLayout'

interface DashboardLayoutProps {
  children: ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <Suspense fallback={null}>
      <ClientLayout>{children}</ClientLayout>
    </Suspense>
  )
}