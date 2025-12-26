import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TagEntry {
  pk: number
  fields: {
    name: string
    color?: string
    description?: string
  }
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

    console.log('🚀 Starting commitfest tags sync from JSON...')

    // Fetch JSON from GitHub
    const jsonUrl = 'https://raw.githubusercontent.com/postgres/pgcommitfest/c7088f9f859fdbac5d026199306be192293b1a8a/pgcommitfest/commitfest/fixtures/commitfest_data.json'
    console.log(`📥 Fetching JSON from: ${jsonUrl}`)
    
    const jsonResponse = await fetch(jsonUrl)
    if (!jsonResponse.ok) {
      throw new Error(`Failed to fetch JSON: ${jsonResponse.status}`)
    }

    const jsonData = await jsonResponse.json()
    console.log(`📦 Fetched JSON with ${jsonData.length} entries`)

    // Filter entries where model is "commitfest.tag"
    const tagEntries = jsonData.filter((entry: any) => entry.model === 'commitfest.tag') as TagEntry[]
    console.log(`🏷️  Found ${tagEntries.length} tag entries`)

    let tagsProcessed = 0
    let tagsSkipped = 0
    const errors: string[] = []

    // Process each tag entry
    for (const tagEntry of tagEntries) {
      try {
        const tagId = tagEntry.pk
        const tagName = tagEntry.fields.name
        const tagColor = tagEntry.fields.color || null
        const tagDescription = tagEntry.fields.description || null

        if (!tagName) {
          console.warn(`⚠️  Skipping tag with id ${tagId} - no name`)
          tagsSkipped++
          continue
        }

        // Upsert tag into database using RPC function
        const { error: tagError } = await supabaseClient
          .rpc('commitfest_upsert_tag', {
            p_id: tagId,
            p_name: tagName,
            p_color: tagColor,
            p_description: tagDescription
          })

        if (tagError) {
          throw new Error(`Failed to upsert tag: ${tagError.message}`)
        }

        tagsProcessed++
      } catch (error) {
        console.error(`❌ Error processing tag entry ${tagEntry.pk}:`, error)
        errors.push(`Tag ${tagEntry.pk}: ${error.message}`)
      }
    }

    console.log(`✅ Tags sync completed: ${tagsProcessed} tags processed, ${tagsSkipped} skipped`)

    return new Response(
      JSON.stringify({
        success: true,
        tags_processed: tagsProcessed,
        tags_skipped: tagsSkipped,
        errors: errors.length > 0 ? errors : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('❌ Tags sync failed:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

