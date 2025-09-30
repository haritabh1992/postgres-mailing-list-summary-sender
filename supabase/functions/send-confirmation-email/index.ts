import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ConfirmationEmailRequest {
  email: string
  confirmationToken: string
  confirmationUrl: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email, confirmationToken, confirmationUrl }: ConfirmationEmailRequest = await req.json()

    if (!email || !confirmationToken || !confirmationUrl) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing required fields: email, confirmationToken, confirmationUrl' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
          status: 400 
        }
      )
    }

    // Send confirmation email
    const emailResult = await sendConfirmationEmail(email, confirmationToken, confirmationUrl)
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Confirmation email sent successfully',
        email: email
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error sending confirmation email:', error)
    
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

async function sendConfirmationEmail(email: string, confirmationToken: string, confirmationUrl: string): Promise<void> {
  // Create unsubscribe URL (can be used immediately)
  const unsubscribeUrl = `${confirmationUrl.split('/confirm')[0]}/unsubscribe?email=${encodeURIComponent(email)}`
  
  // Get Resend API key
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  
  if (!resendApiKey) {
    const errorMsg = 'RESEND_API_KEY not configured. Please add it to Supabase Edge Functions secrets.'
    console.error('⚠️ ' + errorMsg)
    console.log(`📧 Email: ${email}`)
    console.log(`🔗 Confirmation URL: ${confirmationUrl}`)
    console.log(`🎫 Token: ${confirmationToken}`)
    console.log(`⏰ Expires: 5 minutes from now`)
    console.log(`\n📝 For testing, you can manually visit: ${confirmationUrl}`)
    throw new Error(errorMsg)
  }
  
  try {
    const emailContent = createConfirmationEmailContent(confirmationUrl, unsubscribeUrl)
    
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'PostgreSQL Hackers Digest <noreply@postgreshackersdigest.dev>',
        to: [email],
        subject: 'Confirm your subscription to PostgreSQL Hackers Digest',
        html: emailContent
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Resend API error: ${response.status} - ${errorText}`)
      throw new Error(`Failed to send email via Resend: ${response.status} - ${errorText}`)
    }
    
    const result = await response.json()
    console.log(`✅ Resend email sent successfully to ${email}`, result)
  } catch (error) {
    console.error('Failed to send confirmation email via Resend:', error)
    throw error
  }
}

function createConfirmationEmailContent(confirmationUrl: string, unsubscribeUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirm Your Subscription</title>
  <style>
    body { 
      font-family: Arial, sans-serif; 
      line-height: 1.6; 
      color: #333; 
      max-width: 500px; 
      margin: 0 auto; 
      padding: 20px; 
    }
    .header { 
      text-align: center; 
      margin-bottom: 30px; 
    }
    .button { 
      display: inline-block; 
      background: #336791; 
      color: white !important; 
      padding: 12px 24px; 
      text-decoration: none; 
      border-radius: 5px; 
      font-weight: bold; 
      margin: 20px 0; 
    }
    .footer { 
      text-align: center; 
      margin-top: 30px; 
      font-size: 12px; 
      color: #666; 
      border-top: 1px solid #eee;
      padding-top: 20px;
    }
    .footer a {
      color: #666;
      text-decoration: none;
    }
    .warning {
      background: #fff3cd;
      border: 1px solid #ffeaa7;
      color: #856404;
      padding: 12px;
      border-radius: 4px;
      margin: 15px 0;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🐘 Confirm Your Subscription</h1>
    <p style="color: #666; margin: 0;">PostgreSQL Hackers Digest</p>
  </div>
  
  <p>Hi there!</p>
  
  <p>You've subscribed (or re-subscribed) to receive weekly AI-powered summaries of the most important discussions from the PostgreSQL hackers mailing list.</p>
  
  <p><strong>Please confirm your subscription by clicking the button below:</strong></p>
  
  <div style="text-align: center; margin: 25px 0;">
    <a href="${confirmationUrl}" class="button">✓ Confirm Subscription</a>
  </div>
  
  <div class="warning">
    <strong>⏰ Important:</strong> This confirmation link expires in 5 minutes for security.
  </div>
  
  <p><strong>What you'll get:</strong></p>
  <ul style="margin: 15px 0;">
    <li>Weekly digest of top 10 PostgreSQL discussions</li>
    <li>Delivered every Monday to your inbox</li>
    <li>Curated by AI to save you time</li>
  </ul>
  
  <p style="font-size: 14px; color: #666;">If you didn't subscribe, you can safely ignore this email or <a href="${unsubscribeUrl}" style="color: #666;">unsubscribe here</a>.</p>

  <div class="footer">
    <p>This service is not affiliated with the PostgreSQL Global Development Group.</p>
    <p><a href="${unsubscribeUrl}">Unsubscribe</a> | © 2024 PostgreSQL Weekly Summary</p>
  </div>
</body>
</html>
  `
}
