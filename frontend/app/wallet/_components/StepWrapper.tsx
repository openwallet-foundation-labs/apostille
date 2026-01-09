import { ReactNode } from 'react'

interface StepWrapperProps {
  children: ReactNode
}

export default function StepWrapper({ children }: StepWrapperProps) {
  return (
    <div className="w-full max-h-[70vh] overflow-y-auto flex flex-col justify-start items-center px-4 py-6">
      {children}
    </div>
  )
} 