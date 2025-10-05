import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { marked } from 'https://esm.sh/marked@11.1.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Subscriber {
  id: string
  email: string
  subscribed_at: string
  is_active: boolean
}

interface WeeklySummary {
  id: string
  week_start_date: string
  week_end_date: string
  summary_content: string
  top_discussions: any[]
  total_posts: number
  total_participants: number
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get the week start date (default to current week)
    const { weekStart } = await req.json().catch(() => ({ weekStart: null }))
    const weekStartDate = weekStart ? new Date(weekStart) : getWeekStart(new Date())
    
    // Log processing start
    await supabaseClient
      .from('processing_logs')
      .insert([{
        process_type: 'email_send',
        status: 'in_progress',
        message: `Sending summary for week starting ${weekStartDate.toISOString().split('T')[0]}`,
        started_at: new Date().toISOString()
      }])

    // Get the weekly summary
    const { data: summary, error: summaryError } = await supabaseClient
      .from('weekly_summaries')
      .select('*')
      .eq('week_start_date', weekStartDate.toISOString().split('T')[0])
      .single()

    if (summaryError || !summary) {
      throw new Error(`No summary found for week starting ${weekStartDate.toISOString().split('T')[0]}`)
    }

    // Get confirmed active subscribers
    const { data: subscribers, error: subscribersError } = await supabaseClient
      .from('subscribers')
      .select('id, email, subscribed_at, is_active, confirmation_status')
      .eq('is_active', true)
      .eq('confirmation_status', 'confirmed')

    if (subscribersError) {
      throw new Error(`Failed to get subscribers: ${subscribersError.message}`)
    }

