import { Link } from 'react-router-dom'
import { ArrowLeft, Calendar, Users, FileText } from 'lucide-react'
import { useSummaries } from '../hooks/useSummaries'

export function ArchivePage() {
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
      <div className="min-h-screen bg-gradient-to-br from-postgres-50 to-blue-50 flex items-center justify-center">
        <div className="max-w-md mx-auto px-4">
          <div className="card text-center">
            <div className="text-red-500 mb-4">
              <FileText className="h-16 w-16 mx-auto" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Error Loading Archive
            </h2>
            <p className="text-gray-600 mb-6">
              {error}
            </p>
            <Link to="/" className="btn-primary">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-postgres-50 to-blue-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Link to="/" className="text-postgres-600 hover:text-postgres-700">
                <ArrowLeft className="h-6 w-6" />
              </Link>
              <div>
                <h1 className="text-xl font-bold text-gray-900">PostgreSQL Weekly Archive</h1>
                <p className="text-sm text-gray-500">Browse all generated summaries</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Weekly Summaries Archive
          </h2>
          <p className="text-gray-600">
            Explore all the PostgreSQL mailing list summaries we've generated. Each summary covers 
            a full week of discussions from the PostgreSQL hackers mailing list.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
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
              <FileText className="h-16 w-16 mx-auto" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              No Summaries Yet
            </h3>
            <p className="text-gray-600 mb-6">
              We haven't generated any weekly summaries yet. Check back soon!
            </p>
            <Link to="/" className="btn-primary">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Home
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {summaries.map((summary) => (
              <div key={summary.id} className="card hover:shadow-lg transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                      Week of {formatDateWithOrdinal(summary.week_end_date)}
                    </h3>
                    <div className="flex items-center space-x-4 text-sm text-gray-500">
                      <div className="flex items-center space-x-1">
                        <FileText className="h-4 w-4" />
                        <span>{summary.total_posts} posts</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Users className="h-4 w-4" />
                        <span>{summary.total_participants} participants</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Calendar className="h-4 w-4" />
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

        {/* Footer */}
        <footer className="mt-16 bg-white rounded-lg shadow-sm p-6">
          <div className="text-center text-gray-500 text-sm space-y-3">
            <p>
              This archive contains AI-generated summaries of PostgreSQL mailing list discussions.
              Summaries may not capture all nuances of the original conversations.
            </p>
          </div>
        </footer>
      </main>
    </div>
  )
}
