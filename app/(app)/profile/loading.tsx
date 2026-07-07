import { Skeleton } from '@/components/ui/skeleton'

export default function ProfileLoading() {
  return (
    <div className="flex flex-col gap-6 p-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-lg" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-6 flex flex-col gap-5">
        <Skeleton className="h-4 w-24" />
        <div className="flex items-center gap-4">
          <Skeleton className="h-16 w-16 rounded-full" />
          <Skeleton className="h-9 w-40" />
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-6 flex flex-col gap-5">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
      <Skeleton className="h-11 w-36" />
    </div>
  )
}
