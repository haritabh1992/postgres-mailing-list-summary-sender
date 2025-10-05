import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import he from 'https://esm.sh/he@1.2.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface MailThreadContent {
  message_id: string
  subject: string
  author_email: string | null
  content: string
  thread_id: string
  posted_at: string
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

    console.log('🔍 INFO: Starting to fetch thread content from mail_threads table')

    // Get batch size from request or default to 100
    const { batchSize } = await req.json().catch(() => ({ batchSize: 100 }))
    const actualBatchSize = Math.min(Math.max(batchSize || 100, 10), 500) // Between 10-500

    console.log(`📦 INFO: Processing batch of ${actualBatchSize} threads`)

    // Get unprocessed mail threads in batches
    const { data: mailThreads, error: threadsError } = await supabaseClient
      .from('mail_threads')
      .select('*')
      .eq('is_processed', false)
      .order('post_date', { ascending: false })
      .limit(actualBatchSize)

    if (threadsError) {
      throw new Error(`Failed to get mail threads: ${threadsError.message}`)
    }

    // Get total count of unprocessed threads
    const { count: totalUnprocessed } = await supabaseClient
      .from('mail_threads')
      .select('*', { count: 'exact', head: true })
      .eq('is_processed', false)

    console.log(`📊 INFO: Found ${mailThreads?.length || 0} threads in this batch`)
    console.log(`📊 INFO: Total unprocessed threads remaining: ${totalUnprocessed || 0}`)

    if (!mailThreads || mailThreads.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No unprocessed mail threads found',
          processed_count: 0,
          remaining_count: totalUnprocessed || 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let processedCount = 0
    let errorCount = 0

    // Process each thread
    for (const thread of mailThreads) {
      try {
        console.log(`📧 INFO: Processing thread: "${thread.subject}"`)
        console.log(`🌐 INFO: Fetching content from: ${thread.thread_url}`)

        const threadContent = await fetchThreadContent(thread.thread_url)
        
        if (threadContent) {
          // Update the mail_threads table with processed content
          const { error: insertError } = await supabaseClient
            .from('mail_threads')
            .update({
              subject: threadContent.subject,
              thread_id: threadContent.thread_id,
              content: threadContent.content,
              author_name: threadContent.author_email,
              is_processed: true,
              updated_at: new Date().toISOString()
            })
            .eq('thread_url', thread.thread_url)

          if (insertError) {
            console.log(`❌ INFO: Error storing thread content: ${insertError.message}`)
            errorCount++
          } else {
            // Mark thread as processed
            await supabaseClient
              .from('mail_threads')
              .update({ is_processed: true })
              .eq('id', thread.id)

            processedCount++
            console.log(`✅ INFO: Successfully processed and stored thread content`)
          }
        } else {
          console.log(`⚠️ INFO: Could not extract content from thread`)
          errorCount++
        }

        // Add small delay to avoid overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 1000))

      } catch (error) {
        console.log(`❌ INFO: Error processing thread "${thread.subject}": ${error.message}`)
        errorCount++
      }
    }

    console.log(`📈 INFO: Processing complete - ${processedCount} successful, ${errorCount} errors`)

    // Get updated count of remaining unprocessed threads
    const { count: remainingUnprocessed } = await supabaseClient
      .from('mail_threads')
      .select('*', { count: 'exact', head: true })
      .eq('is_processed', false)

    console.log(`📊 INFO: Remaining unprocessed threads: ${remainingUnprocessed || 0}`)

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${processedCount} mail threads successfully (${errorCount} errors). ${remainingUnprocessed || 0} threads remaining.`,
        processed_count: processedCount,
        error_count: errorCount,
        batch_size: mailThreads.length,
        remaining_count: remainingUnprocessed || 0,
        total_processed: (totalUnprocessed || 0) - (remainingUnprocessed || 0)
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.log('❌ INFO: Error in fetch-thread-content function:', error)
    
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

async function fetchThreadContent(threadUrl: string): Promise<MailThreadContent | null> {
  try {
    console.log(`🌐 INFO: Fetching HTML from: ${threadUrl}`)
    
    const response = await fetch(threadUrl)
    if (!response.ok) {
      console.log(`❌ INFO: HTTP error ${response.status} for ${threadUrl}`)
      return null
    }

    const html = await response.text()
    console.log(`📄 INFO: Received HTML content (${html.length} characters)`)

    // Extract email content from the PostgresPro mail archive page
    const content = parseEmailContentFromHtml(html, threadUrl)
    
    if (content) {
      console.log(`✅ INFO: Successfully parsed email content (${content.content.length} chars)`)
    } else {
      console.log(`❌ INFO: Failed to parse email content from HTML`)
    }

    return content
  } catch (error) {
    console.log(`❌ INFO: Error fetching thread content: ${error.message}`)
    return null
  }
}

function cleanEmailContent(content: string): string {
  // Step 1: Decode HTML entities
  let cleaned = he.decode(content)
  
  // Step 2: Normalize line endings and remove control characters
  cleaned = cleaned
    .replace(/\r\n/g, '\n')  // Convert Windows line endings
    .replace(/\r/g, '\n')    // Convert Mac line endings
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control chars except \n and \t
    .trim() // Remove leading/trailing whitespace
  
  return cleaned
}

function parseEmailContentFromHtml(html: string, threadUrl: string): MailThreadContent | null {
  try {
    console.log(`📝 INFO: Parsing email content from HTML`)

    // Extract message ID from URL (e.g., from /list/id/abc123@domain.com)
    const messageIdMatch = threadUrl.match(/\/list\/id\/([^\/]+)$/)
    const messageId = messageIdMatch ? messageIdMatch[1] : `extracted-${Date.now()}`

    // Extract subject from table structure (td element after th with "Subject")
    let subject = 'Unknown Subject'
    
    // First try to find subject in table structure: <th>Subject</th> followed by <td>content</td>
    const tableSubjectMatch = html.match(/<th[^>]*>Subject<\/th>\s*<td[^>]*>([^<]+)<\/td>/i)
    if (tableSubjectMatch) {
      subject = tableSubjectMatch[1].trim()
    } else {
      // Fallback to title tag
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
      if (titleMatch) {
        subject = titleMatch[1].trim()
      } else {
        // Final fallback to h1/h2 tags
        const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i)
        if (h1Match) {
          subject = h1Match[1].trim()
        }
      }
    }

    // Extract author from table structure (td element after th with "From")
    let authorEmail: string | null = null
    
    // Find author in table structure: <th>From</th> followed by <td>content</td>
    const tableFromMatch = html.match(/<th[^>]*>From<\/th>\s*<td[^>]*>([^<]+)<\/td>/i)
    if (tableFromMatch) {
      const authorText = tableFromMatch[1].trim()
      
      // Try to extract email from the author text if it contains one
      const emailMatch = authorText.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/)
      if (emailMatch) {
        authorEmail = emailMatch[1]
      } else {
        // If no email found, use the full author text
        authorEmail = authorText
      }
    }

    // Extract main email content from message-body div
    let content = ''
    
    // Find content in div with class "message-body" and extract text from <pre> tag
    const messageBodyMatch = html.match(/<div[^>]*class="[^"]*message-body[^"]*"[^>]*>[\s\S]*?<pre[^>]*>([\s\S]*?)<\/pre>[\s\S]*?<\/div>/i)
    if (messageBodyMatch) {
      content = cleanEmailContent(messageBodyMatch[1])
    }

    // Extract thread ID from message ID or URL
    const threadId = messageId.split('@')[0] || `thread-${Date.now()}`

    // Extract date from table structure (td element after th with "Date")
    let postedAt = new Date().toISOString()
    
    // Find date in table structure: <th>Date</th> followed by <td>content</td>
    const tableDateMatch = html.match(/<th[^>]*>Date<\/th>\s*<td[^>]*>([^<]+)<\/td>/i)
    if (tableDateMatch) {
      const dateText = tableDateMatch[1].trim()
      try {
        const parsedDate = new Date(dateText)
        if (!isNaN(parsedDate.getTime())) {
          postedAt = parsedDate.toISOString()
        }
      } catch (e) {
        // Keep default date if parsing fails
      }
    }

    const result = {
      message_id: messageId,
      subject: subject,
      author_email: authorEmail,
      content: content,
      thread_id: threadId,
      posted_at: postedAt
    }

    console.log(`📝 INFO: Parsed email data:`)
    console.log(`  Message ID: ${result.message_id}`)
    console.log(`  Subject: ${result.subject}`)
    console.log(`  Author: ${result.author_email || 'Unknown'}`)
    console.log(`  Content length: ${result.content} characters`)
    console.log(`  Posted at: ${result.posted_at}`)

    return result
  } catch (error) {
    console.log(`❌ INFO: Error parsing email content: ${error.message}`)
    return null
  }
}
