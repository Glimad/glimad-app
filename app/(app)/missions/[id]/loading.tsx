import { Skeleton, SkeletonText } from '@/components/ui/Skeleton'

export default function MissionLoading() {
  return (
    <div className="text-white">
      <div className="max-w-3xl mx-auto px-4 pt-8 pb-12">
        <Skeleton className="h-4 w-32 mb-6" />
        <Skeleton className="h-7 w-56 mb-2" />
        <Skeleton className="h-3 w-40 mb-8" />
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <SkeletonText lines={5} />
        </div>
      </div>
    </div>
  )
}