    if (!subscribers || subscribers.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No active subscribers found',
          sent_count: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Send emails to all subscribers
    const emailResults = await sendEmailsToSubscribers(subscribers, summary)
    
    // Log processing completion
    await supabaseClient
      .from('processing_logs')
      .insert([{
        process_type: 'email_send',
        status: 'success',
        message: `Sent ${emailResults.successful} emails, ${emailResults.failed} failed`,
        completed_at: new Date().toISOString()
      }])

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Sent ${emailResults.successful} emails successfully`,
        sent_count: emailResults.successful,
        failed_count: emailResults.failed,
        total_subscribers: subscribers.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error sending summary:', error)
    
    // Log error
    try {
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )
      
      await supabaseClient
        .from('processing_logs')
        .insert([{
          process_type: 'email_send',
          status: 'error',
          message: error.message,
          completed_at: new Date().toISOString()
        }])
    } catch (logError) {
      console.error('Failed to log error:', logError)
    }

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

function getWeekStart(date: Date): Date {
  const weekStart = new Date(date)
  const day = weekStart.getDay()
  const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1) // Adjust when day is Sunday
  weekStart.setDate(diff)
  weekStart.setHours(0, 0, 0, 0)
  return weekStart
}

async function sendEmailsToSubscribers(subscribers: Subscriber[], summary: WeeklySummary): Promise<{successful: number, failed: number}> {
  let successful = 0
  let failed = 0

  for (const subscriber of subscribers) {
    try {
      console.log(`📧 INFO: Sending summary email to ${subscriber.email}`)
      const emailContent = createEmailContent(subscriber, summary)
      const subject = `PostgreSQL Weekly Summary - ${formatDate(summary.week_start_date)} to ${formatDate(summary.week_end_date)}`
      
      const emailSent = await sendSummaryEmail(subscriber.email, subject, emailContent)
      
      if (emailSent) {
        successful++
        console.log(`✅ INFO: Email sent successfully to ${subscriber.email}`)
      } else {
        failed++
        console.log(`❌ INFO: Failed to send email to ${subscriber.email}`)
      }
    } catch (error) {
      failed++
      console.log(`❌ INFO: Error sending email to ${subscriber.email}:`, error)
    }
  }

  return { successful, failed }
}

async function sendSummaryEmail(email: string, subject: string, htmlContent: string): Promise<boolean> {
  console.log(`📤 Attempting to send email to ${email}`)
  
  // Get Resend API key
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  
  if (!resendApiKey) {
    console.error('❌ RESEND_API_KEY not configured')
    return false
  }
  
  try {
    console.log(`📧 Sending via Resend to ${email}`)
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'PostgreSQL Hackers Digest <noreply@postgreshackersdigest.dev>',
        to: [email],
        subject: subject,
        html: htmlContent
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`❌ Resend API error for ${email}: ${response.status} - ${errorText}`)
      return false
    }
    
    const result = await response.json()
    console.log(`✅ Email sent successfully to ${email}`, result)
    return true
  } catch (error) {
    console.error(`❌ Failed to send email to ${email}:`, error)
    return false
  }
}

function simulateEmailSending(count: number): {successful: number, failed: number} {
  console.log(`Simulating sending ${count} emails`)
  return { successful: count, failed: 0 }
}

function createEmailContent(subscriber: Subscriber, summary: WeeklySummary): string {
  const weekStart = new Date(summary.week_start_date)
  const weekEnd = new Date(summary.week_end_date)
  
  // Convert markdown summary to HTML
  const htmlSummary = convertMarkdownToHtml(summary.summary_content)

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PostgreSQL Weekly Summary</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #2d3748; max-width: 700px; margin: 0 auto; padding: 20px; background: #f8fafc; }
    .summary-content { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .summary-content h1, .summary-content h2 { color: #336791; margin-top: 30px; margin-bottom: 15px; font-weight: 600; }
    .summary-content h1:first-child { margin-top: 0; }
    .summary-content h3 { color: #4a5568; margin-top: 25px; margin-bottom: 12px; font-weight: 600; }
    .summary-content h4 { color: #4a5568; margin-top: 20px; margin-bottom: 10px; font-weight: 600; }
    .summary-content ul, .summary-content ol { margin: 15px 0; padding-left: 25px; }
    .summary-content li { margin: 8px 0; }
    .summary-content a { color: #336791; text-decoration: none; font-weight: 500; }
    .summary-content a:hover { text-decoration: underline; }
    .summary-content p { margin: 15px 0; }
    .summary-content blockquote { border-left: 4px solid #336791; padding-left: 20px; margin: 20px 0; font-style: italic; background: #f7fafc; padding: 15px 20px; border-radius: 4px; }
    .summary-content code { background: #f1f5f9; padding: 2px 6px; border-radius: 3px; font-family: 'Monaco', 'Menlo', monospace; font-size: 0.9em; }
    .summary-content pre { background: #1a202c; color: #e2e8f0; padding: 20px; border-radius: 6px; overflow-x: auto; margin: 20px 0; }
    .summary-content pre code { background: none; padding: 0; color: inherit; }
    .summary-content table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    .summary-content th, .summary-content td { border: 1px solid #e2e8f0; padding: 12px; text-align: left; }
    .summary-content th { background: #f7fafc; font-weight: 600; color: #2d3748; }
    .summary-content hr { border: none; border-top: 2px solid #e2e8f0; margin: 30px 0; }
    .footer { text-align: center; margin-top: 40px; font-size: 12px; color: #718096; }
    .unsubscribe { margin-top: 20px; }
    .unsubscribe a { color: #336791; text-decoration: none; }
  </style>
</head>
<body>
  <div class="summary-content">
    ${htmlSummary}
  </div>

  <div class="footer">
    <p>This summary was generated automatically from the PostgreSQL mailing list discussions.</p>
    <p>You're receiving this because you subscribed to PostgreSQL Hackers Digest.</p>
    <div class="unsubscribe">
      <a href="https://postgreshackersdigest.dev/unsubscribe?email=${encodeURIComponent(subscriber.email)}">Unsubscribe</a> | 
      <a href="https://postgreshackersdigest.dev">Manage Subscription</a>
    </div>
  </div>
</body>
</html>
  `
}

// Configure marked for email-friendly output
marked.setOptions({
  gfm: true,          // GitHub Flavored Markdown
  breaks: true,       // Convert line breaks to <br> tags
  sanitize: false,    // We'll handle security ourselves
  smartLists: true,   // Better list handling
  smartypants: true,  // Smart quotes and typography
})

function convertMarkdownToHtml(markdown: string): string {
  if (!markdown) return ''
  
  // Use marked library for reliable markdown conversion
  let html = marked(markdown) as string
  
  // Add target="_blank" to external links for email compatibility
  html = html.replace(/<a href="([^"]+)"/g, '<a href="$1" target="_blank"')
  
  return html
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}
