import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface MailThread {
  url: string
  subject: string
  post_date: Date
  thread_id: string
  message_count: number
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get the last 7 days date range
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(endDate.getDate() - 7)

    console.log(`Fetching mail threads from ${startDate.toISOString()} to ${endDate.toISOString()}`)

    // Create or update weekly discussion record
    const weekStart = getWeekStart(startDate)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)

    const weekStartStr = weekStart.toISOString().split('T')[0]
    const weekEndStr = weekEnd.toISOString().split('T')[0]

    // First, try to get existing record
    let { data: weeklyDiscussion, error: selectError } = await supabaseClient
      .from('weekly_discussions')
      .select('*')
      .eq('week_start_date', weekStartStr)
      .eq('week_end_date', weekEndStr)
      .single()

    if (selectError && selectError.code !== 'PGRST116') {
      // PGRST116 is "not found" error, which is fine
      console.error('Error checking existing weekly discussion:', selectError)
    }

    if (weeklyDiscussion) {
      // Update existing record
      const { data: updatedRecord, error: updateError } = await supabaseClient
        .from('weekly_discussions')
        .update({
          processing_status: 'fetching',
          fetch_started_at: new Date().toISOString()
        })
        .eq('id', weeklyDiscussion.id)
        .select()
        .single()

      if (updateError) {
        console.error('Error updating weekly discussion:', updateError)
      } else {
        weeklyDiscussion = updatedRecord
      }
    } else {
      // Create new record
      const { data: newRecord, error: insertError } = await supabaseClient
        .from('weekly_discussions')
        .insert({
          week_start_date: weekStartStr,
          week_end_date: weekEndStr,
          processing_status: 'fetching',
          fetch_started_at: new Date().toISOString()
        })
        .select()
        .single()

      if (insertError) {
        console.error('Error creating weekly discussion:', insertError)
      } else {
        weeklyDiscussion = newRecord
      }
    }

    // Fetch mail threads for the date range
    const threads = await fetchMailThreadsForDateRange(startDate, endDate)
    
    console.log(`Found ${threads.length} mail threads`)

    // Store threads in database with proper upsert handling
    let insertedCount = 0
    let updatedCount = 0
    
    for (const thread of threads) {
      try {
        // Use upsert with proper conflict resolution
        const { data, error: upsertError } = await supabaseClient
          .from('mail_threads')
          .upsert({
            thread_url: thread.url,
            subject: thread.subject,
            post_date: thread.post_date.toISOString(),
            thread_id: thread.thread_id,
            message_count: thread.message_count,
            first_message_url: thread.url,
            last_activity: thread.post_date.toISOString(),
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'thread_url',
            ignoreDuplicates: false
          })
          .select()

        if (!upsertError) {
          if (data && data.length > 0) {
            // Check if this was an insert or update based on created_at vs updated_at
            const record = data[0]
            const createdAt = new Date(record.created_at)
            const updatedAt = new Date(record.updated_at)
            
            if (Math.abs(createdAt.getTime() - updatedAt.getTime()) < 1000) {
              insertedCount++ // New record
              console.log(`Inserted new thread: ${thread.subject}`)
            } else {
              updatedCount++ // Updated existing record
              console.log(`Updated existing thread: ${thread.subject}`)
            }
          }
        } else {
          console.error('Error upserting thread:', upsertError)
        }
      } catch (error) {
        console.error('Error processing thread:', error)
      }
    }

    // Update weekly discussion with results
    if (weeklyDiscussion) {
      await supabaseClient
        .from('weekly_discussions')
        .update({
          total_threads: insertedCount + updatedCount,
          total_messages: threads.reduce((sum, t) => sum + t.message_count, 0),
          processing_status: 'completed',
          fetch_completed_at: new Date().toISOString()
        })
        .eq('id', weeklyDiscussion.id)
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully processed ${threads.length} mail threads (${insertedCount} new, ${updatedCount} updated)`,
        threads_found: threads.length,
        threads_stored: insertedCount,
        threads_updated: updatedCount,
        date_range: {
          start: startDate.toISOString(),
          end: endDate.toISOString()
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error fetching mail threads:', error)
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})

async function fetchMailThreadsForDateRange(startDate: Date, endDate: Date): Promise<MailThread[]> {
  const threads: MailThread[] = []
  
  // Get unique year-month combinations for the date range
  const monthsToFetch = getMonthsInRange(startDate, endDate)
  
  for (const { year, month } of monthsToFetch) {
    try {
      console.log(`Fetching threads for ${year}-${month.toString().padStart(2, '0')}`)
      const monthThreads = await fetchMonthThreads(year, month, startDate, endDate)
      threads.push(...monthThreads)
    } catch (error) {
      console.error(`Error fetching threads for ${year}-${month}:`, error)
    }
  }
  
  return threads
}

async function fetchMonthThreads(year: number, month: number, startDate: Date, endDate: Date): Promise<MailThread[]> {
  const monthStr = month.toString().padStart(2, '0')
  const url = `https://www.postgrespro.com/list/pgsql-hackers/${year}-${monthStr}`
  
  console.log(`Fetching from: ${url}`)
  
  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    const html = await response.text()
    return parseMailThreadsFromHtml(html, startDate, endDate, year, month)
  } catch (error) {
    console.error(`Failed to fetch ${url}:`, error)
    return []
  }
}

