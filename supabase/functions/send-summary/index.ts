import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #336791; color: white; padding: 25px; text-align: center; border-radius: 8px 8px 0 0; }
    .header h1 { margin: 0 0 10px 0; font-size: 24px; }
    .header .week-info { margin: 10px 0; font-size: 16px; opacity: 0.9; }
    .header .stats { margin-top: 15px; font-size: 14px; opacity: 0.8; }
    .content { background: #f9f9f9; padding: 25px; border-radius: 0 0 8px 8px; }
    .summary-content { background: white; padding: 20px; border-radius: 5px; border-left: 4px solid #336791; }
    .summary-content h1, .summary-content h2 { color: #336791; margin-top: 25px; margin-bottom: 15px; }
    .summary-content h3 { color: #2a5a7a; margin-top: 20px; margin-bottom: 10px; }
    .summary-content ul, .summary-content ol { margin: 15px 0; padding-left: 25px; }
    .summary-content li { margin: 8px 0; }
    .summary-content a { color: #336791; text-decoration: none; font-weight: 500; }
    .summary-content a:hover { text-decoration: underline; }
    .summary-content p { margin: 12px 0; }
    .summary-content blockquote { border-left: 3px solid #336791; padding-left: 15px; margin: 15px 0; font-style: italic; }
    .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
    .unsubscribe { margin-top: 20px; }
    .unsubscribe a { color: #336791; text-decoration: none; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🐘 PostgreSQL Weekly Summary</h1>
    <div class="week-info">Week of ${formatDate(summary.week_start_date)} - ${formatDate(summary.week_end_date)}</div>
    <div class="stats">
      📊 ${summary.total_posts} posts • ${summary.total_participants} participants
    </div>
  </div>
  
  <div class="content">
    <div class="summary-content">
      ${htmlSummary}
    </div>
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

function convertMarkdownToHtml(markdown: string): string {
  if (!markdown) return ''
  
  let html = markdown
  
  // Convert headers
  html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>')
  html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>')
  
  // Convert bold text
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  
  // Convert italic text
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>')
  
  // Convert links [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
  
  // Convert unordered lists
  html = html.replace(/^- (.*$)/gm, '<li>$1</li>')
  html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
  
  // Convert numbered lists
  html = html.replace(/^\d+\. (.*$)/gm, '<li>$1</li>')
  html = html.replace(/(<li>.*<\/li>)/gs, (match) => {
    // Only wrap in <ol> if it's not already wrapped in <ul>
    if (!match.includes('<ul>')) {
      return `<ol>${match}</ol>`
    }
    return match
  })
  
  // Convert line breaks to paragraphs
  html = html.replace(/\n\n+/g, '</p><p>')
  html = html.replace(/\n/g, '<br>')
  
  // Wrap in paragraphs if not already wrapped
  if (!html.includes('<p>') && !html.includes('<h1>') && !html.includes('<h2>')) {
    html = `<p>${html}</p>`
  } else if (html.includes('</p><p>')) {
    html = `<p>${html}</p>`
  }
  
  // Clean up any double paragraph tags
  html = html.replace(/<p><\/p>/g, '')
  html = html.replace(/<p>\s*<p>/g, '<p>')
  html = html.replace(/<\/p>\s*<\/p>/g, '</p>')
  
  return html
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}
