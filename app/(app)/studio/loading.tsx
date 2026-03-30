import { Skeleton, SkeletonText } from '@/components/ui/Skeleton'

export default function StudioLoading() {
  return (
    <div className="text-white">
      <div className="max-w-3xl mx-auto px-4 pt-8 pb-12">
        <Skeleton className="h-7 w-40 mb-2" />
        <Skeleton className="h-3 w-64 mb-8" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
              <Skeleton className="h-8 w-8 rounded-lg mb-3" />
              <Skeleton className="h-4 w-24 mb-1" />
              <SkeletonText lines={2} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
