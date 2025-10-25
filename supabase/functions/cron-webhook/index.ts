import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { searchParams } = new URL(req.url)
    let task = searchParams.get('task')
    let secret = searchParams.get('secret')
    
    // If not in URL params, try to get from POST body
    if (!task || !secret) {
      try {
        const body = await req.json()
        task = task || body.task
        secret = secret || body.secret
      } catch (e) {
        // If JSON parsing fails, continue with URL params
      }
    }
    
    console.log(`🔍 Webhook called with task: ${task}`)
    console.log(`🔍 Received secret: ${secret}`)
    
    // Simple authentication using a secret parameter
    const expectedSecret = Deno.env.get('CRON_WEBHOOK_SECRET')
    console.log(`🔍 Expected secret: ${expectedSecret}`)
    console.log(`🔍 Environment variable CRON_WEBHOOK_SECRET: ${Deno.env.get('CRON_WEBHOOK_SECRET')}`)
    
    if (secret !== expectedSecret) {
      console.error(`❌ Authentication failed. Expected: ${expectedSecret}, Got: ${secret}`)
      return new Response(
        JSON.stringify({ error: 'Unauthorized', expected: expectedSecret.substring(0, 5) + '...', received: secret?.substring(0, 5) + '...' }),
        { 
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Get the Supabase URL and service key for making internal calls
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('❌ Missing Supabase configuration')
      return new Response(
        JSON.stringify({ 
          error: 'Missing Supabase configuration',
          hasUrl: !!supabaseUrl,
          hasServiceKey: !!supabaseServiceKey
        }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    console.log(`✅ Authentication successful for task: ${task}`)
    let result = { success: false, message: 'Unknown task', task }

    switch (task) {





      case 'hourly-fetch':
        // Run hourly data fetching: fetch threads + content
        console.log('⏰ Running hourly data fetch...')
        
        // Start the hourly fetch asynchronously
        const hourlyPromise = (async () => {
          const pipeline = []
          
          try {
            // 1. Fetch mail threads
            console.log('📧 Hourly: Fetching mail threads...')
            const step1 = await fetch(`${supabaseUrl}/functions/v1/fetch-mail-threads`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${supabaseServiceKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ source: 'hourly-cron' })
            })
            
            const step1Result = step1.ok ? await step1.text() : await step1.text()
            pipeline.push({
              step: 'fetch-mail-threads',
              success: step1.ok,
              status: step1.status,
              result: step1Result
            })

            // 2. Fetch thread content (only if fetch threads succeeded)
            if (step1.ok) {
              console.log('📄 Hourly: Fetching thread content...')
              
              let allContentFetched = false
              let contentAttempts = 0
              const maxContentAttempts = 3 // Fewer attempts for hourly fetch
              
              while (!allContentFetched && contentAttempts < maxContentAttempts) {
                contentAttempts++
                console.log(`📄 Hourly content fetch attempt ${contentAttempts}/${maxContentAttempts}`)
                
                const step2 = await fetch(`${supabaseUrl}/functions/v1/fetch-thread-content`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${supabaseServiceKey}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({ source: 'hourly-cron', attempt: contentAttempts })
                })
                
                const step2Result = step2.ok ? await step2.text() : await step2.text()
                
                // Check if there are still unprocessed threads
                if (step2.ok) {
                  try {
                    const resultData = JSON.parse(step2Result)
                    if (resultData.message && resultData.message.includes('No unprocessed')) {
                      allContentFetched = true
                      console.log('✅ Hourly: All thread content fetched')
                    } else if (resultData.processedCount === 0) {
                      allContentFetched = true
                      console.log('⚠️ Hourly: No more threads to process')
                    }
                  } catch (e) {
                    console.log('⚠️ Hourly: Could not parse fetch-thread-content result, continuing...')
                  }
                } else {
                  allContentFetched = true
                  console.log('❌ Hourly: fetch-thread-content failed, stopping attempts')
                }
                
                // Add result for the first attempt or if it's the last attempt
                if (contentAttempts === 1 || contentAttempts === maxContentAttempts || allContentFetched) {
                  pipeline.push({
                    step: `fetch-thread-content-${contentAttempts}`,
                    success: step2.ok,
                    status: step2.status,
                    result: step2Result,
                    attempts: contentAttempts,
                    completed: allContentFetched
                  })
                }
                
                // Small delay between attempts
                if (!allContentFetched && contentAttempts < maxContentAttempts) {
                  await new Promise(resolve => setTimeout(resolve, 1000)) // 1 second delay for hourly
                }
              }
            }

            const allSuccessful = pipeline.every(step => step.success)
            console.log(`🎉 Hourly fetch completed: ${allSuccessful ? 'SUCCESS' : 'WITH FAILURES'}`)
            
            // Log the final result
            console.log('📋 Hourly fetch results:', JSON.stringify(pipeline, null, 2))
            
          } catch (error) {
            console.error('❌ Hourly fetch execution error:', error)
          }
        })()
        
        // Return immediately without waiting for the hourly fetch to complete
        result = {
          success: true,
          message: 'Hourly data fetch started successfully (running asynchronously)',
          task,
          note: 'Hourly fetch is running in the background. Check logs for detailed progress.'
        }
        break


      default:
        result = { 
          success: false, 
          message: `Unknown task: ${task}. Available tasks: hourly-fetch`,
          task 
        }
    }

    return new Response(
      JSON.stringify(result),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: result.success ? 200 : 400
      }
    )

  } catch (error) {
    console.error('❌ Cron webhook error:', error)
    
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error.message,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
