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
        
        // Run the hourly fetch and wait for it to complete
        const pipeline: any[] = []
        
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
          
          // Log the result immediately
          if (step1.ok) {
            console.log(`✅ Hourly: fetch-mail-threads succeeded (status: ${step1.status})`)
            try {
              const resultData = JSON.parse(step1Result)
              console.log(`📊 Hourly: fetch-mail-threads result:`, JSON.stringify(resultData, null, 2))
            } catch (e) {
              console.log(`📊 Hourly: fetch-mail-threads response (non-JSON): ${step1Result.substring(0, 500)}`)
            }
          } else {
            console.error(`❌ Hourly: fetch-mail-threads failed (status: ${step1.status})`)
            console.error(`❌ Hourly: Error response: ${step1Result.substring(0, 1000)}`)
          }
          
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
            const maxContentAttempts = 3 // Process up to 600 threads (3 attempts × 200 batch size)
            
            while (!allContentFetched && contentAttempts < maxContentAttempts) {
              contentAttempts++
              console.log(`📄 Hourly content fetch attempt ${contentAttempts}/${maxContentAttempts}`)
              
              const step2 = await fetch(`${supabaseUrl}/functions/v1/fetch-thread-content`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${supabaseServiceKey}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                  source: 'hourly-cron', 
                  attempt: contentAttempts,
                  batchSize: 200 // Increased batch size to process more threads per call
                })
              })
              
              const step2Result = step2.ok ? await step2.text() : await step2.text()
              
              // Log the result immediately
              if (step2.ok) {
                console.log(`✅ Hourly: fetch-thread-content attempt ${contentAttempts} succeeded (status: ${step2.status})`)
                try {
                  const resultData = JSON.parse(step2Result)
                  console.log(`📊 Hourly: fetch-thread-content result:`, JSON.stringify(resultData, null, 2))
                  
                  // Check if there are still unprocessed threads
                  if (resultData.message && resultData.message.includes('No unprocessed')) {
                    allContentFetched = true
                    console.log('✅ Hourly: All thread content fetched')
                  } else if (resultData.processedCount === 0 && resultData.remaining_count === 0) {
                    allContentFetched = true
                    console.log('✅ Hourly: All threads processed')
                  } else if (resultData.remaining_count === 0) {
                    allContentFetched = true
                    console.log('✅ Hourly: No more threads remaining')
                  }
                } catch (e) {
                  console.log('⚠️ Hourly: Could not parse fetch-thread-content result, continuing...')
                  console.log(`⚠️ Hourly: Raw response: ${step2Result.substring(0, 500)}`)
                }
              } else {
                console.error(`❌ Hourly: fetch-thread-content attempt ${contentAttempts} failed (status: ${step2.status})`)
                console.error(`❌ Hourly: Error response: ${step2Result.substring(0, 1000)}`)
                // Don't stop on error, continue to next attempt
              }
              
              pipeline.push({
                step: `fetch-thread-content-${contentAttempts}`,
                success: step2.ok,
                status: step2.status,
                result: step2Result.substring(0, 500), // Truncate to avoid huge logs
                attempts: contentAttempts,
                completed: allContentFetched
              })
              
              // Small delay between attempts
              if (!allContentFetched && contentAttempts < maxContentAttempts) {
                await new Promise(resolve => setTimeout(resolve, 500)) // Reduced delay to 500ms
              }
            }
          }

          const allSuccessful = pipeline.every((step: any) => step.success)
          console.log(`🎉 Hourly fetch completed: ${allSuccessful ? 'SUCCESS' : 'WITH FAILURES'}`)
          
          // Log the final result
          console.log('📋 Hourly fetch results:', JSON.stringify(pipeline, null, 2))
          
          result = {
            success: allSuccessful,
            message: `Hourly data fetch completed. ${pipeline.length} steps executed.`,
            task,
            pipeline: pipeline.map((p: any) => ({
              step: p.step,
              success: p.success,
              status: p.status
            }))
          }
          
        } catch (error) {
          console.error('❌ Hourly fetch execution error:', error)
          result = {
            success: false,
            message: `Hourly fetch failed: ${error.message}`,
            task,
            error: error.message
          }
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
