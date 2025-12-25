import React from 'react'
import { Users, FileText } from 'lucide-react'
import { useStats } from '../hooks/useStats'

interface StatsCounterProps {
  onStatsLoad?: (stats: { totalSubscribers: number; totalSummaries: number }) => void
}

export function StatsCounter({ onStatsLoad }: StatsCounterProps = {}) {
  const { totalSubscribers, totalSummaries, isLoading, error } = useStats()

  // Notify parent when stats are loaded
  React.useEffect(() => {
    if (!isLoading && !error && onStatsLoad) {
      onStatsLoad({ totalSubscribers, totalSummaries })
    }
  }, [totalSubscribers, totalSummaries, isLoading, error, onStatsLoad])

  if (error) {
    return null // Silently fail if stats can't be loaded
  }

  return (
    <div className="mt-4 text-center">
      <div className="flex items-center justify-center space-x-6 text-xs text-gray-500">
        <div className="flex items-center space-x-1">
          <Users className="h-3 w-3" />
          <span>
            {isLoading ? (
              <span className="inline-block bg-gray-200 animate-pulse rounded w-6 h-3"></span>
            ) : (
              totalSubscribers.toLocaleString()
            )}
          </span>
          <span>subscribers</span>
        </div>
        
        <div className="w-px h-3 bg-gray-300"></div>
        
        <div className="flex items-center space-x-1">
          <FileText className="h-3 w-3 text-postgres-600" />
          <span className="text-postgres-600">
            {isLoading ? (
              <span className="inline-block bg-gray-200 animate-pulse rounded w-6 h-3"></span>
            ) : (
              totalSummaries.toLocaleString()
            )}
          </span>
          <span className="text-postgres-600 font-medium">summaries</span>
        </div>
      </div>
    </div>
  )
}