function parseMailThreadsFromHtml(html: string, startDate: Date, endDate: Date, year: number, month: number): MailThread[] {
  const threads: MailThread[] = []
  
  console.log(`Starting to parse HTML for ${year}-${month}, looking for dates between ${startDate.toDateString()} and ${endDate.toDateString()}`)
  
  // Extract all mail thread links first
  const linkPattern = /<a[^>]+href="(\/list\/id\/[^"]+)"[^>]*>([^<]+)<\/a>/g
  const allLinks = []
  
  let linkMatch
  while ((linkMatch = linkPattern.exec(html)) !== null) {
    const [fullMatch, href, subject] = linkMatch
    allLinks.push({
      href: href,
      subject: subject.trim(),
      index: linkMatch.index,
      fullMatch: fullMatch
    })
  }
  
  console.log(`Found ${allLinks.length} total mail thread links`)
  
  // Now find day headers to associate links with dates
  // Look for patterns like "19 September" or "20 September" in the HTML
  const dayPattern = /(\d{1,2})\s+(September|October|November|December|January|February|March|April|May|June|July|August)/gi
  
  const dayHeaders = []
  let dayMatch
  
  while ((dayMatch = dayPattern.exec(html)) !== null) {
    const dayNum = parseInt(dayMatch[1])
    const monthName = dayMatch[2]
    
    // Only consider valid days and current month
    if (dayNum >= 1 && dayNum <= 31) {
      dayHeaders.push({
        day: dayNum,
        monthName: monthName,
        index: dayMatch.index
      })
    }
  }
  
  console.log(`Found ${dayHeaders.length} day headers:`, dayHeaders.map(d => `${d.day} ${d.monthName}`))
  
  // Associate each link with the nearest preceding day header
  for (const link of allLinks) {
    let associatedDay = 1 // Default day
    
    // Find the most recent day header before this link
    for (let i = dayHeaders.length - 1; i >= 0; i--) {
      if (dayHeaders[i].index < link.index) {
        associatedDay = dayHeaders[i].day
        break
      }
    }
    
    // Create date for this thread
    const threadDate = new Date(year, month - 1, associatedDay)
    
    // Skip if outside our date range
    if (threadDate < startDate || threadDate > endDate) {
      console.log(`Skipping thread on day ${associatedDay} (outside date range)`)
      continue
    }
    
    // Extract time and author from the context around the link
    const contextStart = Math.max(0, link.index - 150)
    const contextEnd = Math.min(html.length, link.index + 300)
    const context = html.slice(contextStart, contextEnd)
    
    // Look for time pattern (HH:MM) before the link
    const timeMatches = context.match(/(\d{2}:\d{2})/g)
    const time = timeMatches ? timeMatches[timeMatches.length - 1] : '12:00'
    
    // Create precise thread date with time
    const [hours, minutes] = time.split(':').map(Number)
    const preciseDatetime = new Date(year, month - 1, associatedDay, hours, minutes)
    
    // Construct full URL
    const fullUrl = `https://www.postgrespro.com${link.href}`
    
    threads.push({
      url: fullUrl,
      subject: link.subject,
      post_date: preciseDatetime,
      thread_id: `${year}-${month}-${associatedDay}-${time.replace(':', '')}-${threads.length}`,
      message_count: 1
    })
    
    console.log(`Thread on ${associatedDay}/${month} at ${time}: "${link.subject}"`)
  }
  
  console.log(`Parsed ${threads.length} threads from ${year}-${month} for date range`)
  return threads
}

function getMonthsInRange(startDate: Date, endDate: Date): Array<{ year: number, month: number }> {
  const months: Array<{ year: number, month: number }> = []
  const current = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1)
  
  while (current <= end) {
    months.push({
      year: current.getFullYear(),
      month: current.getMonth() + 1
    })
    current.setMonth(current.getMonth() + 1)
  }
  
  return months
}

function getWeekStart(date: Date): Date {
  const weekStart = new Date(date)
  const day = weekStart.getDay()
  const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1) // Adjust when day is Sunday
  weekStart.setDate(diff)
  weekStart.setHours(0, 0, 0, 0)
  return weekStart
}
