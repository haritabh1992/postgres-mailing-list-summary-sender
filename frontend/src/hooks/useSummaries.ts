import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export interface WeeklySummary {
  id: string
  week_start_date: string
  week_end_date: string
  summary_content: string
  total_posts: number
  total_participants: number
  created_at: string
  updated_at: string
}

export function useSummaries() {
  const [summaries, setSummaries] = useState<WeeklySummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchSummaries()
  }, [])

  const fetchSummaries = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const { data, error: fetchError } = await supabase
        .from('weekly_summaries')
        .select('*')
        .order('week_start_date', { ascending: false })

      if (fetchError) {
        throw fetchError
      }

      setSummaries(data || [])
    } catch (err) {
      console.error('Error fetching summaries:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch summaries')
    } finally {
      setIsLoading(false)
    }
  }

  return {
    summaries,
    isLoading,
    error,
    refetch: fetchSummaries
  }
}
