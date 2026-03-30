import { Skeleton } from '@/components/ui/Skeleton'

export default function CalendarLoading() {
  return (
    <div className="text-white">
      <div className="max-w-5xl mx-auto px-4 pt-8 pb-12">
        <div className="flex items-center justify-between mb-6">
          <Skeleton className="h-7 w-48" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <Skeleton className="h-9 w-32 rounded-lg" />
            <Skeleton className="h-9 w-9 rounded-lg" />
          </div>
        </div>
        {/* Calendar grid skeleton */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {[...Array(7)].map((_, i) => <Skeleton key={i} className="h-6" />)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {[...Array(35)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      </div>
    </div>
  )
}
