import dotenv from 'dotenv'
import express from 'express'
import { fetchRawCslLogs } from './utils/cslLogsFetcher.js'
import { llmAnalyze, llmChat } from '../controllers/llmController.js'

dotenv.config({ override: true })

const app = express()
const port = Number(process.env.SERVER_PORT || 5000)
const DEBUG_PDP_PARSER = process.env.DEBUG_PDP_PARSER === '1'

const debugPdp = (...args) => {
  if (DEBUG_PDP_PARSER) {
    console.log('[PDP_DEBUG]', ...args)
  }
}

app.use(express.json())

const ALLOWED_PREVIEW_HOST_SUFFIX = '.indiamart.com'

const normalizePreviewUrl = (urlValue) => {
  if (!urlValue) {
    return null
  }

  try {
    const parsed = new URL(String(urlValue))
    const isSecure = parsed.protocol === 'https:'
    const host = parsed.hostname.toLowerCase()
    const allowedHost = host === 'indiamart.com' || host.endsWith(ALLOWED_PREVIEW_HOST_SUFFIX)
    if (!isSecure || !allowedHost) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

const sanitizeHtmlText = (value) => {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

const decodeCommonEscapes = (value) => {
  return String(value || '')
    .replace(/&quot;/gi, '"')
    .replace(/&#34;/gi, '"')
    .replace(/\\x22/gi, '"')
    .replace(/\\u0022/gi, '"')
    .replace(/\\\"/g, '"')
}

const extractSearchContextFromUrl = (urlValue) => {
  try {
    const parsed = new URL(String(urlValue || ''))
    const query =
      parsed.searchParams.get('ss') ||
      parsed.searchParams.get('q') ||
      parsed.searchParams.get('keyword') ||
      ''
    const city =
      parsed.searchParams.get('cq') ||
      parsed.searchParams.get('city') ||
      parsed.searchParams.get('glbct') ||
      ''

    return {
      query: sanitizeHtmlText(query),
      city: sanitizeHtmlText(city),
    }
  } catch {
    return {
      query: '',
      city: '',
    }
  }
}

const extractIntentCityFromUrl = (urlValue) => {
  try {
    const parsed = new URL(String(urlValue || ''))
    const city =
      parsed.searchParams.get('ipct') ||
      parsed.searchParams.get('prefct') ||
      parsed.searchParams.get('glbct') ||
      parsed.searchParams.get('cq') ||
      ''

    return sanitizeHtmlText(city)
  } catch {
    return ''
  }
}

const extractIntentCityFromHtml = (rawHtml) => {
  const html = String(rawHtml || '')
  const cityMetaMatch = html.match(
    /<meta\s+name=["'](?:geo\.region|geo\.placename)["']\s+content=["']([^"']+)["'][^>]*>/i,
  )
  if (cityMetaMatch?.[1]) {
    return sanitizeHtmlText(cityMetaMatch[1])
  }

  const cityTextMatch = html.match(/\b(?:in|at)\s+([A-Za-z][A-Za-z\s-]{1,40})\b/i)
  if (cityTextMatch?.[1]) {
    return sanitizeHtmlText(cityTextMatch[1])
  }

  return ''
}

const extractSearchDataFromHtml = (rawHtml, baseUrl) => {
  const html = String(rawHtml || '')

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = sanitizeHtmlText(titleMatch?.[1] || '') || 'IndiaMART Search'

  const descriptionMatch = html.match(
    /<meta\s+name=["']description["']\s+content=["']([^"']*)["'][^>]*>/i,
  )
  const description =
    sanitizeHtmlText(descriptionMatch?.[1] || '') ||
    'Search results on IndiaMART.'

  const countMatch = html.match(/([0-9,]+)\s+(?:results?|suppliers?)\b/i)
  const resultCount = countMatch?.[1] || ''

  const resultCandidates = []
  const productLinkRegex = /<a[^>]+href=["']([^"']*\/proddetail\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let productMatch = productLinkRegex.exec(html)

  while (productMatch && resultCandidates.length < 4) {
    const rawHref = productMatch[1]
    const rawText = productMatch[2]
    const itemText = sanitizeHtmlText(rawText)
    const imageMatch = rawText.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i)
    const imageSrc = imageMatch?.[1] ? sanitizeHtmlText(imageMatch[1]) : ''

    let normalizedUrl = rawHref
    let normalizedImage = imageSrc

    try {
      normalizedUrl = new URL(rawHref, baseUrl).toString()
    } catch {}

    if (imageSrc) {
      try {
        normalizedImage = new URL(imageSrc, baseUrl).toString()
      } catch {}
    }

    if (itemText.length >= 4) {
      resultCandidates.push({
        title: itemText,
        url: normalizedUrl,
        image: normalizedImage,
      })
    }

    productMatch = productLinkRegex.exec(html)
  }

  return {
    title,
    description,
    resultCount,
    topResults: resultCandidates,
  }
}

const isPdpPage = (rawHtml, pageUrl) => {
  const html = String(rawHtml || '')
  const url = String(pageUrl || '')
  return /\/proddetail\//i.test(url) || /<h1[^>]*>[\s\S]*?<\/h1>/i.test(html)
}

const extractNextDataJson = (rawHtml) => {
  const html = String(rawHtml || '')
  const scriptMatch = html.match(
    /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
  )
  const scriptContent = scriptMatch?.[1]?.trim()

  debugPdp('NEXT_DATA script found:', Boolean(scriptContent), 'length:', scriptContent?.length || 0)

  if (!scriptContent) {
    return null
  }

  try {
    const parsed = JSON.parse(scriptContent)
    const serviceRes = parsed?.props?.pageProps?.serviceRes
    debugPdp('serviceRes snapshot:', JSON.stringify(serviceRes, null, 2))
    return parsed
  } catch {
    debugPdp('Failed to parse __NEXT_DATA__ JSON')
    return null
  }
}

const extractMcatFromNextData = (nextData) => {
  const dataNode = nextData?.props?.pageProps?.serviceRes?.Data?.[0]
  debugPdp('DATA OBJECT:', dataNode)
  debugPdp('Is Data[0][0] present (wrong-level check):', Boolean(dataNode?.[0]))
  const mcatId = dataNode?.BRD_MCAT_ID ? String(dataNode.BRD_MCAT_ID).trim() : null
  const mcatName = dataNode?.BRD_MCAT_NAME ? String(dataNode.BRD_MCAT_NAME).trim() : null
  debugPdp('MCAT NAME:', mcatName)
  debugPdp('MCAT ID:', mcatId)

  return {
    mcatId: mcatId || null,
    mcatName: mcatName || null,
  }
}

const extractMcatIdFromHtml = (rawHtml) => {
  const html = String(rawHtml || '')

  // Primary source: Next.js embedded JSON payload.
  const nextData = extractNextDataJson(html)
  const fromNextData = extractMcatFromNextData(nextData)
  if (fromNextData.mcatId) {
    debugPdp('MCAT ID source: __NEXT_DATA__')
    return fromNextData.mcatId
  }

  const normalizedHtml = decodeCommonEscapes(html)
  const patterns = [
    /["']BRD_MCAT_ID["']\s*[:=]\s*["']?([0-9]{2,})["']?/i,
    /\bBRD_MCAT_ID\b\s*[:=]\s*["']?([0-9]{2,})["']?/i,
    /["']key["']\s*:\s*["']BRD_MCAT_ID["']\s*,\s*["']value["']\s*:\s*["']?([0-9]{2,})["']?/i,
    /\bdata-(?:mcat-id|mcatid|brd-mcat-id)\b\s*=\s*["']([0-9]{2,})["']/i,
  ]

  for (const pattern of patterns) {
    const match = normalizedHtml.match(pattern)
    if (match?.[1]) {
      debugPdp('MCAT ID source: regex fallback pattern matched')
      return match[1]
    }
  }

  // Fallback: sometimes MCAT id is available in canonical/query params.
  const urlMatch = normalizedHtml.match(
    /https?:\/\/[^"'\s>]+(?:\?(?:[^"'\s>]*))(?:mcatid|mcat_id|brd_mcat_id)=([0-9]{2,})/i,
  )
  if (urlMatch?.[1]) {
    debugPdp('MCAT ID source: URL fallback')
    return urlMatch[1]
  }

  debugPdp('MCAT ID source: not found in any parser path')

  return null
}

const extractPdpBreadcrumbFromHtml = (rawHtml, pageUrl) => {
  const html = String(rawHtml || '')

  if (!isPdpPage(html, pageUrl)) {
    return null
  }

  const navMatch = html.match(
    /<nav[^>]*class=["'][^"']*\bbrdcmbBleedEdgePdp2\b[^"']*["'][^>]*>([\s\S]*?)<\/nav>/i,
  )
  const navHtml = navMatch?.[1] || ''

  const breadcrumbLinks = []
  const anchorRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi
  let anchorMatch = anchorRegex.exec(navHtml)

  while (anchorMatch) {
    const attributes = anchorMatch[1] || ''
    const label = sanitizeHtmlText(anchorMatch[2] || '') || null
    const hrefMatch = attributes.match(/\bhref=["']([^"']*)["']/i)
    const hrefValue = sanitizeHtmlText(hrefMatch?.[1] || '') || null

    if (label) {
      breadcrumbLinks.push({
        text: label,
        href: hrefValue,
      })
    }

    anchorMatch = anchorRegex.exec(navHtml)
  }

  const linkLabels = breadcrumbLinks.map((item) => item.text)
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  const h1Title = sanitizeHtmlText(h1Match?.[1] || '') || null

  const breadcrumbs = [...linkLabels]
  if (
    h1Title &&
    (
      breadcrumbs.length === 0 ||
      breadcrumbs[breadcrumbs.length - 1].toLowerCase() !== h1Title.toLowerCase()
    )
  ) {
    breadcrumbs.push(h1Title)
  }

  const total = breadcrumbs.length
  const nextData = extractNextDataJson(html)
  const nextDataMcat = extractMcatFromNextData(nextData)
  const mcatId = extractMcatIdFromHtml(html)
  const breadcrumbMcat = total >= 2 ? breadcrumbs[total - 2] : null
  const mcatName = nextDataMcat.mcatName || breadcrumbMcat

  debugPdp('Resolved breadcrumb mcatName:', mcatName)
  debugPdp('Resolved breadcrumb mcatId:', mcatId)

  return {
    // Mapping is from the bottom: IndiaMART <- Category <- mCat <- PDP
    root: total >= 4 ? breadcrumbs[total - 4] : null,
    category: total >= 3 ? breadcrumbs[total - 3] : null,
    mcat: mcatName,
    mcatId,
    pdpTitle: total >= 1 ? breadcrumbs[total - 1] : null,
    breadcrumbs,
    breadcrumbLinks,
  }
}

const extractProductDataFromHtml = (rawHtml, pageUrl) => {
  const html = String(rawHtml || '')
  
  let title = ''
  let price = ''
  let image = ''
  let rating = ''
  
  // Extract title from <title> tag or h1
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  if (titleMatch) {
    title = titleMatch[1].trim().replace(/\s*[-|]\s*IndiaMART/, '').trim()
  }
  
  if (!title) {
    const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i)
    if (h1Match) {
      title = h1Match[1].trim()
    }
  }
  
  // Extract price - look for price spans or meta tags
  const priceMatch = html.match(/₹[\s]*([0-9,\.]+(?:\s*[-–]\s*[0-9,\.]+)?)/i)
  if (priceMatch) {
    price = `₹${priceMatch[1]}`
  }
  
  // Extract image - look for product image meta tag or main image
  const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i)
  if (ogImageMatch) {
    image = ogImageMatch[1]
  }
  
  if (!image) {
    const imgMatch = html.match(/<img[^>]+src=["']([^"']*(?:product|image)[^"']*?)["'][^>]*>/i)
    if (imgMatch) {
      image = imgMatch[1]
    }
  }
  
  // Extract rating - look for rating text
  const ratingMatch = html.match(/(\d+(?:\.\d+)?)\s*out\s+of\s+5|Rating:\s*(\d+(?:\.\d+)?)/i)
  if (ratingMatch) {
    rating = ratingMatch[1] || ratingMatch[2]
  }

  const breadcrumbData = extractPdpBreadcrumbFromHtml(html, pageUrl)

  const result = {
    title: title || 'Product',
    price: price || 'Price not available',
    image: image || '',
    rating: rating || '',
    breadcrumb: breadcrumbData,
  }

  debugPdp('FINAL PDP DATA:', result)
  return result
}

const extractCompanyDataFromHtml = (rawHtml) => {
  const html = String(rawHtml || '')

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const descriptionMatch = html.match(
    /<meta\s+name=["']description["']\s+content=["']([^"']*)["'][^>]*>/i,
  )
  const ogTitleMatch = html.match(
    /<meta\s+property=["']og:title["']\s+content=["']([^"']*)["'][^>]*>/i,
  )
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  const locationMatch = html.match(/\b(?:in|at)\s+([A-Za-z][A-Za-z\s-]{2,40})\b/i)

  const title = sanitizeHtmlText(titleMatch?.[1] || '')
  const companyName =
    sanitizeHtmlText(ogTitleMatch?.[1] || '') ||
    sanitizeHtmlText(h1Match?.[1] || '') ||
    title.replace(/\s*[-|].*$/g, '').trim()

  return {
    title: title || 'Company Page',
    companyName: companyName || 'Company',
    description: sanitizeHtmlText(descriptionMatch?.[1] || ''),
    location: sanitizeHtmlText(locationMatch?.[1] || ''),
  }
}

app.post('/api/behavior', async (req, res) => {
  const { glId, startDate, endDate } = req.body ?? {}

  if (!glId || !startDate || !endDate) {
    return res.status(400).json({
      message: 'glId, startDate, and endDate are required.',
    })
  }

  try {
    const { payload: responsePayload } = await fetchRawCslLogs({ glid: glId, startDate, endDate })

    return res.json(responsePayload)
  } catch (error) {
    const status = Number(error?.status) || 502
    return res.status(status).json({
      message: error instanceof Error ? error.message : 'Failed to call external API from backend.',
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

app.post('/api/llm/analyze', llmAnalyze)
app.post('/api/llm/chat', llmChat)

app.get('/api/product-preview', async (req, res) => {
  const previewUrlInput = String(req.query.url || '').trim()
  const parsedPreviewUrl = normalizePreviewUrl(previewUrlInput)

  if (!parsedPreviewUrl) {
    return res.status(400).json({
      message: 'A valid https://*.indiamart.com URL is required for preview.',
    })
  }

  try {
    const upstreamResponse = await fetch(parsedPreviewUrl.toString(), {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      },
      redirect: 'follow',
    })

    const finalUrl = upstreamResponse.url || parsedPreviewUrl.toString()
    const responseText = await upstreamResponse.text()

    if (!upstreamResponse.ok) {
      return res.status(upstreamResponse.status).json({
        message: 'Unable to load product page for preview.',
      })
    }

    const productData = extractProductDataFromHtml(responseText, finalUrl)

    return res.json({
      url: finalUrl,
      data: productData,
    })
  } catch (error) {
    return res.status(502).json({
      message: 'Backend failed to fetch product preview.',
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

app.get('/api/search-preview', async (req, res) => {
  const previewUrlInput = String(req.query.url || '').trim()
  const parsedPreviewUrl = normalizePreviewUrl(previewUrlInput)

  if (!parsedPreviewUrl) {
    return res.status(400).json({
      message: 'A valid https://*.indiamart.com URL is required for preview.',
    })
  }

  try {
    const upstreamResponse = await fetch(parsedPreviewUrl.toString(), {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      },
      redirect: 'follow',
    })

    const finalUrl = upstreamResponse.url || parsedPreviewUrl.toString()
    const responseText = await upstreamResponse.text()

    if (!upstreamResponse.ok) {
      return res.status(upstreamResponse.status).json({
        message: 'Unable to load search page for preview.',
      })
    }

    const searchData = extractSearchDataFromHtml(responseText, finalUrl)
    const searchContext = extractSearchContextFromUrl(finalUrl)

    return res.json({
      url: finalUrl,
      data: {
        ...searchData,
        query: searchContext.query,
        city: searchContext.city,
      },
    })
  } catch (error) {
    return res.status(502).json({
      message: 'Backend failed to fetch search preview.',
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

app.get('/api/company-preview', async (req, res) => {
  const previewUrlInput = String(req.query.url || '').trim()
  const parsedPreviewUrl = normalizePreviewUrl(previewUrlInput)

  if (!parsedPreviewUrl) {
    return res.status(400).json({
      message: 'A valid https://*.indiamart.com URL is required for preview.',
    })
  }

  try {
    const upstreamResponse = await fetch(parsedPreviewUrl.toString(), {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      },
      redirect: 'follow',
    })

    const finalUrl = upstreamResponse.url || parsedPreviewUrl.toString()
    const responseText = await upstreamResponse.text()

    if (!upstreamResponse.ok) {
      return res.status(upstreamResponse.status).json({
        message: 'Unable to load company page for preview.',
      })
    }

    const companyData = extractCompanyDataFromHtml(responseText)

    return res.json({
      url: finalUrl,
      data: companyData,
    })
  } catch (error) {
    return res.status(502).json({
      message: 'Backend failed to fetch company preview.',
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

app.get('/api/intent-preview', async (req, res) => {
  const previewUrlInput = String(req.query.url || '').trim()
  const parsedPreviewUrl = normalizePreviewUrl(previewUrlInput)

  if (!parsedPreviewUrl) {
    return res.status(400).json({
      message: 'A valid https://*.indiamart.com URL is required for preview.',
    })
  }

  try {
    const upstreamResponse = await fetch(parsedPreviewUrl.toString(), {
      headers: {
        Accept: 'text/html,application/json,text/plain,*/*',
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      },
      redirect: 'follow',
    })

    const finalUrl = upstreamResponse.url || parsedPreviewUrl.toString()
    const responseText = await upstreamResponse.text()

    if (!upstreamResponse.ok) {
      return res.status(upstreamResponse.status).json({
        message: 'Unable to load intent request URL.',
      })
    }

    const cityFromFinalUrl = extractIntentCityFromUrl(finalUrl)
    const cityFromRawUrl = extractIntentCityFromUrl(parsedPreviewUrl.toString())
    const cityFromHtml = extractIntentCityFromHtml(responseText)
    const city = cityFromFinalUrl || cityFromRawUrl || cityFromHtml || ''

    return res.json({
      url: finalUrl,
      data: {
        city,
      },
    })
  } catch (error) {
    return res.status(502).json({
      message: 'Backend failed to fetch intent preview.',
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.listen(port, () => {
  console.log(`BFF server running on http://localhost:${port}`)
})
