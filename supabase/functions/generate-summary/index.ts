import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TopDiscussion {
  thread_id: string
  subject: string
  post_count: number
  participants: number
  first_post_at: string
  last_post_at: string
  full_content?: any[]
}

interface WeeklySummary {
  week_start_date: string
  week_end_date: string
  summary_content: string
  top_discussions: TopDiscussion[]
  total_posts: number
  total_participants: number
}

serve(async (req) => {
  console.log(`🚀 INFO: Generate summary function called - Method: ${req.method}`)
  
  if (req.method === 'OPTIONS') {
    console.log(`✅ INFO: Handling OPTIONS request`)
    return new Response('ok', { headers: corsHeaders })
  }

  console.log(`🔧 INFO: Starting summary generation process...`)

  try {
    console.log(`🔗 INFO: Initializing Supabase client...`)
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    console.log(`✅ INFO: Supabase client initialized successfully`)

    console.log(`📅 INFO: Parsing request body...`)
    // Get the week start date (default to current week)
    const { weekStart } = await req.json().catch((e) => {
      console.log(`⚠️ INFO: Could not parse request body, using defaults:`, e.message)
      return { weekStart: null }
    })
    const weekStartDate = weekStart ? new Date(weekStart) : getWeekStart(new Date())
    
    console.log(`📅 INFO: Week start date determined: ${weekStartDate.toISOString()}`)
    
    console.log(`📝 INFO: Logging processing start to database...`)
    // Log processing start
    const { error: logStartError } = await supabaseClient
      .from('processing_logs')
      .insert([{
        process_type: 'summary_generation',
        status: 'in_progress',
        message: `Generating summary for week starting ${weekStartDate.toISOString().split('T')[0]}`,
        started_at: new Date().toISOString()
      }])

    if (logStartError) {
      console.log(`⚠️ INFO: Could not log processing start:`, logStartError)
    } else {
      console.log(`✅ INFO: Processing start logged successfully`)
    }

    console.log(`🔄 INFO: Will generate new summary (overwriting existing if present)...`)

    // Get mailing list posts for the last 7 days (full email content)
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    console.log(`🔍 INFO: Searching for mailing list posts from last 7 days:`)
    console.log(`  Since: ${sevenDaysAgo.toISOString()}`)
    console.log(`  Until: ${new Date().toISOString()}`)

    const { data: mailThreads, error: threadsError } = await supabaseClient
      .from('mail_threads')
      .select('*')
      .gte('post_date', sevenDaysAgo.toISOString())
      .order('post_date', { ascending: false })

    if (threadsError) {
      console.log(`❌ INFO: Error fetching mail threads:`, threadsError)
      throw new Error(`Failed to get mail threads: ${threadsError.message}`)
    }

    console.log(`📊 INFO: Found ${mailThreads?.length || 0} mail threads for the last 7 days`)
    
    if (mailThreads && mailThreads.length > 0) {
      console.log(`📧 INFO: Sample threads:`)
      mailThreads.slice(0, 5).forEach((thread, index) => {
        console.log(`  ${index + 1}. ${thread.post_date}: "${thread.subject}"`)
        console.log(`     Thread URL: ${thread.thread_url}`)
      })
    }

    if (!mailThreads || mailThreads.length === 0) {
      console.log(`❌ INFO: No mail threads found for the last 7 days`)
      throw new Error(`No mail threads found for the last 7 days. Try fetching mail threads first using "Fetch Mail Threads" button.`)
    }

    // Group threads by subject to create discussions
    const threadGroups = new Map<string, any[]>()
    mailThreads.forEach(thread => {
      const threadSubject = thread.subject
      if (!threadGroups.has(threadSubject)) {
        threadGroups.set(threadSubject, [])
      }
      threadGroups.get(threadSubject)!.push(thread)
    })

    console.log(`🧵 INFO: Grouped posts into ${threadGroups.size} discussion threads`)

    // Create all discussions with thread metadata
    const allDiscussions = Array.from(threadGroups.entries())
      .map(([threadSubject, threads]) => {
        const sortedThreads = threads.sort((a, b) => new Date(a.post_date).getTime() - new Date(b.post_date).getTime())
        // Count unique participants (authors)
        const uniqueAuthors = new Set(threads.map(thread => thread.author_name || thread.author_email || 'Unknown'))
        
        return {
          thread_id: sortedThreads[0].thread_id || sortedThreads[0].id || threadSubject,
          subject: threadSubject,
          post_count: threads.length, // Count of threads as posts
          participants: uniqueAuthors.size, // Count of unique authors/participants
          first_post_at: sortedThreads[0].post_date,
          last_post_at: sortedThreads[sortedThreads.length - 1].post_date,
          full_content: threads // Include thread metadata for AI processing
        }
      })
      .sort((a, b) => b.post_count - a.post_count) // Sort by post count

    // Get top 5 discussions with highest thread count
    const top5ByCount = allDiscussions.slice(0, 5)
    
    // Get 5 other discussions (excluding the top 5)
    const otherDiscussions = allDiscussions.slice(5, 10)
    
    // Combine both sets
    const topDiscussions = [...top5ByCount, ...otherDiscussions]

    console.log(`🎯 INFO: Created ${topDiscussions.length} top discussions with full content:`)
    console.log(`  Top 5 by thread count: ${top5ByCount.length} discussions`)
    console.log(`  Other 5 discussions: ${otherDiscussions.length} discussions`)
    topDiscussions.forEach((disc, index) => {
      const category = index < 5 ? '[TOP 5]' : '[OTHER 5]'
      console.log(`  ${index + 1}. ${category} "${disc.subject}" (${disc.post_count} posts, ${disc.participants} participants)`)
      const totalContentLength = disc.full_content.length
      console.log(`     Total content length: ${totalContentLength} threads`)
    })

    // Create stats from mail threads
    const uniqueParticipants = new Set(mailThreads.map(thread => thread.author_name || thread.author_email || 'Unknown'))
    
    const stats = {
      total_posts: mailThreads.length, // Count of threads as posts
      total_participants: uniqueParticipants.size, // Count of unique authors/participants
      total_subscribers: 0,
      date_range: {
        start: sevenDaysAgo.toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
      }
    }

    // Try to get subscriber count
    try {
      const { data: subscriberStats } = await supabaseClient.rpc('get_public_stats')
      if (subscriberStats && subscriberStats.length > 0) {
        stats.total_subscribers = subscriberStats[0].total_subscribers || 0
      }
    } catch (error) {
      console.log('Could not get subscriber stats:', error)
    }

    console.log(`📈 INFO: Weekly stats:`)
    console.log(`  Total posts: ${stats.total_posts}`)
    console.log(`  Total participants: ${stats.total_participants}`)
    console.log(`  Total subscribers: ${stats.total_subscribers}`)
    console.log(`  Date range: ${stats.date_range.start} to ${stats.date_range.end}`)

    // Generate AI summary
    console.log(`🤖 INFO: Starting AI summary generation...`)
    const actualStartDate = new Date(stats.date_range.start)
    const actualEndDate = new Date(stats.date_range.end)
    const summaryContent = await generateAISummary(topDiscussions, stats, actualStartDate, actualEndDate)
    console.log(`📝 INFO: Generated summary length: ${summaryContent.length} characters`)
    console.log(`📝 INFO: Summary preview: ${summaryContent.substring(0, 200)}...`)

    console.log(`💾 INFO: Storing weekly summary in database...`)
    // Create weekly summary (use upsert to overwrite existing)
    // Use the actual date range from the data, not artificial week calculation

    const { data: summary, error: summaryError } = await supabaseClient
      .from('weekly_summaries')
      .upsert({
        week_start_date: actualStartDate.toISOString().split('T')[0],
        week_end_date: actualEndDate.toISOString().split('T')[0],
        summary_content: summaryContent,
        top_discussions: topDiscussions,
        total_posts: stats.total_posts,
        total_participants: stats.total_participants,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'week_start_date,week_end_date',
        ignoreDuplicates: false
      })
      .select()
      .single()

    if (summaryError) {
      console.log(`❌ INFO: Error storing summary:`, summaryError)
      throw new Error(`Failed to create summary: ${summaryError.message}`)
    }

    console.log(`✅ INFO: Weekly summary stored successfully with ID: ${summary.id}`)

    console.log(`📊 INFO: Logging success to processing_logs...`)
    // Log success
    const { error: logSuccessError } = await supabaseClient
      .from('processing_logs')
      .insert([{
        process_type: 'summary_generation',
        status: 'success',
        message: `Generated summary for week starting ${weekStartDate.toISOString().split('T')[0]}`,
        completed_at: new Date().toISOString()
      }])

    if (logSuccessError) {
      console.log(`⚠️ INFO: Could not log success:`, logSuccessError)
    } else {
      console.log(`✅ INFO: Success logged to processing_logs`)
    }

    console.log(`🎉 INFO: Summary generation completed successfully!`)
    console.log(`📋 INFO: Summary ID: ${summary.id}`)
    console.log(`📅 INFO: Week: ${weekStartDate.toISOString().split('T')[0]}`)
    console.log(`🧵 INFO: Discussions: ${topDiscussions.length}`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Summary generated successfully',
        summary_id: summary.id,
        week_start: weekStartDate.toISOString().split('T')[0],
        discussions_count: topDiscussions.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error generating summary:', error)
    
    // Log error
    try {
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )
      
      await supabaseClient
        .from('processing_logs')
        .insert([{
          process_type: 'summary_generation',
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

async function generateAISummary(discussions: TopDiscussion[], stats: any, startDate: Date, endDate: Date): Promise<string> {
  console.log(`🤖 INFO: generateAISummary called with:`)
  console.log(`  Discussions count: ${discussions.length}`)
  console.log(`  Stats:`, stats)

  const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
  
  console.log(`🔑 INFO: OpenAI API key configured: ${openaiApiKey ? 'YES' : 'NO'}`)
  
  if (!openaiApiKey) {
    console.log('❌ ERROR: OpenAI API key not configured')
    throw new Error('OpenAI API key not configured')
  }

  try {
    console.log(`🔄 INFO: Generating individual summaries for each discussion...`)
    
    // Generate individual summaries for each discussion
    const individualSummaries: any[] = []
    
    for (let i = 0; i < discussions.length; i++) {
      const discussion = discussions[i]
      console.log(`📝 INFO: Processing discussion ${i + 1}/${discussions.length}: "${discussion.subject}"`)
      
      const discussionSummary = await generateIndividualDiscussionSummary(discussion, openaiApiKey)
      individualSummaries.push({
        subject: discussion.subject,
        summary: discussionSummary,
        post_count: discussion.post_count,
        participants: discussion.participants,
        first_post_at: discussion.first_post_at,
        last_post_at: discussion.last_post_at,
        thread_url: discussion.full_content?.[discussion.full_content.length - 1]?.thread_url
      })
      console.log(`✅ INFO: Summary generated for discussion ${i + 1} (${discussionSummary.length} chars)`)
    }
    
    console.log(`✅ INFO: Generated ${individualSummaries.length} individual summaries`)
    
    // Now combine all individual summaries into a final weekly summary
    console.log(`🔄 INFO: Combining individual summaries into final weekly summary...`)
    const finalSummary = combineSummariesIntoWeekly(individualSummaries, stats, startDate, endDate)
    
    console.log(`✅ INFO: Final weekly summary generated (${finalSummary.length} chars)`)
    return finalSummary
    
  } catch (error) {
    console.log('❌ ERROR: Failed to generate AI summary:', error)
    throw error
  }
}

async function generateIndividualDiscussionSummary(discussion: any, openaiApiKey: string): Promise<string> {
  console.log(`📝 INFO: Generating individual summary for: "${discussion.subject}"`)
  
  const prompt = createIndividualDiscussionPrompt(discussion)
  console.log(`📝 INFO: Individual prompt created (${prompt.length} characters)`)
  
  const requestBody = {
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'system',
        content: `You are an expert PostgreSQL core developer who creates detailed summaries 
          of individual mailing list discussions. Write a comprehensive summary that includes 
          specific technical details, exact function names, data structures, algorithms, 
          performance metrics, and implementation approaches discussed. Focus on concrete 
          technical decisions, code changes, and PostgreSQL internals mentioned. Avoid 
          high-level descriptions - include specific technical information that would be 
          valuable to PostgreSQL developers working on the codebase. Your summary should be 
          approximately 200 words.`
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    max_tokens: 2000,
    temperature: 0.7
  }
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.log(`❌ INFO: OpenAI API error for individual summary: ${errorText}`)
    throw new Error(`OpenAI API error: ${response.statusText}`)
  }

  const data = await response.json()
  return data.choices[0].message.content
}

function combineSummariesIntoWeekly(individualSummaries: any[], stats: any, weekStartDate: Date, weekEndDate: Date): string {
  console.log(`📝 INFO: Combining ${individualSummaries.length} individual summaries into weekly summary`)
  
  let weeklySummary = `# PostgreSQL Weekly Summary - ${weekStartDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })} to ${weekEndDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}

## Overview
This week saw ${stats.total_posts} posts from ${stats.total_participants} participants in the PostgreSQL mailing list, covering a range of important topics and technical discussions.

## Top Discussions

`

  // Add each individual summary as a section
  individualSummaries.forEach((summary, index) => {
    weeklySummary += `### ${index + 1}. ${summary.subject}

- **Posts**: ${summary.post_count}
- **Participants**: ${summary.participants}
- **Duration**: ${new Date(summary.first_post_at).toLocaleDateString()} - ${new Date(summary.last_post_at).toLocaleDateString()}
`
    
    if (summary.thread_url) {
      weeklySummary += `- **Reference Link**: [View Thread](${summary.thread_url})
`
    }
    
    weeklySummary += `
${summary.summary}

`
  })

  console.log(`📝 INFO: Weekly summary created (${weeklySummary.length} characters)`)
  return weeklySummary
}

function createIndividualDiscussionPrompt(discussion: any): string {
  console.log(`📝 INFO: Creating individual discussion prompt for: "${discussion.subject}"`)
  
  let discussionText = `## Discussion: ${discussion.subject}\n`
  discussionText += `- Posts: ${discussion.post_count}\n`
  discussionText += `- Participants: ${discussion.participants}\n`
  discussionText += `- Duration: ${new Date(discussion.first_post_at).toLocaleDateString()} - ${new Date(discussion.last_post_at).toLocaleDateString()}\n`
  
  // Add reference link
  if (discussion.full_content && discussion.full_content.length > 0) {
    const latestPost = discussion.full_content[discussion.full_content.length - 1]
    const threadUrl = latestPost.thread_url || '#'
    discussionText += `- Reference Link: [View Thread](${threadUrl}) by ${latestPost.author_name || 'Unknown'}\n`
  }
  
  discussionText += `\n### Email Content:\n`
  
  // Add full email content for each post in this discussion
  if (discussion.full_content && discussion.full_content.length > 0) {
    discussion.full_content.forEach((post: any, postIndex: number) => {
      discussionText += `\n**Email ${postIndex + 1}** (${new Date(post.post_date).toLocaleString()}):\n`
      discussionText += `From: ${post.author_name || 'Unknown'}\n`
      discussionText += `Subject: ${post.subject}\n\n`
      discussionText += `Content: ${post.content || '[No content available]'}\n`
      discussionText += `---\n`
    })
  }
  
  const prompt = `Analyze this PostgreSQL mailing list discussion and create a detailed summary:

${discussionText}

Please create a comprehensive summary that:
1. Explains the main technical topic or problem being discussed
2. Includes specific technical details, code changes, algorithms, or implementation approaches mentioned
3. Mentions exact function names, data structures, performance metrics, or configuration changes discussed
4. Highlights specific technical decisions, trade-offs, or implementation choices made
5. Identifies any consensus reached or ongoing debates with technical reasoning
6. Includes any specific PostgreSQL internals, APIs, or system behavior discussed
7. Is approximately 200 words
8. Preserves the reference link provided
9. Is written for PostgreSQL core developers who need technical depth
10. Do not include any links in the summary

Focus on the technical substance, specific implementation details, and exact technical decisions. Avoid high-level descriptions - include concrete technical information that would be valuable to PostgreSQL developers working on the codebase.`

  return prompt
}


function createSummaryPrompt(discussions: any[], stats: any): string {
  console.log(`📝 INFO: Creating detailed prompt with ${discussions.length} discussions and full email content`)
  
  // Create detailed discussions text with reference links and full content
  const discussionsWithLinks = discussions.map((disc, index) => {
    let discussionText = `\n## Discussion ${index + 1}: ${disc.subject}\n`
    discussionText += `- Posts: ${disc.post_count}\n`
    discussionText += `- Participants: ${disc.participants}\n`
    discussionText += `- Duration: ${new Date(disc.first_post_at).toLocaleDateString()} - ${new Date(disc.last_post_at).toLocaleDateString()}\n`
    
    // Add reference links for each post in this discussion
    if (disc.full_content && disc.full_content.length > 0) {
      discussionText += `- Reference Link:\n`
      // Get the latest email (last item in array)
      const latestPost = disc.full_content[disc.full_content.length - 1]
      const threadUrl = latestPost.thread_url || '#'
      discussionText += `  - [View Thread](${threadUrl}) by ${latestPost.author_name || 'Unknown'}\n`
      discussionText += `\n`
    }
    
    // Add full email content for each post in this discussion
    if (disc.full_content && disc.full_content.length > 0) {
      discussionText += `### Email Content:\n`
      disc.full_content.forEach((post: any, postIndex: number) => {
        discussionText += `\n**Email ${postIndex + 1}** (${new Date(post.post_date).toLocaleString()}):\n`
        discussionText += `From: ${post.author_name || 'Unknown'}\n`
        discussionText += `Subject: ${post.subject}\n\n`
        
        // Note: mail_threads table doesn't store content, only metadata
        // Content would need to be fetched separately if needed
        discussionText += `Content: ${post.content || '[No content available]'}\n`
        discussionText += `---\n`
      })
    }
    
    return discussionText
  }).join('\n')

  console.log(`📝 INFO: Detailed discussions text with links created (${discussionsWithLinks.length} chars)`)

  const prompt = `Create a comprehensive weekly summary for the PostgreSQL hackers mailing list based on the following detailed email discussions from the last 7 days:

${discussionsWithLinks}

Weekly Statistics:
- Total posts: ${stats.total_posts}
- Total participants: ${stats.total_participants}
- Total subscribers: ${stats.total_subscribers}
- Date range: ${stats.date_range?.start || 'Unknown'} to ${stats.date_range?.end || 'Unknown'}

Please analyze the full email content above and create a comprehensive summary that:
1. Highlights the most important technical discussions and their key points
2. Explains the significance of each discussion based on the actual email content
3. Mentions key decisions, proposals, or consensus reached
4. Identifies any controversial topics or ongoing debates
5. Summarizes technical solutions or approaches discussed
6. Is written in a professional but accessible tone for PostgreSQL developers
7. Is approximately 800-1200 words given the rich content available
8. Include the reference links provided for each discussion so readers can access the full threads
9. DO NOT include any conclusion, summary, or "next steps" section - end with the last discussion

Format the summary with clear headings and bullet points. Focus on the technical substance of the discussions rather than just listing topics. Make sure to preserve the reference links in the output.`

  console.log(`📝 INFO: Final detailed prompt created (${prompt})`)
  console.log(`📝 INFO: Sending this COMPLETE prompt to AI:`)
  console.log(`=== FULL PROMPT START ===`)
  console.log(prompt)
  console.log(`=== FULL PROMPT END ===`)
  
  return prompt
}

