import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface WeeklySummary {
  id: string;
  week_start_date: string;
  week_end_date: string;
  summary_content: string;
  total_posts: number;
  total_participants: number;
  created_at: string;
}

export function useSummary(id: string) {
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSummary() {
      try {
        setIsLoading(true);
        const { data, error } = await supabase
          .from('weekly_summaries')
          .select('*')
          .eq('id', id)
          .single();

        if (error) {
          throw error;
        }

        setSummary(data);
      } catch (err: any) {
        console.error('Error fetching summary:', err.message);
        setError('Failed to load summary. Please try again later.');
      } finally {
        setIsLoading(false);
      }
    }

    if (id) {
      fetchSummary();
    }
  }, [id]);

  return { summary, isLoading, error };
}
