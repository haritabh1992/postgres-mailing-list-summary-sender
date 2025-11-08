import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  const { method } = req

  if (method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (method !== 'GET' && method !== 'HEAD') {
    return new Response('Method not allowed', {
      status: 405,
      headers: { ...corsHeaders, 'Allow': 'GET, HEAD, OPTIONS' }
    })
  }

  try {
    const url = new URL(req.url)
    const segments = url.pathname.split('/').filter(Boolean)

    // Expect path pattern: /thread-redirect/:slug
    const slug = segments.length > 1 ? segments[1] : null

    if (!slug) {
      return new Response('redirect slug required', {
        status: 400,
        headers: corsHeaders
      })
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data, error } = await supabaseClient
      .from('mail_threads')
      .select('thread_url')
      .eq('redirect_slug', slug)
      .maybeSingle()

    if (error) {
      console.error('Failed to fetch redirect target:', error)
      return new Response('internal error', { status: 500, headers: corsHeaders })
    }

    const targetUrl = data?.thread_url

    if (!targetUrl) {
      return new Response('redirect not found', { status: 404, headers: corsHeaders })
    }

    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        'Location': targetUrl
      }
    })
  } catch (error) {
    console.error('Unexpected redirect error:', error)
    return new Response('internal error', { status: 500, headers: corsHeaders })
  }
})

