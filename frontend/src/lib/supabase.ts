import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Database types
export interface Subscriber {
  id: string
  email: string
  subscribed_at: string
  is_active: boolean
  confirmation_status: 'pending_confirmation' | 'confirmed' | 'unsubscribed'
  confirmation_token?: string
  confirmation_expires_at?: string
  confirmed_at?: string
  created_at: string
  updated_at: string
}

export interface WeeklySummary {
  id: string
  week_start_date: string
  week_end_date: string
  summary_content: string
  top_discussions: any[]
  total_posts: number
  total_participants: number
  created_at: string
  updated_at: string
}

export interface MailingListPost {
  id: string
  message_id: string
  subject: string | null
  author_email: string | null
  content: string | null
  thread_id: string | null
  posted_at: string | null
  processed_at: string | null
  created_at: string
  updated_at: string
}
