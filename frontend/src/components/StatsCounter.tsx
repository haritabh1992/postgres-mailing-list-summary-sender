import React from 'react'
import { Link } from 'react-router-dom'
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
        
        <Link 
          to="/archive" 
          className="flex items-center space-x-1 px-2 py-1 rounded-md text-postgres-600 hover:text-postgres-700 hover:bg-postgres-50 transition-all duration-200 hover:scale-105 cursor-pointer group relative border border-postgres-200 hover:border-postgres-300 bg-postgres-25 shadow-sm hover:shadow-md"
          title="Click to view all summaries"
        >
          <FileText className="h-3 w-3 text-postgres-600 group-hover:text-postgres-700 transition-colors" />
          <span className="text-postgres-600 group-hover:text-postgres-700 transition-colors">
            {isLoading ? (
              <span className="inline-block bg-gray-200 animate-pulse rounded w-6 h-3"></span>
            ) : (
              totalSummaries.toLocaleString()
            )}
          </span>
          <span className="text-postgres-600 group-hover:text-postgres-700 transition-colors font-medium group-hover:underline">summaries</span>
          <span className="ml-1 text-xs opacity-0 group-hover:opacity-100 transition-opacity">→</span>
        </Link>
      </div>
    </div>
  )
}
