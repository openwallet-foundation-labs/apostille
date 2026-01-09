'use client'

import { ReactNode } from 'react'
import ClientLayout from '../components/ClientLayout'

interface DashboardLayoutProps {
  children: ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return <ClientLayout>{children}</ClientLayout>
} 