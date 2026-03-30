import { Skeleton, SkeletonCard, SkeletonText } from '@/components/ui/Skeleton'

export default function DashboardLoading() {
  return (
    <div className="text-white">
      <div className="max-w-6xl mx-auto px-4 pt-6 pb-12">

        {/* Header */}
        <div className="mb-6">
          <Skeleton className="h-7 w-48 mb-2" />
          <Skeleton className="h-3 w-36" />
        </div>

        {/* Phase cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>

        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex justify-between mb-2">
            {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-3 w-4" />)}
          </div>
          <Skeleton className="h-2 w-full" />
        </div>

        {/* Mission map */}
        <div className="mb-8">
          <Skeleton className="h-5 w-32 mb-4" />
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="w-12 h-12 rounded-full flex-shrink-0" />
                <div className="flex-1 bg-zinc-900 rounded-xl border border-zinc-800 p-4">
                  <Skeleton className="h-3 w-20 mb-2" />
                  <Skeleton className="h-4 w-48" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pulse card */}
        <div className="mb-8">
          <Skeleton className="h-5 w-40 mb-4" />
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5">
            <SkeletonText lines={4} />
          </div>
        </div>

      </div>
    </div>
  )
}
