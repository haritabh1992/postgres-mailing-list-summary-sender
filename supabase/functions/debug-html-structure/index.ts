import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Fetch the actual HTML to analyze structure
    const url = 'https://www.postgrespro.com/list/pgsql-hackers/2025-09'
    console.log(`Fetching HTML from: ${url}`)
    
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    const html = await response.text()
    console.log(`HTML length: ${html.length} characters`)
    
    // Log first 2000 characters to see structure
    console.log('=== HTML SAMPLE START ===')
    console.log(html.substring(0, 2000))
    console.log('=== HTML SAMPLE END ===')
    
    // Look for day patterns
    const dayMatches = html.match(/\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)/g)
    console.log('Day patterns found:', dayMatches?.slice(0, 10))
    
    // Look for any links with /list/id/ and their context
    const idLinks = html.match(/<a[^>]*href="[^"]*\/list\/id\/[^"]*"[^>]*>[^<]*<\/a>/g)
    console.log(`Found ${idLinks?.length || 0} /list/id/ links`)
    if (idLinks) {
      console.log('Sample links:', idLinks.slice(0, 3))
      
      // Show context around first few links to understand author extraction
      const linkPattern = /<a[^>]+href="(\/list\/id\/[^"]+)"[^>]*>([^<]+)<\/a>/g
      let match
      let count = 0
      
      while ((match = linkPattern.exec(html)) && count < 3) {
        const linkIndex = match.index
        const contextStart = Math.max(0, linkIndex - 100)
        const contextEnd = Math.min(html.length, linkIndex + 200)
        const context = html.slice(contextStart, contextEnd)
        
        console.log(`=== LINK ${count + 1} CONTEXT ===`)
        console.log(`Subject: ${match[2]}`)
        console.log(`Context: ${context}`)
        console.log(`=== END CONTEXT ===`)
        count++
      }
    }
    
    // Look for any links at all
    const allLinks = html.match(/<a[^>]*href="[^"]*"[^>]*>[^<]*<\/a>/g)
    console.log(`Found ${allLinks?.length || 0} total links`)
    if (allLinks) {
      console.log('Sample all links:', allLinks.slice(0, 5))
    }
    
    // Look for time patterns
    const timePatterns = html.match(/\d{2}:\d{2}/g)
    console.log(`Found ${timePatterns?.length || 0} time patterns`)
    if (timePatterns) {
      console.log('Sample times:', timePatterns.slice(0, 10))
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        message: 'HTML structure analysis complete - check function logs',
        htmlLength: html.length,
        dayMatches: dayMatches?.length || 0,
        idLinks: idLinks?.length || 0,
        allLinks: allLinks?.length || 0,
        timePatterns: timePatterns?.length || 0
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error analyzing HTML:', error)
    
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
