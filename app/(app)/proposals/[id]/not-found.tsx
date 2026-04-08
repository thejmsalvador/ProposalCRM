import Link from 'next/link'
import { FileSearch } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'

export default function ProposalNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center p-6">
      <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
        <FileSearch className="h-8 w-8 text-slate-400" />
      </div>
      <div>
        <p className="text-lg font-semibold text-slate-800">Proposal not found</p>
        <p className="text-sm text-slate-500 mt-1">
          This proposal doesn&apos;t exist or you don&apos;t have permission to view it.
        </p>
      </div>
      <Link href="/proposals" className={buttonVariants()}>
        Back to Proposals
      </Link>
    </div>
  )
}
