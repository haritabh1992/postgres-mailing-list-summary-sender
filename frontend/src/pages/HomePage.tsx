import { useState } from 'react'
import { Database } from 'lucide-react'
import { SignupForm } from '../components/SignupForm'
import { SuccessMessage } from '../components/SuccessMessage'
import { ErrorMessage } from '../components/ErrorMessage'
import { StatsCounter } from '../components/StatsCounter'
import { SummariesList } from '../components/SummariesList'

export function HomePage() {
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSuccess = (message: string) => {
    setSuccessMessage(message)
    setErrorMessage(null)
  }

  const handleError = (message: string) => {
    setErrorMessage(message)
    setSuccessMessage(null)
  }

  const clearMessages = () => {
    setSuccessMessage(null)
    setErrorMessage(null)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-postgres-50 to-blue-50 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-postgres-600 p-2 rounded-lg">
                <Database className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">PostgreSQL Hackers Digest</h1>
                <p className="text-sm text-gray-500">AI-powered weekly summaries</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            Never Miss Important PostgreSQL Hackers Discussions
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Get AI-powered weekly summaries of the top discussions from the PostgreSQL 
            hackers mailing list, delivered straight to your inbox.
          </p>
        </div>

        {/* Single Column Layout: Subscribe section first, then Archive below */}
        <div className="flex flex-col">
          {/* Subscription Form */}
          <div className="w-full max-w-md mx-auto mb-12">
            <div className="card">
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">
                  Subscribe to Weekly Summary
                </h3>
                <p className="text-gray-600">
                  Join thousands of PostgreSQL developers who stay informed.
                </p>
              </div>

              {/* Messages */}
              {successMessage && (
                <SuccessMessage message={successMessage} onClose={clearMessages} />
              )}
              {errorMessage && (
                <ErrorMessage message={errorMessage} onClose={clearMessages} />
              )}

              {/* Form */}
              <SignupForm onSuccess={handleSuccess} onError={handleError} />
            </div>

            {/* Subtle Stats */}
            <StatsCounter />
          </div>

          {/* Archive Section: Always below subscribe section */}
          <div className="w-full max-w-6xl mx-auto">
            <SummariesList />
          </div>
        </div>

      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center text-gray-500 text-sm">
            <p>
              This service is not affiliated with the PostgreSQL Global Development Group.
              Summaries are generated using AI and may not capture all nuances of discussions.
            </p>
          </div>
        </div>
      </footer>

    </div>
  )
}
