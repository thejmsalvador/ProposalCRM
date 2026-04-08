'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'

export default function ProposalsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center p-6">
      <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
        <AlertTriangle className="h-8 w-8 text-red-400" />
      </div>
      <div>
        <p className="text-lg font-semibold text-slate-800">Failed to load proposals</p>
        <p className="text-sm text-slate-500 mt-1">
          There was a problem loading your proposals. Please try again.
        </p>
      </div>
      <div className="flex gap-3">
        <Button onClick={reset} variant="outline">
          Try again
        </Button>
        <a href="/dashboard" className={buttonVariants()}>
          Return to Dashboard
        </a>
      </div>
    </div>
  )
}
