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
  confirmation_status: string
}

interface WeeklySummary {
  id: string
  week_start_date: string
  week_end_date: string
  summary_content: string
  top_discussions: any[]
  total_posts: number
  total_participants: number
  created_at: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log(`🚀 INFO: Send summary to users function called - Method: ${req.method}`)
    
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get the emails from request body (support both single email and array)
    const body = await req.json().catch(() => ({}))
    const { email, emails } = body
    
    // Convert to array format
    let emailList: string[] = []
    if (emails && Array.isArray(emails)) {
      emailList = emails
    } else if (email) {
      emailList = [email]
    } else {
      throw new Error('Email or emails parameter is required')
    }

    if (emailList.length === 0) {
      throw new Error('At least one email is required')
    }

    console.log(`📧 INFO: Request to send summary to ${emailList.length} user(s)`)

    // Get the most recent weekly summary
    const { data: summary, error: summaryError } = await supabaseClient
      .from('weekly_summaries')
      .select('*')
      .order('week_end_date', { ascending: false })
      .limit(1)
      .single()

    if (summaryError || !summary) {
      console.log(`❌ INFO: No summary found in database`)
      throw new Error('No weekly summary found. Please generate a summary first.')
    }

    console.log(`📄 INFO: Found summary for week ending: ${summary.week_end_date}`)

    // Log batch start
    await supabaseClient
      .from('processing_logs')
      .insert([{
        process_type: 'email_send_batch',
        status: 'in_progress',
        message: `Processing ${emailList.length} email(s) with 1s delay between each`,
        metadata: {
          total_emails: emailList.length,
          summary_id: summary.id,
          week_end_date: summary.week_end_date
        },
        started_at: new Date().toISOString()
      }])

    // Process each email sequentially with 1 second delay
    const results: any[] = []
    let successful = 0
    let failed = 0
    let skipped = 0

    for (let i = 0; i < emailList.length; i++) {
      const currentEmail = emailList[i].trim()
      
      try {
        console.log(`\n📧 INFO: Processing ${i + 1}/${emailList.length}: ${currentEmail}`)

        // Verify subscriber exists and is active/confirmed
        const { data: subscriber, error: subscriberError } = await supabaseClient
          .from('subscribers')
          .select('id, email, subscribed_at, is_active, confirmation_status')
          .eq('email', currentEmail)
          .eq('is_active', true)
          .eq('confirmation_status', 'confirmed')
          .single()

        if (subscriberError || !subscriber) {
          console.log(`⚠️ INFO: Subscriber not found or not eligible: ${currentEmail}`)
          skipped++
          results.push({
            email: currentEmail,
            success: false,
            error: 'Subscriber not found, not active, or not confirmed'
          })
          continue
        }

        console.log(`✅ INFO: Subscriber verified: ${subscriber.email}`)

        // Send email to the subscriber
        const emailContent = createEmailContent(subscriber, summary)
        const subject = `PostgreSQL Weekly Summary - Week of ${formatDateWithOrdinal(summary.week_end_date)}`
        
        const emailSent = await sendSummaryEmail(subscriber.email, subject, emailContent)
        
        if (!emailSent) {
          failed++
          results.push({
            email: currentEmail,
            success: false,
            error: 'Failed to send email via Resend API'
          })
          
          // Log individual failure
          await supabaseClient
            .from('processing_logs')
            .insert([{
              process_type: 'email_send_individual',
              status: 'error',
              message: `Failed to send email to ${currentEmail}`,
              metadata: {
                email: currentEmail,
                summary_id: summary.id
              },
              completed_at: new Date().toISOString()
            }])
        } else {
          successful++
          results.push({
            email: currentEmail,
            success: true,
            message: 'Email sent successfully'
          })
          
          console.log(`✅ INFO: Email sent successfully to ${currentEmail}`)
          
          // Log individual success
          await supabaseClient
            .from('processing_logs')
            .insert([{
              process_type: 'email_send_individual',
              status: 'success',
              message: `Successfully sent summary to ${currentEmail}`,
              metadata: {
                email: currentEmail,
                summary_id: summary.id,
                week_end_date: summary.week_end_date
              },
              completed_at: new Date().toISOString()
            }])
        }

        // Wait 1 second before processing next email (except for the last one)
        if (i < emailList.length - 1) {
          console.log(`⏳ INFO: Waiting 1 second before next email...`)
          await new Promise(resolve => setTimeout(resolve, 1000))
        }

      } catch (error) {
        console.error(`❌ ERROR: Error processing ${currentEmail}:`, error)
        failed++
        results.push({
          email: currentEmail,
          success: false,
          error: error.message || 'Unexpected error'
        })
        
        // Log individual error
        await supabaseClient
          .from('processing_logs')
          .insert([{
            process_type: 'email_send_individual',
            status: 'error',
            message: `Error sending to ${currentEmail}: ${error.message}`,
            metadata: {
              email: currentEmail,
              error_detail: error.message
            },
            completed_at: new Date().toISOString()
          }])
        
        // Continue processing other emails
        if (i < emailList.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }
    }

    // Log batch completion
    const batchStatus = failed === 0 && skipped === 0 ? 'success' : 
                       successful > 0 ? 'partial_success' : 'error'
    
    await supabaseClient
      .from('processing_logs')
      .insert([{
        process_type: 'email_send_batch',
        status: batchStatus,
        message: `Batch completed: ${successful} sent, ${failed} failed, ${skipped} skipped`,
        metadata: {
          total_emails: emailList.length,
          successful,
          failed,
          skipped,
          summary_id: summary.id
        },
        completed_at: new Date().toISOString()
      }])

    console.log(`\n✅ INFO: Batch processing complete - ${successful} sent, ${failed} failed, ${skipped} skipped`)

    return new Response(
      JSON.stringify({ 
        success: successful > 0,
        summary: {
          total_emails: emailList.length,
          sent: successful,
          failed: failed,
          skipped: skipped,
          summary_id: summary.id,
          week_end_date: summary.week_end_date
        },
        results: results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('❌ ERROR: Error in send summary to users:', error)
    
    // Log error
    try {
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )
      
      await supabaseClient
        .from('processing_logs')
        .insert([{
          process_type: 'email_send_batch',
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
        status: 400
      }
    )
  }
})

async function sendSummaryEmail(email: string, subject: string, htmlContent: string): Promise<boolean> {
  console.log(`📤 Attempting to send email to ${email}`)
  
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

function formatDateWithOrdinal(dateString: string): string {
  const date = new Date(dateString)
  const day = date.getDate()
  const ordinal = (day: number) => {
    const s = ["th", "st", "nd", "rd"]
    const v = day % 100
    return day + (s[(v - 20) % 10] || s[v] || s[0])
  }
  return `${ordinal(day)} ${date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
}

