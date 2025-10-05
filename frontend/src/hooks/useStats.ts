import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export interface Stats {
  totalSubscribers: number
  totalSummaries: number
  isLoading: boolean
  error: string | null
}

export function useStats() {
  const [stats, setStats] = useState<Stats>({
    totalSubscribers: 0,
    totalSummaries: 0,
    isLoading: true,
    error: null
  })

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      setStats(prev => ({ ...prev, isLoading: true, error: null }))

      // Use the database function to get stats efficiently
      const { data, error } = await supabase
        .rpc('get_public_stats')

      if (error) {
        throw new Error(`Failed to fetch stats: ${error.message}`)
      }

      const statsData = data?.[0] || { total_subscribers: 0, total_summaries: 0 }

      setStats({
        totalSubscribers: parseInt(statsData.total_subscribers) || 0,
        totalSummaries: parseInt(statsData.total_summaries) || 0,
        isLoading: false,
        error: null
      })
    } catch (error: any) {
      console.error('Error fetching stats:', error)
      setStats(prev => ({
        ...prev,
        isLoading: false,
        error: error.message || 'Failed to load stats'
      }))
    }
  }

  return { ...stats, refetch: fetchStats }
}
