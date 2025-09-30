import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Mail, X, Loader2 } from 'lucide-react'
import { unsubscribeSchema, type UnsubscribeFormData } from '../lib/validation'
import { useSubscription } from '../hooks/useSubscription'

interface UnsubscribeFormProps {
  onSuccess: (message: string) => void
  onError: (message: string) => void
}

export function UnsubscribeForm({ onSuccess, onError }: UnsubscribeFormProps) {
  const { unsubscribe, isLoading } = useSubscription()
  
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset
  } = useForm<UnsubscribeFormData>({
    resolver: zodResolver(unsubscribeSchema)
  })

  const onSubmit = async (data: UnsubscribeFormData) => {
    const result = await unsubscribe(data.email)
    
    if (result.success) {
      onSuccess(result.message)
      reset()
    } else {
      onError(result.message)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label htmlFor="unsubscribe-email" className="block text-sm font-medium text-gray-700 mb-2">
          Email Address
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Mail className="h-5 w-5 text-gray-400" />
          </div>
          <input
            {...register('email')}
            type="email"
            id="unsubscribe-email"
            className={`input-field pl-10 ${errors.email ? 'border-red-300 focus:ring-red-500' : ''}`}
            placeholder="Enter your email address"
            disabled={isLoading}
          />
        </div>
        {errors.email && (
          <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Unsubscribing...</span>
          </>
        ) : (
          <>
            <X className="h-4 w-4" />
            <span>Unsubscribe</span>
          </>
        )}
      </button>

      <p className="text-xs text-gray-500 text-center">
        You will no longer receive weekly summaries after unsubscribing.
      </p>
    </form>
  )
}
