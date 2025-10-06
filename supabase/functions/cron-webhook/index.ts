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
      case 'fetch-mail-threads':
        // Call the fetch-mail-threads function
        console.log('🔄 Calling fetch-mail-threads function...')
        
        const fetchResponse = await fetch(`${supabaseUrl}/functions/v1/fetch-mail-threads`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            source: 'cron-webhook',
            triggered_at: new Date().toISOString()
          })
        })

        if (fetchResponse.ok) {
          const fetchResult = await fetchResponse.text()
          result = { 
            success: true, 
            message: 'fetch-mail-threads completed successfully',
            task,
            result: fetchResult
          }
          console.log('✅ fetch-mail-threads completed successfully')
        } else {
          const errorText = await fetchResponse.text()
          result = { 
            success: false, 
            message: `fetch-mail-threads failed: ${fetchResponse.status}`,
            task,
            error: errorText
          }
          console.error('❌ fetch-mail-threads failed:', errorText)
        }
        break

      case 'generate-summary':
        // Call the generate-summary function
        console.log('🔄 Calling generate-summary function...')
        
        const summaryResponse = await fetch(`${supabaseUrl}/functions/v1/generate-summary`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            source: 'cron-webhook',
            triggered_at: new Date().toISOString()
          })
        })

        if (summaryResponse.ok) {
          const summaryResult = await summaryResponse.text()
          result = { 
            success: true, 
            message: 'generate-summary completed successfully',
            task,
            result: summaryResult
          }
          console.log('✅ generate-summary completed successfully')
        } else {
          const errorText = await summaryResponse.text()
          result = { 
            success: false, 
            message: `generate-summary failed: ${summaryResponse.status}`,
            task,
            error: errorText
          }
          console.error('❌ generate-summary failed:', errorText)
        }
        break

      case 'send-summary':
        // Call the send-summary function
        console.log('🔄 Calling send-summary function...')
        
        const sendResponse = await fetch(`${supabaseUrl}/functions/v1/send-summary`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            source: 'cron-webhook',
            triggered_at: new Date().toISOString()
          })
        })

        if (sendResponse.ok) {
          const sendResult = await sendResponse.text()
          result = { 
            success: true, 
            message: 'send-summary completed successfully',
            task,
            result: sendResult
          }
          console.log('✅ send-summary completed successfully')
        } else {
          const errorText = await sendResponse.text()
          result = { 
            success: false, 
            message: `send-summary failed: ${sendResponse.status}`,
            task,
            error: errorText
          }
          console.error('❌ send-summary failed:', errorText)
        }
        break

      case 'fetch-thread-content':
        // Call the fetch-thread-content function
        console.log('🔄 Calling fetch-thread-content function...')
        
        const contentResponse = await fetch(`${supabaseUrl}/functions/v1/fetch-thread-content`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            source: 'cron-webhook',
            triggered_at: new Date().toISOString()
          })
        })

        if (contentResponse.ok) {
          const contentResult = await contentResponse.text()
          result = { 
            success: true, 
            message: 'fetch-thread-content completed successfully',
            task,
            result: contentResult
          }
          console.log('✅ fetch-thread-content completed successfully')
        } else {
          const errorText = await contentResponse.text()
          result = { 
            success: false, 
            message: `fetch-thread-content failed: ${contentResponse.status}`,
            task,
            error: errorText
          }
          console.error('❌ fetch-thread-content failed:', errorText)
        }
        break

      case 'full-pipeline':
        // Run the complete pipeline: fetch -> fetch-content -> generate -> send
        console.log('🔄 Running full pipeline...')
        
        // Start the pipeline asynchronously (don't wait for completion)
        // This prevents the webhook from timing out
        const pipelinePromise = (async () => {
          const pipeline = []
          
          try {
            // 1. Fetch mail threads
            console.log('📧 Step 1: Fetching mail threads...')
            const step1 = await fetch(`${supabaseUrl}/functions/v1/fetch-mail-threads`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${supabaseServiceKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ source: 'cron-pipeline' })
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
              console.log('📄 Step 2: Fetching thread content...')
              
              let allContentFetched = false
              let contentAttempts = 0
              const maxContentAttempts = 5 // Prevent infinite loops
              
              while (!allContentFetched && contentAttempts < maxContentAttempts) {
                contentAttempts++
                console.log(`📄 Content fetch attempt ${contentAttempts}/${maxContentAttempts}`)
                
                const step2 = await fetch(`${supabaseUrl}/functions/v1/fetch-thread-content`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${supabaseServiceKey}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({ source: 'cron-pipeline', attempt: contentAttempts })
                })
                
                const step2Result = step2.ok ? await step2.text() : await step2.text()
                
                // Check if there are still unprocessed threads
                if (step2.ok) {
                  try {
                    const resultData = JSON.parse(step2Result)
                    // If the function indicates all threads are processed, we're done
                    if (resultData.message && resultData.message.includes('No unprocessed')) {
                      allContentFetched = true
                      console.log('✅ All thread content fetched')
                    } else if (resultData.processedCount === 0) {
                      // If no threads were processed, we might be done or there's an issue
                      allContentFetched = true
                      console.log('⚠️ No more threads to process')
                    }
                  } catch (e) {
                    // If we can't parse the result, assume we need to continue
                    console.log('⚠️ Could not parse fetch-thread-content result, continuing...')
                  }
                } else {
                  // If the request failed, stop trying
                  allContentFetched = true
                  console.log('❌ fetch-thread-content failed, stopping attempts')
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
                
                // Small delay between attempts to avoid overwhelming the system
                if (!allContentFetched && contentAttempts < maxContentAttempts) {
                  await new Promise(resolve => setTimeout(resolve, 2000)) // 2 second delay
                }
              }

              // 3. Generate summary (only if content fetch completed)
              if (allContentFetched) {
                console.log('🤖 Step 3: Generating AI summary...')
                const step3 = await fetch(`${supabaseUrl}/functions/v1/generate-summary`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${supabaseServiceKey}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({ source: 'cron-pipeline' })
                })
                
                const step3Result = step3.ok ? await step3.text() : await step3.text()
                pipeline.push({
                  step: 'generate-summary',
                  success: step3.ok,
                  status: step3.status,
                  result: step3Result
                })

                // 4. Send summary (only if generate succeeded)
                if (step3.ok) {
                  console.log('📤 Step 4: Sending summary emails...')
                  const step4 = await fetch(`${supabaseUrl}/functions/v1/send-summary`, {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${supabaseServiceKey}`,
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ source: 'cron-pipeline' })
                  })
                  
                  const step4Result = step4.ok ? await step4.text() : await step4.text()
                  pipeline.push({
                    step: 'send-summary',
                    success: step4.ok,
                    status: step4.status,
                    result: step4Result
                  })
                }
              } else {
                pipeline.push({
                  step: 'generate-summary',
                  success: false,
                  status: 0,
                  result: 'Skipped - thread content fetch incomplete',
                  skipped: true
                })
                pipeline.push({
                  step: 'send-summary',
                  success: false,
                  status: 0,
                  result: 'Skipped - thread content fetch incomplete',
                  skipped: true
                })
              }
            }

            const allSuccessful = pipeline.every(step => step.success)
            console.log(`🎉 Full pipeline completed: ${allSuccessful ? 'SUCCESS' : 'WITH FAILURES'}`)
            
            // Log the final result
            console.log('📋 Final pipeline results:', JSON.stringify(pipeline, null, 2))
            
          } catch (error) {
            console.error('❌ Pipeline execution error:', error)
          }
        })()
        
        // Return immediately without waiting for the pipeline to complete
        result = {
          success: true,
          message: 'Full pipeline started successfully (running asynchronously)',
          task,
          note: 'Pipeline is running in the background. Check logs for detailed progress.'
        }
        break

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

      case 'nightly-summary':
        // Run weekly summary generation and email sending (scheduled for Fridays 8am UTC)
        console.log('🌙 Running weekly summary generation and email sending...')
        
        // Start the weekly summary asynchronously
        const weeklyPromise = (async () => {
          const pipeline = []
          
          try {
            // 1. Generate summary
            console.log('🤖 Weekly: Generating AI summary...')
            const step1 = await fetch(`${supabaseUrl}/functions/v1/generate-summary`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${supabaseServiceKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ source: 'nightly-cron' })
            })
            
            const step1Result = step1.ok ? await step1.text() : await step1.text()
            pipeline.push({
              step: 'generate-summary',
              success: step1.ok,
              status: step1.status,
              result: step1Result
            })

            // 2. Send summary emails (only if generate succeeded)
            if (step1.ok) {
              console.log('📤 Weekly: Sending summary emails...')
              const step2 = await fetch(`${supabaseUrl}/functions/v1/send-summary`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${supabaseServiceKey}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ source: 'nightly-cron' })
              })
              
              const step2Result = step2.ok ? await step2.text() : await step2.text()
              pipeline.push({
                step: 'send-summary',
                success: step2.ok,
                status: step2.status,
                result: step2Result
              })
            }

            const allSuccessful = pipeline.every(step => step.success)
            console.log(`🎉 Weekly summary completed: ${allSuccessful ? 'SUCCESS' : 'WITH FAILURES'}`)
            
            // Log the final result
            console.log('📋 Weekly summary results:', JSON.stringify(pipeline, null, 2))
            
          } catch (error) {
            console.error('❌ Weekly summary execution error:', error)
          }
        })()
        
        // Return immediately without waiting for the weekly summary to complete
        result = {
          success: true,
          message: 'Weekly summary generation started successfully (running asynchronously)',
          task,
          note: 'Weekly summary is running in the background. Check logs for detailed progress.'
        }
        break

      default:
        result = { 
          success: false, 
          message: `Unknown task: ${task}. Available tasks: fetch-mail-threads, fetch-thread-content, generate-summary, send-summary, full-pipeline, hourly-fetch, nightly-summary`,
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
