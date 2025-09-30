import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { CheckCircle, XCircle, Loader2, Mail } from 'lucide-react'
import { useSubscription } from '../hooks/useSubscription'

export function ConfirmationPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { confirmSubscription } = useSubscription()
  const [result, setResult] = useState<{
    success: boolean
    message: string
  } | null>(null)

  const token = searchParams.get('token')

  useEffect(() => {
    if (token) {
      handleConfirmation(token)
    } else {
      setResult({
        success: false,
        message: 'Invalid confirmation link. No token provided.'
      })
    }
  }, [token])

  const handleConfirmation = async (confirmationToken: string) => {
    const response = await confirmSubscription(confirmationToken)
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
              <Loader2 className="h-8 w-8 animate-spin text-postgres-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Confirming your subscription...
            </h2>
            <p className="text-gray-600">
              Please wait while we verify your email address.
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
                Subscription Confirmed!
              </h2>
              <p className="text-gray-600 mb-6">
                {result.message}
              </p>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                <div className="flex items-center justify-center mb-2">
                  <Mail className="h-5 w-5 text-green-600 mr-2" />
                  <span className="font-semibold text-green-800">
                    {result.message.includes('already subscribed') ? "You're all set!" : "What's next?"}
                  </span>
                </div>
                <p className="text-sm text-green-700">
                  {result.message.includes('already subscribed') 
                    ? "You're already receiving our weekly PostgreSQL summaries. Keep an eye on your inbox every Monday!"
                    : "You'll receive your first weekly summary next Monday. Each summary includes the top 10 most important PostgreSQL mailing list discussions."
                  }
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-center mb-4">
                <XCircle className="h-16 w-16 text-red-500" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                Confirmation Failed
              </h2>
              <p className="text-gray-600 mb-6">
                {result.message}
              </p>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-red-700">
                  {result.message.includes('expired') 
                    ? "Confirmation links expire after 5 minutes for security. You'll need to subscribe again to get a new confirmation email."
                    : result.message.includes('Invalid confirmation link')
                    ? "This link appears to be invalid or corrupted. Please make sure you're using the complete link from your email."
                    : "This could happen if the confirmation link has expired (links expire after 5 minutes) or if the link is invalid."
                  }
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
            
            {!result.success && (
              <button
                onClick={() => navigate('/')}
                className="w-full btn-secondary"
              >
                Subscribe Again
              </button>
            )}
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
