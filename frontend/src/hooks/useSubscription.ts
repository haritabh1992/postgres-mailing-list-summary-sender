import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { type SubscriptionResult, type UnsubscribeResult } from '../lib/types'

export function useSubscription() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const subscribe = async (email: string): Promise<SubscriptionResult> => {
    setIsLoading(true)
    setError(null)

    try {
      // Generate confirmation token
      const confirmationToken = crypto.randomUUID()
      const confirmationExpiresAt = new Date(Date.now() + 5 * 60 * 1000) // 5 minutes from now
      
      // First, check if the email already exists
      const { data: existingSubscriber, error: selectError } = await supabase
        .from('subscribers')
        .select('id, confirmation_status, is_active, confirmation_expires_at')
        .eq('email', email)
        .single()

      if (selectError && selectError.code !== 'PGRST116') {
        // PGRST116 is "not found" error, which is fine
        throw selectError
      }

      if (existingSubscriber) {
        // Email exists, check status
        if (existingSubscriber.confirmation_status === 'confirmed' && existingSubscriber.is_active) {
          return {
            success: false,
            message: 'This email is already subscribed to our mailing list.',
            isNewSubscription: false
          }
        }

        // Check if there's a pending confirmation that hasn't expired
        if (existingSubscriber.confirmation_status === 'pending_confirmation' && 
            existingSubscriber.confirmation_expires_at && 
            new Date(existingSubscriber.confirmation_expires_at) > new Date()) {
          return {
            success: false,
            message: 'A confirmation email was recently sent to this address. Please check your email and click the confirmation link.',
            isNewSubscription: false
          }
        }

        // Update existing record for re-subscription
        const { error: updateError } = await supabase
          .from('subscribers')
          .update({ 
            confirmation_token: confirmationToken,
            confirmation_expires_at: confirmationExpiresAt.toISOString(),
            confirmation_status: 'pending_confirmation',
            is_active: false,
            subscribed_at: new Date().toISOString() // Update subscription timestamp
          })
          .eq('id', existingSubscriber.id)

        if (updateError) {
          throw updateError
        }
      } else {
        // Create new subscriber record
        const { error: insertError } = await supabase
          .from('subscribers')
          .insert([{ 
            email,
            confirmation_token: confirmationToken,
            confirmation_expires_at: confirmationExpiresAt.toISOString(),
            confirmation_status: 'pending_confirmation',
            is_active: false
          }])

        if (insertError) {
          throw insertError
        }
      }

      // Send confirmation email
      const confirmationUrl = `${window.location.origin}/confirm?token=${confirmationToken}`
      
      const { error: emailError } = await supabase.functions.invoke('send-confirmation-email', {
        body: {
          email,
          confirmationToken,
          confirmationUrl
        }
      })

      if (emailError) {
        console.error('Failed to send confirmation email:', emailError)
        // Still return success since the subscription was created
      }

      return {
        success: true,
        message: 'Please check your email and click the confirmation link to complete your subscription. The link will expire in 5 minutes for security.',
        isNewSubscription: true
      }
    } catch (err: any) {
      const errorMessage = err.message || 'An unexpected error occurred. Please try again.'
      setError(errorMessage)
      return {
        success: false,
        message: errorMessage,
        isNewSubscription: false
      }
    } finally {
      setIsLoading(false)
    }
  }

  const unsubscribe = async (email: string): Promise<UnsubscribeResult> => {
    setIsLoading(true)
    setError(null)

    try {
      // Update subscriber to inactive status (don't delete the record)
      const { data, error: updateError } = await supabase
        .from('subscribers')
        .update({ 
          is_active: false,
          confirmation_status: 'unsubscribed',
          confirmation_token: null, // Clear any pending confirmation
          confirmation_expires_at: null,
          confirmed_at: null // Clear confirmation timestamp for potential re-subscription
        })
        .eq('email', email)
        .select()

      if (updateError) {
        throw updateError
      }

      if (!data || data.length === 0) {
        return {
          success: false,
          message: 'Email not found in our subscription list.'
        }
      }

      return {
        success: true,
        message: 'Successfully unsubscribed. You will no longer receive weekly summaries. You can resubscribe anytime by visiting our homepage.'
      }
    } catch (err: any) {
      const errorMessage = err.message || 'An unexpected error occurred. Please try again.'
      setError(errorMessage)
      return {
        success: false,
        message: errorMessage
      }
    } finally {
      setIsLoading(false)
    }
  }

  const checkSubscription = async (email: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from('subscribers')
        .select('is_active, confirmation_status')
        .eq('email', email)
        .single()

      if (error || !data) {
        return false
      }

      return data.is_active && data.confirmation_status === 'confirmed'
    } catch {
      return false
    }
  }

  const confirmSubscription = async (token: string): Promise<SubscriptionResult> => {
    setIsLoading(true)
    setError(null)

    try {
      // Call the confirmation function directly with the token as a URL parameter
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
      
      const response = await fetch(`${supabaseUrl}/functions/v1/confirm-subscription?token=${encodeURIComponent(token)}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        }
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Confirmation failed')
      }

      if (data.success) {
        return {
          success: true,
          message: data.message,
          isNewSubscription: true
        }
      } else {
        return {
          success: false,
          message: data.error || 'Confirmation failed',
          isNewSubscription: false
        }
      }
    } catch (err: any) {
      const errorMessage = err.message || 'An unexpected error occurred. Please try again.'
      setError(errorMessage)
      return {
        success: false,
        message: errorMessage,
        isNewSubscription: false
      }
    } finally {
      setIsLoading(false)
    }
  }

  return {
    subscribe,
    unsubscribe,
    checkSubscription,
    confirmSubscription,
    isLoading,
    error
  }
}
