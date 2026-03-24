import dotenv from 'dotenv'
import express from 'express'

dotenv.config()

const app = express()
const port = Number(process.env.SERVER_PORT || 5000)

app.use(express.json())

const formatDateForApi = (dateValue) => dateValue.replaceAll('-', '')

const isValidDateInput = (dateValue) => /^\d{4}-\d{2}-\d{2}$/.test(dateValue)

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

const extractProductDataFromHtml = (rawHtml) => {
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
  
  return {
    title: title || 'Product',
    price: price || 'Price not available',
    image: image || '',
    rating: rating || '',
  }
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

  if (!isValidDateInput(startDate) || !isValidDateInput(endDate)) {
    return res.status(400).json({
      message: 'Dates must be in YYYY-MM-DD format.',
    })
  }

  const apiToken = process.env.GLACTIVITY_AK
  const baseUrl = process.env.GLACTIVITY_BASE_URL

  if (!apiToken || !baseUrl) {
    return res.status(500).json({
      message: 'Server environment is missing API configuration.',
    })
  }

  const queryParams = new URLSearchParams({
    AK: apiToken,
    flag: '2',
    glusrId: String(glId),
    starttime: formatDateForApi(startDate),
    endtime: formatDateForApi(endDate),
  })

  const targetUrl = `${baseUrl}?${queryParams.toString()}`

  try {
    const externalResponse = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json, text/plain, */*',
      },
    })

    const contentType = externalResponse.headers.get('content-type') ?? ''
    const isJsonResponse = contentType.includes('application/json')
    let responsePayload

    if (isJsonResponse) {
      responsePayload = await externalResponse.json()
    } else {
      const rawText = await externalResponse.text()
      try {
        responsePayload = JSON.parse(rawText)
      } catch {
        responsePayload = rawText
      }
    }

    if (!externalResponse.ok) {
      return res.status(externalResponse.status).json({
        message: 'External API returned an error.',
        data: responsePayload,
      })
    }

    return res.json(responsePayload)
  } catch (error) {
    return res.status(502).json({
      message: 'Failed to call external API from backend.',
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

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

    const productData = extractProductDataFromHtml(responseText)

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
