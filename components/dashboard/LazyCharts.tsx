'use client'

import dynamic from 'next/dynamic'

function ChartSkeleton() {
  return (
    <div
      className="h-[200px] w-full rounded-lg bg-slate-100 animate-pulse"
      aria-busy="true"
      aria-label="Loading chart"
    />
  )
}

/**
 * Recharts is ~100KB gzipped; loading it lazily keeps it out of the
 * dashboard's first-load JS. The dashboard page is a Server Component,
 * so the ssr:false dynamic() calls must live in this client wrapper.
 */
export const LazyStatusDonut = dynamic(
  () => import('./StatusDonut').then((m) => m.StatusDonut),
  { ssr: false, loading: () => <ChartSkeleton /> },
)

export const LazyPipelineFunnel = dynamic(
  () => import('./PipelineFunnel').then((m) => m.PipelineFunnel),
  { ssr: false, loading: () => <ChartSkeleton /> },
)
