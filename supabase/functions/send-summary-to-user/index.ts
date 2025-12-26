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
        from: 'PostgreSQL Hackers Digest <digest@postgreshackersdigest.dev>',
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
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
      line-height: 1.6; 
      color: #1f2937; 
      max-width: 896px; 
      margin: 0 auto; 
      padding: 20px; 
      background: #f0f9ff; 
    }
    .summary-wrapper { 
      background: white; 
      border-radius: 8px; 
      box-shadow: 0 4px 6px rgba(0,0,0,0.1); 
      overflow: hidden;
    }
    .summary-header {
      background: linear-gradient(to right, #336791, #2d5a7a);
      color: white;
      padding: 32px;
    }
    .summary-header h2 {
      color: white;
      font-size: 24px;
      font-weight: 700;
      margin: 0 0 16px 0;
    }
    .summary-header .stats {
      display: flex;
      flex-wrap: wrap;
      gap: 24px;
      color: #e0f2fe;
      font-size: 14px;
    }
    .summary-content { 
      padding: 32px; 
    }
    .summary-content h1 { 
      color: #1e40af; 
      font-size: 30px; 
      font-weight: 700; 
      margin-top: 0; 
      margin-bottom: 24px; 
    }
    .summary-content h2 { 
      color: #1e40af; 
      font-size: 24px; 
      font-weight: 600; 
      margin-top: 32px; 
      margin-bottom: 16px; 
    }
    .summary-content h3 { 
      color: #374151; 
      font-size: 20px; 
      font-weight: 600; 
      margin-top: 24px; 
      margin-bottom: 12px; 
    }
    .summary-content h4 { 
      color: #374151; 
      font-size: 18px; 
      font-weight: 600; 
      margin-top: 20px; 
      margin-bottom: 10px; 
    }
    .summary-content p { 
      color: #374151; 
      line-height: 1.75; 
      margin-bottom: 16px; 
      text-align: justify;
    }
    .summary-content strong { 
      color: #111827; 
      font-weight: 600; 
    }
    .summary-content ul, .summary-content ol { 
      margin: 16px 0; 
      padding-left: 24px; 
    }
    .summary-content li { 
      color: #374151; 
      margin: 8px 0; 
    }
    .summary-content a { 
      color: #336791; 
      text-decoration: none; 
    }
    .summary-content a:hover { 
      text-decoration: underline; 
    }
    .summary-content blockquote { 
      border-left: 4px solid #93c5fd; 
      padding-left: 16px; 
      margin: 20px 0; 
      font-style: italic; 
      background: #f0f9ff; 
      padding: 12px 16px; 
      border-radius: 4px; 
      color: #4b5563;
    }
    .summary-content code { 
      background: #f0f9ff; 
      color: #1e40af; 
      padding: 2px 8px; 
      border-radius: 4px; 
      font-family: 'Monaco', 'Menlo', 'Courier New', monospace; 
      font-size: 0.875em; 
    }
    .summary-content pre { 
      background: #111827; 
      color: #e5e7eb; 
      padding: 16px; 
      border-radius: 8px; 
      overflow-x: auto; 
      margin: 20px 0; 
    }
    .summary-content pre code { 
      background: none; 
      padding: 0; 
      color: inherit; 
    }
    .summary-content table { 
      width: 100%; 
      border-collapse: collapse; 
      margin: 20px 0; 
    }
    .summary-content th, .summary-content td { 
      border: 1px solid #d1d5db; 
      padding: 12px; 
      text-align: left; 
    }
    .summary-content th { 
      background: #f3f4f6; 
      font-weight: 600; 
      color: #111827; 
    }
    .summary-content hr { 
      border: none; 
      border-top: 1px solid #d1d5db; 
      margin: 32px 0; 
    }
    .tags-container {
      margin: 16px 0;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0;
      font-size: 14px;
    }
    .tags-container strong {
      margin-right: 8px;
      color: #374151;
    }
    .tag-separator {
      margin: 0 4px;
    }
    .tag {
      margin-right: 0;
    }
    .tag {
      display: inline-flex;
      align-items: center;
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      border: 1px solid;
      position: relative;
    }
    .tag[data-tag-source="commitfest"] {
      border-style: solid;
    }
    .tag[data-tag-source="commitfest"]::after {
      content: "●";
      font-size: 8px;
      margin-left: 6px;
      opacity: 0.6;
    }
    .tag[data-tag-source="ai"] {
      background-color: #f3f4f6;
      color: #1f2937;
      border-color: #d1d5db;
      border-style: dashed;
    }
    .tag[data-tag-source="ai"]::after {
      content: "◇";
      font-size: 8px;
      margin-left: 6px;
      opacity: 0.5;
      color: #6b7280;
    }
    .footer { 
      background: #f9fafb; 
      padding: 24px 32px; 
      border-top: 1px solid #e5e7eb;
      text-align: center; 
      font-size: 12px; 
      color: #6b7280; 
    }
    .footer p {
      margin: 8px 0;
      text-align: center;
    }
    .unsubscribe { 
      margin-top: 16px; 
    }
    .unsubscribe a { 
      color: #336791; 
      text-decoration: none; 
    }
    .unsubscribe a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="summary-wrapper">
    <div class="summary-header">
      <h2>Week of ${formatDateWithOrdinal(summary.week_end_date)}</h2>
      <div class="stats">
        <span>${summary.total_posts} posts</span>
        <span>${summary.total_participants} participants</span>
      </div>
    </div>
    <div class="summary-content">
      ${htmlSummary}
    </div>
    <div class="footer">
      <p>This summary was generated using AI and may not capture all nuances of the original discussions.</p>
      <p>Source: PostgreSQL Hackers Mailing List</p>
      <div class="unsubscribe">
        <a href="https://postgreshackersdigest.dev/unsubscribe?email=${encodeURIComponent(subscriber.email)}">Unsubscribe</a> | 
        <a href="https://postgreshackersdigest.dev">Manage Subscription</a>
      </div>
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
  
  // Protect tags container before markdown processing (same as website)
  const tagsContainerRegex = /<div class="tags-container">[\s\S]*?<\/div>/gi
  const tagsContainers: string[] = []
  let tagsIndex = 0
  let protectedMarkdown = markdown.replace(tagsContainerRegex, (match) => {
    tagsContainers.push(match)
    return `<!--TAGS_CONTAINER_PLACEHOLDER_${tagsIndex++}-->`
  })
  
  // Use marked library for reliable markdown conversion
  let html = marked(protectedMarkdown) as string
  
  // Restore protected tags containers
  tagsContainers.forEach((tags, index) => {
    const placeholder = `<!--TAGS_CONTAINER_PLACEHOLDER_${index}-->`
    html = html.split(placeholder).join(tags)
  })
  
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

