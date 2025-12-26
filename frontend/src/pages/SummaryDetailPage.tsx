import { useParams, Link } from 'react-router-dom';
import { useSummary } from '../hooks/useSummary';
import { ArrowLeft, CalendarDays, Users, MessageSquare, Loader2, FileText } from 'lucide-react';
import { markdownToHtml } from '../utils/markdown';

export function SummaryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { summary, isLoading, error } = useSummary(id || '');

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
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-postgres-50 to-blue-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            to="/"
            className="inline-flex items-center text-postgres-600 hover:text-postgres-800 font-medium mb-4 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Home
          </Link>
          
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            PostgreSQL Weekly Summary
          </h1>
        </div>

        {isLoading && (
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-postgres-600 mx-auto mb-4" />
            <p className="text-gray-700 text-lg">Loading summary...</p>
          </div>
        )}

        {error && (
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <div className="text-red-600 mb-4">
              <FileText className="h-12 w-12 mx-auto mb-2" />
              <p className="text-lg font-medium">Summary Not Found</p>
            </div>
            <p className="text-gray-600 mb-6">{error}</p>
            <Link to="/" className="btn-primary">
              Back to Home
            </Link>
          </div>
        )}

        {summary && (
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            {/* Summary Header */}
            <div className="bg-gradient-to-r from-postgres-600 to-postgres-700 text-white p-8">
              <h2 className="text-2xl font-bold mb-2">
                Week of {formatDateWithOrdinal(summary.week_end_date)}
              </h2>
              <div className="flex flex-wrap items-center gap-6 text-postgres-100">
                <div className="flex items-center">
                  <CalendarDays className="h-5 w-5 mr-2" />
                  <span>Generated on {formatDateTime(summary.created_at)}</span>
                </div>
                <div className="flex items-center">
                  <MessageSquare className="h-5 w-5 mr-2" />
                  <span>{summary.total_posts} posts</span>
                </div>
                <div className="flex items-center">
                  <Users className="h-5 w-5 mr-2" />
                  <span>{summary.total_participants} participants</span>
                </div>
              </div>
            </div>

            {/* Summary Content */}
            <div className="p-8">
              <style>{`
                .tags-container {
                  margin: 1rem 0;
                  display: flex;
                  flex-wrap: wrap;
                  align-items: center;
                  gap: 0.5rem;
                }
                .tags-container strong {
                  margin-right: 0.25rem;
                  color: #374151;
                }
                .tag {
                  display: inline-flex;
                  align-items: center;
                  padding: 0.375rem 0.75rem;
                  border-radius: 0.5rem;
                  font-size: 0.875rem;
                  font-weight: 500;
                  border: 1px solid;
                  transition: all 0.2s ease;
                  position: relative;
                }
                /* Commitfest tags - use provided colors from inline styles */
                .tag[data-tag-source="commitfest"] {
                  /* Colors are set via inline styles from database */
                  /* Solid border to distinguish from AI tags */
                  border-style: solid;
                }
                .tag[data-tag-source="commitfest"]::after {
                  content: "●";
                  font-size: 0.5rem;
                  margin-left: 0.375rem;
                  opacity: 0.6;
                }
                /* AI-generated tags - neutral styling with dashed border */
                .tag[data-tag-source="ai"] {
                  background-color: #f3f4f6;
                  color: #1f2937;
                  border-color: #d1d5db;
                  border-style: dashed;
                }
                .tag[data-tag-source="ai"]::after {
                  content: "◇";
                  font-size: 0.5rem;
                  margin-left: 0.375rem;
                  opacity: 0.5;
                  color: #6b7280;
                }
                .tag[data-tag-source="ai"]:hover {
                  background-color: #e5e7eb;
                  border-color: #9ca3af;
                }
              `}</style>
              <div 
                className="prose prose-lg max-w-none
                  prose-headings:text-postgres-700
                  prose-h1:text-3xl prose-h1:font-bold prose-h1:mb-6 prose-h1:mt-0
                  prose-h2:text-2xl prose-h2:font-semibold prose-h2:mb-4 prose-h2:mt-8
                  prose-h3:text-xl prose-h3:font-semibold prose-h3:mb-3 prose-h3:mt-6
                  prose-p:text-gray-700 prose-p:leading-relaxed prose-p:mb-4 prose-p:text-justify
                  prose-strong:text-gray-900 prose-strong:font-semibold
                  prose-code:text-postgres-700 prose-code:bg-postgres-50 prose-code:px-2 prose-code:py-1 prose-code:rounded prose-code:text-sm prose-code:font-mono
                  prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-pre:p-4 prose-pre:rounded-lg prose-pre:overflow-x-auto
                  prose-blockquote:border-l-4 prose-blockquote:border-postgres-300 prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-gray-600
                  prose-ul:list-disc prose-ul:pl-6 prose-ul:mb-4
                  prose-ol:list-decimal prose-ol:pl-6 prose-ol:mb-4
                  prose-li:text-gray-700 prose-li:mb-2
                  prose-a:text-postgres-600 prose-a:no-underline hover:prose-a:underline
                  prose-table:border-collapse prose-table:w-full prose-table:mb-4
                  prose-th:bg-gray-100 prose-th:border prose-th:border-gray-300 prose-th:px-4 prose-th:py-2 prose-th:text-left prose-th:font-semibold
                  prose-td:border prose-td:border-gray-300 prose-td:px-4 prose-td:py-2
                  prose-hr:border-gray-300 prose-hr:my-8"
                dangerouslySetInnerHTML={{ 
                  __html: markdownToHtml(summary.summary_content)
                }}
              />
            </div>

            {/* Footer */}
            <div className="bg-gray-50 px-8 py-6 border-t border-gray-200">
              <div className="text-center text-gray-600 text-sm">
                <p className="mb-2">
                  This summary was generated using AI and may not capture all nuances of the original discussions.
                </p>
                <p>
                  Source: PostgreSQL Hackers Mailing List
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
