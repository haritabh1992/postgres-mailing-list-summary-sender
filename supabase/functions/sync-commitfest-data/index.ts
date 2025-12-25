import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PatchInfo {
  patchId: number
  patchUrl: string
  title: string
  status: string
  tags: string[]
  author: string
  createdAt: string | null
  lastModified: string | null
}

interface MailThreadInfo {
  url: string
  subject: string
  subjectNormalized: string
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

    console.log('🚀 Starting commitfest data sync...')

    // Create sync log entry using helper function
    const { data: syncLogId, error: syncLogError } = await supabaseClient
      .rpc('commitfest_insert_sync_log', {
        p_sync_type: 'full',
        p_status: 'in_progress',
        p_patches_processed: 0,
        p_threads_processed: 0
      })

    if (syncLogError || !syncLogId) {
      console.error('❌ Error creating sync log:', syncLogError)
      throw new Error('Failed to create sync log')
    }

    try {
      // Step 1: Fetch commitfest /open/ page
      console.log('📥 Fetching commitfest /open/ page...')
      const commitfestResponse = await fetch('https://commitfest.postgresql.org/open/')
      if (!commitfestResponse.ok) {
        throw new Error(`Failed to fetch commitfest page: ${commitfestResponse.status}`)
      }
      const commitfestHtml = await commitfestResponse.text()

      // Step 2: Extract patch links from the table
      const patchLinks = extractPatchLinks(commitfestHtml)
      console.log(`📋 Found ${patchLinks.length} patches to process`)

      let patchesProcessed = 0
      let threadsProcessed = 0
      const errors: string[] = []

      // Step 3: Process each patch
      for (const patchLink of patchLinks) {
        try {
          console.log(`📦 Processing patch ${patchLink.patchId}: ${patchLink.title}`)

          // Fetch patch page
          const patchResponse = await fetch(patchLink.patchUrl)
          if (!patchResponse.ok) {
            throw new Error(`Failed to fetch patch page: ${patchResponse.status}`)
          }
          const patchHtml = await patchResponse.text()

          // Extract patch info
          const patchInfo = extractPatchInfo(patchHtml, patchLink.patchId, patchLink.patchUrl)
          console.log(`  Tags: ${patchInfo.tags.join(', ') || 'none'}`)

          // Upsert patch into database using helper function
          const { error: patchError } = await supabaseClient
            .rpc('commitfest_upsert_patch', {
              p_patch_id: patchInfo.patchId,
              p_patch_url: patchInfo.patchUrl,
              p_title: patchInfo.title,
              p_status: patchInfo.status,
              p_tags: patchInfo.tags,
              p_author: patchInfo.author,
              p_created_at: patchInfo.createdAt,
              p_last_modified: patchInfo.lastModified
            })

          if (patchError) {
            throw new Error(`Failed to upsert patch: ${patchError.message}`)
          }

          // Extract mail thread links with subjects from link text
          const mailThreads = extractMailThreadUrls(patchHtml)
          console.log(`  Mail threads: ${mailThreads.length}`)

          // Process each mail thread (URL and subject from link text)
          for (const mailThread of mailThreads) {
            try {
              // Normalize the subject from link text
              const subjectNormalized = normalizeSubject(mailThread.subject)
              
              // Store mail thread with subject from link text
              const { data: mailThreadId, error: threadError } = await supabaseClient
                .rpc('commitfest_upsert_mail_thread', {
                  p_mail_thread_url: mailThread.url,
                  p_subject: mailThread.subject,
                  p_subject_normalized: subjectNormalized
                })

              if (threadError || !mailThreadId) {
                throw new Error(`Failed to upsert mail thread: ${threadError?.message || 'No ID returned'}`)
              }

              // Link patch to mail thread using helper function
              const { error: linkError } = await supabaseClient
                .rpc('commitfest_link_patch_mail_thread', {
                  p_patch_id: patchInfo.patchId,
                  p_mail_thread_id: mailThreadId
                })

              if (linkError) {
                console.warn(`  ⚠️  Failed to link patch to thread: ${linkError.message}`)
              }

              threadsProcessed++
            } catch (error) {
              console.error(`  ❌ Error processing mail thread ${mailThreadUrl}:`, error)
              errors.push(`Mail thread ${mailThreadUrl}: ${error.message}`)
            }
          }

          patchesProcessed++

          // Update sync log periodically
          if (patchesProcessed % 10 === 0) {
            await supabaseClient
              .rpc('commitfest_update_sync_log', {
                p_id: syncLogId,
                p_status: 'in_progress',
                p_patches_processed: patchesProcessed,
                p_threads_processed: threadsProcessed
              })
          }
        } catch (error) {
          console.error(`❌ Error processing patch ${patchLink.patchId}:`, error)
          errors.push(`Patch ${patchLink.patchId}: ${error.message}`)
        }
      }

      // Update sync log as completed
      await supabaseClient
        .rpc('commitfest_update_sync_log', {
          p_id: syncLogId,
          p_status: 'completed',
          p_patches_processed: patchesProcessed,
          p_threads_processed: threadsProcessed,
          p_error_message: errors.length > 0 ? errors.slice(0, 5).join('; ') : null
        })

      console.log(`✅ Sync completed: ${patchesProcessed} patches, ${threadsProcessed} threads`)

      return new Response(
        JSON.stringify({
          success: true,
          patches_processed: patchesProcessed,
          threads_processed: threadsProcessed,
          errors: errors.length
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } catch (error) {
      // Update sync log as failed
      await supabaseClient
        .rpc('commitfest_update_sync_log', {
          p_id: syncLogId,
          p_status: 'failed',
          p_error_message: error.message
        })

      throw error
    }
  } catch (error) {
    console.error('❌ Sync failed:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

function extractPatchLinks(html: string): Array<{ patchId: number, patchUrl: string, title: string }> {
  const patches: Array<{ patchId: number, patchUrl: string, title: string }> = []
  
  // Find the patches table - look for table with "Patch" header
  const tableMatch = html.match(/<table[^>]*>[\s\S]*?<thead[^>]*>[\s\S]*?Patch[\s\S]*?<\/thead>([\s\S]*?)<\/table>/i)
  if (!tableMatch) {
    console.warn('⚠️  Could not find patches table')
    return patches
  }

  const tbody = tableMatch[1]

  // Extract patch links - look for links with /patch/ in href
  const patchLinkRegex = /<a[^>]+href="(\/patch\/(\d+)\/)"[^>]*>([^<]+)<\/a>/gi
  let match

  while ((match = patchLinkRegex.exec(tbody)) !== null) {
    const patchId = parseInt(match[2], 10)
    const patchUrl = `https://commitfest.postgresql.org${match[1]}`
    const title = match[3].trim()

    patches.push({ patchId, patchUrl, title })
  }

  return patches
}

function extractPatchInfo(html: string, patchId: number, patchUrl: string): PatchInfo {
  // Extract title
  let title = ''
  const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i)
  if (titleMatch) {
    title = titleMatch[1].trim()
  }

  // Extract status - look for "Status" row in table
  let status = ''
  const statusMatch = html.match(/<tr[^>]*>[\s\S]*?<td[^>]*>Status<\/td>[\s\S]*?<td[^>]*>([^<]+)<\/td>/i)
  if (statusMatch) {
    status = statusMatch[1].trim()
  }

  // Extract tags - look for "Tags" row
  const tags: string[] = []
  
  // Try multiple patterns to find the Tags row
  // Pattern 1: Standard table row with Tags in first cell
  let tagsRowMatch = html.match(/<tr[^>]*>[\s\S]*?<td[^>]*>Tags<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i)
  
  // Pattern 2: Tags might be in <th> instead of <td>
  if (!tagsRowMatch) {
    tagsRowMatch = html.match(/<tr[^>]*>[\s\S]*?<th[^>]*>Tags<\/th>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i)
  }
  
  // Pattern 3: More flexible - any cell containing "Tags" followed by content
  if (!tagsRowMatch) {
    tagsRowMatch = html.match(/Tags[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i)
  }
  
  if (tagsRowMatch) {
    const tagsCell = tagsRowMatch[1]
    
    // Extract tag links - try multiple patterns
    // Pattern 1: Standard <a> tags
    const tagLinkRegex1 = /<a[^>]*>([^<]+)<\/a>/gi
    let tagMatch
    while ((tagMatch = tagLinkRegex1.exec(tagsCell)) !== null) {
      const tagText = tagMatch[1].trim()
      if (tagText && tagText.length > 0) {
        tags.push(tagText)
      }
    }
    
    // Pattern 2: Links with href containing tag parameter
    if (tags.length === 0) {
      const tagLinkRegex2 = /<a[^>]+href="[^"]*\?tag=\d+"[^>]*>([^<]+)<\/a>/gi
      while ((tagMatch = tagLinkRegex2.exec(tagsCell)) !== null) {
        const tagText = tagMatch[1].trim()
        if (tagText && tagText.length > 0) {
          tags.push(tagText)
        }
      }
    }
    
    // Pattern 3: Generic elements that might contain tags (like <span>, <div>)
    if (tags.length === 0) {
      const tagElementRegex = /<(?:span|div|strong|em)[^>]*>([^<]+)<\/(?:span|div|strong|em)>/gi
      while ((tagMatch = tagElementRegex.exec(tagsCell)) !== null) {
        const tagText = tagMatch[1].trim()
        if (tagText && tagText.length > 0 && !tagText.match(/^\s*$/)) {
          tags.push(tagText)
        }
      }
    }
    
    // If no links, try to extract plain text tags (split by whitespace, but filter out empty/short strings)
    if (tags.length === 0) {
      const cleanedCell = tagsCell.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
      const textTags = cleanedCell.split(/\s+/).filter(t => t.length > 1 && !t.match(/^[^\w]+$/))
      tags.push(...textTags)
    }
  }

  // Extract author - look for "Authors" row
  let author = ''
  const authorMatch = html.match(/<tr[^>]*>[\s\S]*?<td[^>]*>Authors?<\/td>[\s\S]*?<td[^>]*>([^<]+)<\/td>/i)
  if (authorMatch) {
    author = authorMatch[1].trim()
  }

  // Extract created_at - look for "Created" row
  let createdAt: string | null = null
  const createdMatch = html.match(/<tr[^>]*>[\s\S]*?<td[^>]*>Created<\/td>[\s\S]*?<td[^>]*>([^<]+)<\/td>/i)
  if (createdMatch) {
    const dateStr = createdMatch[1].trim()
    try {
      const date = new Date(dateStr)
      if (!isNaN(date.getTime())) {
        createdAt = date.toISOString()
      }
    } catch (e) {
      // Ignore parse errors
    }
  }

  // Extract last_modified - look for "Last modified" row
  let lastModified: string | null = null
  const modifiedMatch = html.match(/<tr[^>]*>[\s\S]*?<td[^>]*>Last modified<\/td>[\s\S]*?<td[^>]*>([^<]+)<\/td>/i)
  if (modifiedMatch) {
    const dateStr = modifiedMatch[1].trim()
    try {
      const date = new Date(dateStr)
      if (!isNaN(date.getTime())) {
        lastModified = date.toISOString()
      }
    } catch (e) {
      // Ignore parse errors
    }
  }

  return {
    patchId,
    patchUrl,
    title,
    status,
    tags,
    author,
    createdAt,
    lastModified
  }
}

function extractMailThreadUrls(html: string): Array<{url: string, subject: string}> {
  const threads: Array<{url: string, subject: string}> = []
  
  // Find the "Emails" section - look for row with "Emails" in first cell
  const emailsSectionMatch = html.match(/<tr[^>]*>[\s\S]*?<td[^>]*>Emails<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i)
  
  if (!emailsSectionMatch) {
    // Try alternative structure - might be in <dl> format
    const dlMatch = html.match(/<dl[^>]*>([\s\S]*?)<\/dl>/i)
    
    if (dlMatch) {
      const dlContent = dlMatch[1]
      // Look for links in the DL structure - extract both URL and link text (subject)
      const threadLinkRegex = /<a[^>]+href="(https:\/\/www\.postgresql\.org\/message-id\/flat\/[^"]+)"[^>]*>([^<]+)<\/a>/gi
      let match
      while ((match = threadLinkRegex.exec(dlContent)) !== null) {
        const url = match[1]
        const subject = match[2].trim()
        threads.push({ url, subject })
      }
      
      return threads
    }
    return threads
  }

  const emailsCell = emailsSectionMatch[1]

  // Extract mail thread links with their text (subject) - look for links with message-id/flat/
  // Pattern: <a href="url">subject text</a>
  const threadLinkRegex = /<a[^>]+href="(https:\/\/www\.postgresql\.org\/message-id\/flat\/[^"]+)"[^>]*>([^<]+)<\/a>/gi
  let match

  while ((match = threadLinkRegex.exec(emailsCell)) !== null) {
    const url = match[1]
    const subject = match[2].trim()
    threads.push({ url, subject })
  }

  return threads
}

function extractMailThreadSubject(html: string): string {
  // Try to extract from page title (format: "PostgreSQL: {subject}")
  const titleMatch = html.match(/<title[^>]*>PostgreSQL:\s*([^<]+)<\/title>/i)
  if (titleMatch) {
    return titleMatch[1].trim()
  }

  // Fallback to h1
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i)
  if (h1Match) {
    return h1Match[1].trim()
  }

  return 'Unknown Subject'
}

function normalizeSubject(subject: string): string {
  // Lowercase
  let normalized = subject.toLowerCase()
  
  // Trim whitespace
  normalized = normalized.trim()
  
  // Remove "Re:", "Fwd:", "RE:", "FWD:" prefixes
  normalized = normalized.replace(/^(re|fwd):\s*/i, '')
  
  // Remove extra whitespace
  normalized = normalized.replace(/\s+/g, ' ')
  
  return normalized.trim()
}

