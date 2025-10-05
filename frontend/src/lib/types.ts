export interface ApiResponse<T = any> {
  data?: T
  error?: string
  message?: string
}

export interface SubscriptionResult {
  success: boolean
  message: string
  isNewSubscription?: boolean
}

export interface UnsubscribeResult {
  success: boolean
  message: string
}

export interface WeeklyStats {
  total_subscribers: number
  total_posts: number
  total_participants: number
  summary_exists: boolean
}

export interface TopDiscussion {
  thread_id: string
  subject: string
  post_count: number
  participants: number
  first_post_at: string
  last_post_at: string
}
