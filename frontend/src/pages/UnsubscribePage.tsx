import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { CheckCircle, XCircle, Mail } from 'lucide-react'
import { useSubscription } from '../hooks/useSubscription'

export function UnsubscribePage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { unsubscribe } = useSubscription()
  const [result, setResult] = useState<{
    success: boolean
    message: string
  } | null>(null)

  const email = searchParams.get('email')

  useEffect(() => {
    if (email) {
      handleUnsubscribe(email)
    } else {
      setResult({
        success: false,
        message: 'Invalid unsubscribe link. No email address provided.'
      })
    }
  }, [email])

  const handleUnsubscribe = async (emailAddress: string) => {
    const response = await unsubscribe(emailAddress)
    setResult({
      success: response.success,
      message: response.message
    })
  }

  const handleBackToHome = () => {
    navigate('/')
  }

  if (!result) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-postgres-50 to-blue-50 flex items-center justify-center">
        <div className="max-w-md mx-auto px-4">
          <div className="card text-center">
            <div className="flex items-center justify-center mb-4">
              <Mail className="h-8 w-8 animate-pulse text-postgres-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Processing unsubscribe request...
            </h2>
            <p className="text-gray-600">
              Please wait while we process your unsubscribe request.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-postgres-50 to-blue-50 flex items-center justify-center">
      <div className="max-w-md mx-auto px-4">
        <div className="card text-center">
          {result.success ? (
            <>
              <div className="flex items-center justify-center mb-4">
                <CheckCircle className="h-16 w-16 text-green-500" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                Successfully Unsubscribed
              </h2>
              <p className="text-gray-600 mb-6">
                {result.message}
              </p>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-green-700">
                  You will no longer receive PostgreSQL Weekly Summary emails. 
                  You can resubscribe at any time by visiting our homepage.
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-center mb-4">
                <XCircle className="h-16 w-16 text-red-500" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                Unsubscribe Failed
              </h2>
              <p className="text-gray-600 mb-6">
                {result.message}
              </p>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-red-700">
                  This could happen if the email address was not found in our subscription list 
                  or if there was a technical issue.
                </p>
              </div>
            </>
          )}

          <div className="space-y-3">
            <button
              onClick={handleBackToHome}
              className="w-full btn-primary"
            >
              Back to Home
            </button>
          </div>

          <div className="mt-8 pt-6 border-t border-gray-200">
            <p className="text-xs text-gray-500">
              If you continue to have issues, please contact support.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
