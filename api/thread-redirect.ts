const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
}

export default async function handler(req: any, res: any) {
  const { method } = req

  if (method === 'OPTIONS') {
    setCors(res)
    return res.status(200).send('ok')
  }

  if (method !== 'GET' && method !== 'HEAD') {
    setCors(res)
    res.setHeader('Allow', 'GET, HEAD, OPTIONS')
    return res.status(405).send('Method not allowed')
  }

  const slug = typeof req.query.slug === 'string' ? req.query.slug : Array.isArray(req.query.slug) ? req.query.slug[0] : undefined
  if (!slug) {
    setCors(res)
    return res.status(400).send('redirect slug required')
  }

  const baseUrl = process.env.SUPABASE_FUNCTIONS_BASE_URL
  if (!baseUrl) {
    console.error('SUPABASE_FUNCTIONS_BASE_URL is not configured')
    setCors(res)
    return res.status(500).send('internal error')
  }

  const edgeFunctionKey =
    process.env.SUPABASE_EDGE_FUNCTION_KEY ?? process.env.SUPABASE_ANON_KEY

  if (!edgeFunctionKey) {
    console.error('SUPABASE_EDGE_FUNCTION_KEY or SUPABASE_ANON_KEY is not configured')
    setCors(res)
    return res.status(500).send('internal error')
  }

  try {
    const supabaseUrl = new URL(`/thread-redirect/${encodeURIComponent(slug)}`, baseUrl).toString()
    const response = await fetch(supabaseUrl, {
      redirect: 'manual',
      headers: {
        Authorization: `Bearer ${edgeFunctionKey}`,
      },
    })

    const location = response.headers.get('location')
    if (response.status === 302 && location) {
      setCors(res)
      res.setHeader('Location', location)
      return res.status(302).end()
    }

    if (response.status === 404) {
      setCors(res)
      return res.status(404).send('redirect not found')
    }

    console.error('Unexpected response from Supabase redirect function', {
      status: response.status,
      body: await safeText(response),
    })
    setCors(res)
    return res.status(500).send('internal error')
  } catch (error) {
    console.error('Failed to proxy redirect', error)
    setCors(res)
    return res.status(500).send('internal error')
  }
}

function setCors(res: any) {
  Object.entries(corsHeaders).forEach(([key, value]) => res.setHeader(key, value))
}

async function safeText(response: Response) {
  try {
    return await response.text()
  } catch (_) {
    return null
  }
}

