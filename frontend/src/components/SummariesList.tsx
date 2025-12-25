import { Link } from 'react-router-dom'
import { Calendar, Users, FileText } from 'lucide-react'
import { useSummaries } from '../hooks/useSummaries'

export function SummariesList() {
  const { summaries, isLoading, error } = useSummaries()

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const formatDateWithOrdinal = (dateString: string) => {
    const date = new Date(dateString)
    const day = date.getDate()
    const ordinal = (day: number) => {
      const s = ["th", "st", "nd", "rd"]
      const v = day % 100
      return day + (s[(v - 20) % 10] || s[v] || s[0])
    }
    const monthYear = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    return `${ordinal(day)} ${monthYear}`
  }

  if (error) {
    return (
      <div className="card text-center">
        <div className="text-red-500 mb-4">
          <FileText className="h-12 w-12 mx-auto" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Error Loading Summaries
        </h3>
        <p className="text-gray-600 text-sm">
          {error}
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="border-t border-gray-200 pt-8 mb-4">
        <h2 className="text-2xl font-bold text-gray-900 mb-4 text-center">
          Archive
        </h2>
      </div>
      
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2 mb-4"></div>
              <div className="h-3 bg-gray-200 rounded w-3/4"></div>
            </div>
          ))}
        </div>
      ) : summaries.length === 0 ? (
        <div className="card text-center">
          <div className="text-gray-400 mb-4">
            <FileText className="h-12 w-12 mx-auto" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No Summaries Yet
          </h3>
          <p className="text-gray-600 text-sm">
            We haven't generated any weekly summaries yet. Check back soon!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {summaries.map((summary) => (
            <div key={summary.id} className="card hover:shadow-lg transition-shadow">
              <div className="flex flex-col mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Week of {formatDateWithOrdinal(summary.week_end_date)}
                  </h3>
                  <div className="flex flex-col gap-2 text-xs text-gray-500">
                    <div className="flex items-center space-x-1">
                      <FileText className="h-3 w-3" />
                      <span>{summary.total_posts} posts</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Users className="h-3 w-3" />
                      <span>{summary.total_participants} participants</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Calendar className="h-3 w-3" />
                      <span>Generated {formatDate(summary.created_at)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100">
                <Link
                  to={`/summary/${summary.id}`}
                  className="text-postgres-600 hover:text-postgres-700 font-medium text-sm inline-flex items-center transition-colors"
                >
                  Read Full Summary →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

