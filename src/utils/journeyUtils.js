import { ACTIVITY_LABELS } from '../activityLabels'



const SEARCH_ACTIVITY_IDS = new Set([521, 677, 2006, 4480])
const PRODUCT_VIEW_ACTIVITY_IDS = new Set([438, 4383, 4481, 4657])
const SUPPLIER_VIEW_ACTIVITY_IDS = new Set([4272, 4602])
const IMAGE_VIEW_ACTIVITY_IDS = new Set([4257])
const LANDING_ACTIVITY_IDS = new Set([413, 506, 854, 4479])
const ENQUIRY_ACTIVITY_IDS = new Set([
  507, 531, 533, 753, 754, 929, 996, 1489, 4269, 4656, 4729,
])
const BUYLEAD_ACTIVITY_IDS = new Set([4400, 4403, 4406, 4409, 4656, 4729])
const SYSTEM_ACTIVITY_IDS = new Set([527, 673, 674, 678, 1764, 1841, 1842, 1844, 1975, 1986, 1987, 2064, 2215, 2604, 2633, 2656, 2657])

const SESSION_GAP_MS = 30 * 60 * 1000
const RELATED_ACTION_MERGE_WINDOW_MS = 5 * 1000

const parseDateValue = (value) => {
  const raw = String(value ?? '')
  if (!/^\d{8,14}$/.test(raw)) {
    return null
  }

  const year = Number(raw.slice(0, 4))
  const month = Number(raw.slice(4, 6)) - 1
  const day = Number(raw.slice(6, 8))
  const hour = Number(raw.slice(8, 10) || '0')
  const minute = Number(raw.slice(10, 12) || '0')
  const second = Number(raw.slice(12, 14) || '0')

  const date = new Date(year, month, day, hour, minute, second)
  return Number.isNaN(date.getTime()) ? null : date
}

const formatDisplayTime = (value) => {
  const parsed = parseDateValue(value)
  if (!parsed) {
    return String(value ?? '-')
  }

  return parsed.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}

const getSessionPalette = (sessionNumber) => {
  const safeSession = Number.isFinite(Number(sessionNumber))
    ? Number(sessionNumber)
    : 1

  const colorCode = (safeSession * 123456) % 0xffffff
  const colorHex = `#${colorCode.toString(16).padStart(6, '0')}`

  return {
    itemBg: `${colorHex}1a`,
    itemBorder: `${colorHex}66`,
  }
}

const safeDecode = (value) => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

const decodeQueryValue = (value) => {
  if (value === null || value === undefined) {
    return null
  }

  const normalized = safeDecode(String(value).replace(/\+/g, ' ')).trim()
  return normalized || null
}

const detectDomainFromReferer = (refererUrl) => {
  if (!refererUrl || refererUrl === '-') {
    return null
  }

  try {
    const url = new URL(refererUrl)
    const hostname = url.hostname.toLowerCase()
    if (hostname.includes('export.indiamart')) {
      return 'export.indiamart.com'
    }
    if (hostname.includes('dir.indiamart')) {
      return 'dir.indiamart.com'
    }
    if (hostname.includes('indiamart')) {
      return hostname
    }
  } catch {}
  return null
}

const getDomainFromModidAndReferer = (modid, refererUrl, domainName) => {
  if (!modid || modid === '-') {
    modid = null
  }

  const refererDomain = detectDomainFromReferer(refererUrl)
  if (refererDomain) {
    return refererDomain
  }

  const normalizedDomain = normalizeDomain(domainName)
  if (normalizedDomain?.includes('export')) {
    return 'export.indiamart.com'
  }

  if (normalizedDomain?.includes('dir')) {
    return 'dir.indiamart.com'
  }

  return 'www.indiamart.com'
}

const canonicalizeIndiamartUrl = (urlValue) => {
  if (!urlValue) {
    return urlValue
  }

  try {
    const parsed = new URL(urlValue)
    const host = parsed.hostname.toLowerCase()
    const path = parsed.pathname.toLowerCase()

    // Product detail links should always open on the primary IndiaMART domain.
    if (host.includes('indiamart.com') && path.startsWith('/proddetail/')) {
      parsed.hostname = 'www.indiamart.com'
    }

    return parsed.toString()
  } catch {
    return urlValue
  }
}

const buildProductUrl = (productId, modid, refererUrl, domainName) => {
  if (!productId) {
    return null
  }

  const baseDomain = getDomainFromModidAndReferer(modid, refererUrl, domainName)
  return canonicalizeIndiamartUrl(`https://${baseDomain}/proddetail/${productId}.html`)
}

const buildSearchUrl = (requestPath, modid, refererUrl, domainName) => {
  if (!requestPath) {
    return null
  }

  if (/^https?:\/\//i.test(requestPath)) {
    return canonicalizeIndiamartUrl(requestPath)
  }

  const baseDomain = getDomainFromModidAndReferer(modid, refererUrl, domainName)
  const path = requestPath.startsWith('/') ? requestPath : `/${requestPath}`
  return canonicalizeIndiamartUrl(`https://${baseDomain}${path}`)
}

const buildCompanyUrl = (requestPath, modid, refererUrl, domainName) => {
  if (!requestPath) {
    return null
  }

  if (/^https?:\/\//i.test(requestPath)) {
    return canonicalizeIndiamartUrl(requestPath)
  }

  const path = requestPath.startsWith('/') ? requestPath : `/${requestPath}`
  if (!path.toLowerCase().startsWith('/company/')) {
    return null
  }

  const baseDomain = getDomainFromModidAndReferer(modid, refererUrl, domainName)
  return canonicalizeIndiamartUrl(`https://${baseDomain}${path}`)
}

const extractPathFromRequestUrl = (requestUrl) => {
  if (!requestUrl) {
    return ''
  }

  const trimmed = String(requestUrl).trim()
  const methodMatch = trimmed.match(/^[A-Z]+\s+(\S+)\s+HTTP\/[\d.]+$/)
  const path = methodMatch ? methodMatch[1] : trimmed
  return path
}

const isIntentGenerationRequestPath = (requestPath) => {
  const path = String(requestPath || '').toLowerCase()
  return path.includes('newreqform/intentgeneration')
}

const normalizeDomain = (domainValue) => {
  if (!domainValue || domainValue === '-') {
    return null
  }

  const clean = String(domainValue).trim().replace(/^https?:\/\//i, '')
  return clean || null
}

const buildAbsoluteFromDomain = (requestPath, domainName) => {
  if (!requestPath) {
    return null
  }

  if (/^https?:\/\//i.test(requestPath)) {
    return canonicalizeIndiamartUrl(requestPath)
  }

  const domain = normalizeDomain(domainName)
  if (!domain) {
    return null
  }

  const path = requestPath.startsWith('/') ? requestPath : `/${requestPath}`
  return canonicalizeIndiamartUrl(`https://${domain}${path}`)
}

const toAbsoluteUrl = (value) => {
  if (!value || value === '-') {
    return null
  }

  const clean = String(value).trim()
  if (/^https?:\/\//i.test(clean)) {
    return canonicalizeIndiamartUrl(clean)
  }

  return null
}

const parseUrlWithFallbackBase = (requestPath, domainName) => {
  if (!requestPath) {
    return null
  }

  const domain = normalizeDomain(domainName) || 'www.indiamart.com'
  const normalizedPath = requestPath.startsWith('/')
    ? requestPath
    : `/${requestPath}`

  try {
    return new URL(normalizedPath, `https://${domain}`)
  } catch {
    return null
  }
}

const getImTrackingUrls = (requestPath, domainName, referer) => {
  const refererUrl = toAbsoluteUrl(referer)
  const parsed = parseUrlWithFallbackBase(requestPath, domainName)
  const pathName = parsed?.pathname || ''
  const isAjaxService = pathName.startsWith('/api/ajax-services/')
  const isIntentGeneration =
    pathName.endsWith('/index.php') &&
    parsed?.searchParams.get('r') === 'Newreqform/IntentGeneration'
  const isHomepageAjax = pathName === '/homepage-ajax'

  const currPageUrl = toAbsoluteUrl(parsed?.searchParams.get('curr_page_url'))
  const prevPageUrl = toAbsoluteUrl(parsed?.searchParams.get('prev_page_url'))
  const landingRefUrl = toAbsoluteUrl(parsed?.searchParams.get('landing_ref_url'))
  const serviceUrl = buildAbsoluteFromDomain(requestPath, domainName)

  let pageUrl = null
  if (isIntentGeneration) {
    pageUrl = currPageUrl || prevPageUrl || refererUrl || landingRefUrl || null
  } else if (isAjaxService || isHomepageAjax) {
    pageUrl = refererUrl || currPageUrl || prevPageUrl || landingRefUrl || null
  } else {
    pageUrl = buildAbsoluteFromDomain(requestPath, domainName) || refererUrl
  }

  return {
    pageUrl,
    serviceUrl,
    refererUrl,
    currPageUrl,
    prevPageUrl,
    landingRefUrl,
    intentProductName: safeDecode(parsed?.searchParams.get('s_prod_name') || ''),
    intentProductId:
      parsed?.searchParams.get('modref_id') ||
      parsed?.searchParams.get('displayid') ||
      null,
    isAjaxService,
    isIntentGeneration,
    isHomepageAjax,
    serviceType: pathName.includes('/supplierrating/')
      ? 'supplierrating'
      : pathName.includes('/caps_service/')
        ? 'caps_service'
        : pathName.includes('/glb_city/')
          ? 'glb_city'
          : null,
  }
}

const extractSearchDetails = (requestPath) => {
  try {
    const url = new URL(requestPath, 'https://dummy.local')
    return {
      keyword:
        url.searchParams.get('ss') ||
        url.searchParams.get('q') ||
        url.searchParams.get('keyword') ||
        null,
      city: url.searchParams.get('cq') || null,
    }
  } catch {
    return {
      keyword: null,
      city: null,
    }
  }
}

const extractSearchJourneyEvent = (activityId, requestPath) => {
  if (Number(activityId) !== 677) {
    const details = extractSearchDetails(requestPath)
    return {
      action: null,
      searchTerm: details.keyword,
      filters: {},
      signature: null,
    }
  }

  try {
    const url = new URL(requestPath, 'https://dummy.local')
    const params = url.searchParams

    const searchTerm =
      decodeQueryValue(params.get('ss')) ||
      decodeQueryValue(params.get('q')) ||
      decodeQueryValue(params.get('keyword')) ||
      null

    const minPrice = decodeQueryValue(params.get('minprice'))
    const maxPrice = decodeQueryValue(params.get('maxprice'))
    const city = decodeQueryValue(params.get('cq'))
    const tags = decodeQueryValue(params.get('tags'))
    const ct = decodeQueryValue(params.get('ct'))

    const hasFilterParams =
      Boolean(minPrice) ||
      Boolean(maxPrice) ||
      Boolean(city) ||
      ct === 'pf' ||
      Boolean(tags)

    const action = hasFilterParams ? 'filter_applied' : 'search'

    const filters = {}
    if (minPrice || maxPrice) {
      filters.price = `${minPrice || '-'} - ${maxPrice || '-'}`
    }
    if (city) {
      filters.city = city
    }
    if (tags) {
      filters.tags = tags
    }

    return {
      action,
      searchTerm,
      filters,
      signature: [
        action,
        searchTerm || '-',
        filters.price || '-',
        filters.city || '-',
        filters.tags || '-',
      ].join('|'),
    }
  } catch {
    const details = extractSearchDetails(requestPath)
    return {
      action: 'search',
      searchTerm: details.keyword,
      filters: details.city ? { city: details.city } : {},
      signature: `search|${details.keyword || '-'}|-|${details.city || '-'}|-`,
    }
  }
}

const extractProductName = (requestPath) => {
  const pathOnly = requestPath.split('?')[0]
  const productMatch = pathOnly.match(/\/proddetail\/([^/]+)\.html/i)

  if (!productMatch) {
    return null
  }

  const slug = safeDecode(productMatch[1])
  const withoutNumericTail = slug.replace(/-\d+$/, '')
  return withoutNumericTail.replace(/-/g, ' ').trim()
}

const extractMcatPageName = (requestPath) => {
  try {
    const parsed = new URL(requestPath, 'https://www.indiamart.com')
    const pathName = parsed.pathname || ''
    const mcatMatch = pathName.match(/\/impcat\/([^/?#]+?)(?:\.html)?$/i)
    if (!mcatMatch) {
      return null
    }

    const slug = safeDecode(mcatMatch[1]).trim()
    if (!slug) {
      return null
    }

    return slug
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  } catch {
    return null
  }
}

const parseIntentRefContext = (rawRefText) => {
  const decoded = decodeQueryValue(rawRefText)
  if (!decoded) {
    return {}
  }

  return decoded.split('|').reduce((context, token) => {
    const [rawKey, ...valueParts] = token.split('=')
    const key = String(rawKey || '').trim()
    if (!key) {
      return context
    }

    const value = valueParts.join('=').trim()
    context[key] = value
    return context
  }, {})
}

const extractEnquiryIntentDetails = (requestPath, title, activityId) => {
  const parsed = parseUrlWithFallbackBase(requestPath, 'www.indiamart.com')
  const searchParams = parsed?.searchParams
  const refContext = parseIntentRefContext(searchParams?.get('rfq_query_ref_text'))

  const ctaName =
    decodeQueryValue(refContext.ctaName) ||
    decodeQueryValue(searchParams?.get('ctaName')) ||
    null
  const ctaType =
    decodeQueryValue(refContext.ctaType) ||
    decodeQueryValue(searchParams?.get('ctaType')) ||
    null
  const section = decodeQueryValue(refContext.Section) || null
  const requestTitle = cleanText(title)
  const sourceMatch = requestTitle?.match(/\(([^)]+)\)/)
  const sourceLabel =
    decodeQueryValue(refContext.Position) ||
    decodeQueryValue(refContext.template5) ||
    decodeQueryValue(sourceMatch?.[1]) ||
    section ||
    null

  const evidenceText = [
    requestPath,
    requestTitle,
    ctaName,
    ctaType,
    section,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  const isBestPriceIntent =
    Number(activityId) === 4269 ||
    evidenceText.includes('best price') ||
    evidenceText.includes('latest price') ||
    evidenceText.includes('price enquiry') ||
    evidenceText.includes('ask price')

  return {
    isBestPriceIntent,
    ctaName,
    ctaType,
    section,
    sourceLabel,
  }
}

const extractProductIdFromRequestPath = (requestPath) => {
  try {
    const parsed = new URL(requestPath, 'https://www.indiamart.com')
    const fromQuery =
      decodeQueryValue(parsed.searchParams.get('modref_id')) ||
      decodeQueryValue(parsed.searchParams.get('displayid')) ||
      null

    if (fromQuery) {
      return fromQuery
    }

    const pathOnly = parsed.pathname || ''
    const pathMatch = pathOnly.match(/\/proddetail\/([^/?]+)\.html/i)
    if (!pathMatch) {
      return null
    }

    const token = decodeQueryValue(pathMatch[1])
    if (!token) {
      return null
    }

    const idMatch = token.match(/(\d{6,})$/)
    return idMatch ? idMatch[1] : null
  } catch {
    return null
  }
}

const extractCityFromCurrPageUrl = (currPageUrlRaw) => {
  if (!currPageUrlRaw) {
    return null
  }

  const decodedCurrPageUrl = safeDecode(currPageUrlRaw)

  try {
    const parsedCurrPage = new URL(decodedCurrPageUrl, 'https://www.indiamart.com')
    return (
      decodeQueryValue(parsedCurrPage.searchParams.get('ipct')) ||
      decodeQueryValue(parsedCurrPage.searchParams.get('prefct')) ||
      decodeQueryValue(parsedCurrPage.searchParams.get('glbct')) ||
      decodeQueryValue(parsedCurrPage.searchParams.get('cq')) ||
      null
    )
  } catch {
    return null
  }
}

const extractImageViewDetails = (requestPath) => {
  try {
    const parsed = new URL(requestPath, 'https://www.indiamart.com')
    const productId = decodeQueryValue(parsed.searchParams.get('modref_id'))
    const productName = decodeQueryValue(parsed.searchParams.get('s_prod_name'))
    const cityFromOwnParams =
      decodeQueryValue(parsed.searchParams.get('ipct')) ||
      decodeQueryValue(parsed.searchParams.get('prefct')) ||
      decodeQueryValue(parsed.searchParams.get('glbct')) ||
      decodeQueryValue(parsed.searchParams.get('cq'))
    const cityFromCurrPage = extractCityFromCurrPageUrl(
      parsed.searchParams.get('curr_page_url'),
    )
    const city = cityFromOwnParams || cityFromCurrPage || null

    return {
      productId,
      productName,
      city,
      productUrl: productId
        ? `https://www.indiamart.com/proddetail/${productId}.html`
        : null,
    }
  } catch {
    return {
      productId: null,
      productName: null,
      city: null,
      productUrl: null,
    }
  }
}

const normalizeApiPayload = (payload) => {
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload)
    } catch {
      return null
    }
  }

  return payload && typeof payload === 'object' ? payload : null
}

const cleanText = (value) => {
  if (!value || value === '-') {
    return null
  }

  return String(value)
}

const isIgnoredBackgroundRecord = (log) => {
  const activityId = Number(log?.fk_activity_id)
  const displayTitle = String(log?.fk_display_title || '').trim().toLowerCase()
  const domainName = String(log?.domain_name || '').trim().toLowerCase()

  return (
    activityId === 4597 ||
    displayTitle === 'internal request' ||
    domainName === 'buyer.indiamart.com'
  )
}

/**
 * Centralized event classification function
 * Applies rules in STRICT PRIORITY ORDER
 * STEP 1: Ignore internal APIs
 * STEP 2: Image View (HIGH PRIORITY)
 * STEP 3: Enquiry Intent
 * STEP 4: Search & Filters
 * STEP 5: Default fallback
 */
const classifyEvent = (log) => {
  if (!log || typeof log !== 'object') {
    return { action: 'unknown' }
  }

  const activityId = Number(log?.fk_activity_id)
  const flag = Number(log?.flag)
  const ctaType = String(log?.ctaType || '').trim()
  const displayTitle = String(log?.fk_display_title || '').trim().toLowerCase()
  const requestUrl = String(log?.request_url || '').trim()
  const modrefId = String(log?.modref_id || log?.product_disp_id || '').trim()
  const prodName = String(log?.s_prod_name || '').trim()
  
  // Helper function to extract URL parameter safely
  const getUrlParam = (url, paramName) => {
    try {
      const parsed = new URL(url, 'https://www.indiamart.com')
      return parsed.searchParams.get(paramName)
    } catch {
      return null
    }
  }
  
  // Helper function to check if URL contains any of the given params
  const urlHasAnyParam = (url, paramNames = []) => {
    return paramNames.some(param => getUrlParam(url, param) !== null)
  }

  // STEP 1: Ignore internal APIs (HIGHEST PRIORITY)
  if (activityId === 4597) {
    return { action: 'ignore' }
  }

  // STEP 2: Image View (HIGH PRIORITY - before enquiry to avoid misclassification)
  if (
    activityId === 4257 &&
    flag === 16 &&
    ctaType === 'Image'
  ) {
    return {
      action: 'view_image',
      product_id: modrefId || null,
      product_name: prodName || null,
    }
  }

  // STEP 3: Enquiry Intent
  if (
    activityId === 4243 &&
    flag === 12 &&
    ctaType === 'Product Enquiry'
  ) {
    return {
      action: 'enquiry',
      product_id: modrefId || null,
      product_name: prodName || null,
    }
  }

  // STEP 4: Search & Filters
  if (activityId === 677) {
    const searchTerm = getUrlParam(requestUrl, 'ss') ||
                      getUrlParam(requestUrl, 'q') ||
                      getUrlParam(requestUrl, 'keyword') ||
                      null
    
    const hasFilterParams = 
      getUrlParam(requestUrl, 'minprice') !== null ||
      getUrlParam(requestUrl, 'maxprice') !== null ||
      getUrlParam(requestUrl, 'cq') !== null ||
      getUrlParam(requestUrl, 'ct') === 'pf'
    
    const action = hasFilterParams ? 'filter_applied' : 'search'
    
    const result = {
      action,
      search_term: searchTerm || null,
    }
    
    // Extract additional filter details if available
    if (hasFilterParams) {
      const minPrice = getUrlParam(requestUrl, 'minprice')
      const maxPrice = getUrlParam(requestUrl, 'maxprice')
      const city = getUrlParam(requestUrl, 'cq')
      
      if (minPrice || maxPrice) {
        result.filter_price = `${minPrice || '-'} - ${maxPrice || '-'}`
      }
      if (city) {
        result.filter_city = city
      }
    }
    
    return result
  }

  // STEP 5: Default fallback
  return { action: 'unknown' }
}

const flattenAndSortLogs = (activity) => {
  const logs = Object.values(activity ?? {})
    .flat()
    .filter(
      (entry) =>
        entry &&
        typeof entry === 'object' &&
        !isIgnoredBackgroundRecord(entry),
    )

  return logs.sort((left, right) => {
    const leftTime = parseDateValue(left.datevalue)?.getTime() ?? 0
    const rightTime = parseDateValue(right.datevalue)?.getTime() ?? 0
    return leftTime - rightTime
  })
}

const getPageContextKey = (requestPath, domainName, log) => {
  const searchJourneyEvent = extractSearchJourneyEvent(log?.fk_activity_id, requestPath)
  if (Number(log?.fk_activity_id) === 677 && searchJourneyEvent.signature) {
    return `search:${searchJourneyEvent.signature}`
  }

  const parsed = parseUrlWithFallbackBase(requestPath, domainName)
  return parsed?.pathname || requestPath || '-'
}

const getTimeSecondBucket = (dateValue) => {
  const timestamp = parseDateValue(dateValue)?.getTime()
  return timestamp ? Math.floor(timestamp / 1000) : null
}

const isSystemGeneratedLog = (log) => {
  const activityId = Number(log.fk_activity_id)
  const label = (ACTIVITY_LABELS[activityId] || '').toLowerCase()
  const requestPath = extractPathFromRequestUrl(log.request_url).toLowerCase()

  return (
    isIgnoredBackgroundRecord(log) ||
    SYSTEM_ACTIVITY_IDS.has(activityId) ||
    requestPath.startsWith('/api/') ||
    requestPath.includes('/api/ajax-services/') ||
    label.startsWith('system ') ||
    label.startsWith('internal system') ||
    label.includes('resolved') ||
    label.includes('fetched') ||
    label.includes('loaded')
  )
}

const getPrimaryActionScore = (log) => {
  const activityId = Number(log.fk_activity_id)
  const label = (ACTIVITY_LABELS[activityId] || '').toLowerCase()
  const requestPath = extractPathFromRequestUrl(log.request_url).toLowerCase()

  if (BUYLEAD_ACTIVITY_IDS.has(activityId) || label.includes('bl form final step') || label.includes('buylead')) {
    return 100
  }

  if (ENQUIRY_ACTIVITY_IDS.has(activityId) || label.includes('enquiry') || isIntentGenerationRequestPath(requestPath)) {
    return 90
  }

  if (PRODUCT_VIEW_ACTIVITY_IDS.has(activityId) || requestPath.includes('/proddetail/') || label.includes('product detail')) {
    return 80
  }

  if (SEARCH_ACTIVITY_IDS.has(activityId) || label.includes('search') || requestPath.includes('/search') || requestPath.includes('ss=')) {
    return 70
  }

  if (SUPPLIER_VIEW_ACTIVITY_IDS.has(activityId) || label.includes('supplier') || label.includes('company products')) {
    return 60
  }

  if (IMAGE_VIEW_ACTIVITY_IDS.has(activityId) || label.includes('image')) {
    return 50
  }

  if (LANDING_ACTIVITY_IDS.has(activityId) || label.includes('home page') || label.includes('homepage')) {
    return 40
  }

  if (label.includes('clicked') || label.includes('opened') || label.includes('viewed')) {
    return 30
  }

  return 10
}

const pickPrimaryLogFromGroup = (logsInGroup) => {
  const userLogs = logsInGroup.filter((log) => !isSystemGeneratedLog(log))
  if (userLogs.length === 0) {
    return null
  }

  return userLogs.sort((left, right) => getPrimaryActionScore(right) - getPrimaryActionScore(left))[0]
}

const reduceToPrimaryUserActions = (sortedLogs) => {
  const reduced = []
  let activeGroup = []
  let activeKey = null

  for (const log of sortedLogs) {
    const requestPath = extractPathFromRequestUrl(log.request_url)
    const referer = String(log.referer ?? '').trim() || '-'
    const pageContext = getPageContextKey(requestPath, log.domain_name, log)
    const secondBucket = getTimeSecondBucket(log.datevalue)
    const key = `${secondBucket ?? '-'}|${referer}|${pageContext}`

    if (activeKey === null || key === activeKey) {
      activeGroup.push(log)
      activeKey = key
      continue
    }

    const primaryLog = pickPrimaryLogFromGroup(activeGroup)
    if (primaryLog) {
      reduced.push(primaryLog)
    }

    activeGroup = [log]
    activeKey = key
  }

  const trailingPrimaryLog = pickPrimaryLogFromGroup(activeGroup)
  if (trailingPrimaryLog) {
    reduced.push(trailingPrimaryLog)
  }

  return reduced
}

const getEntityKey = (step) => {
  if (step.product_id) {
    return `product:${step.product_id}`
  }

  if (step.keyword) {
    const cityKey = (step.search_city || '').toLowerCase()
    return `search:${String(step.keyword).toLowerCase()}|${cityKey}`
  }

  if (step.mcat_ids) {
    return `mcat:${String(step.mcat_ids)}`
  }

  return null
}

const getActionDepth = (step) => {
  const normalizedType = String(step.type || '').toLowerCase()

  if (step.is_buylead || step.is_enquiry) {
    return 4
  }

  if (step.is_product_view || normalizedType.includes('product detail')) {
    return 3
  }

  if (normalizedType.includes('opened') || normalizedType.includes('open')) {
    return 2
  }

  if (normalizedType.includes('viewed') || normalizedType.includes('view')) {
    return 1
  }

  if (normalizedType.includes('clicked') || normalizedType.includes('click')) {
    return 0
  }

  return 1
}

const mergeRelatedJourneySteps = (steps) => {
  const merged = []

  for (const step of steps) {
    const entityKey = getEntityKey(step)
    if (!entityKey || step.timestamp_ms === null) {
      merged.push(step)
      continue
    }

    let mergedIntoExisting = false

    for (let index = merged.length - 1; index >= 0; index -= 1) {
      const candidate = merged[index]
      if (!candidate?.entity_key || candidate.timestamp_ms === null) {
        continue
      }

      const timeGap = step.timestamp_ms - candidate.timestamp_ms
      if (timeGap > RELATED_ACTION_MERGE_WINDOW_MS) {
        break
      }

      if (candidate.entity_key !== entityKey) {
        continue
      }

      const stepDepth = getActionDepth(step)
      const candidateDepth = getActionDepth(candidate)

      if (stepDepth >= candidateDepth) {
        merged[index] = {
          ...step,
          step: candidate.step,
          session: candidate.session,
        }
      }

      mergedIntoExisting = true
      break
    }

    if (!mergedIntoExisting) {
      merged.push(step)
    }
  }

  return merged.map((step, index) => ({
    ...step,
    step: index + 1,
  }))
}

const buildJourneyFromLogs = (apiPayload) => {
  const normalized = normalizeApiPayload(apiPayload)
  const activity = normalized?.activity

  if (!activity || typeof activity !== 'object') {
    return null
  }

  const sortedLogs = flattenAndSortLogs(activity)
  const dedupedLogs = reduceToPrimaryUserActions(sortedLogs)

  if (dedupedLogs.length === 0) {
    return null
  }

  let sessionId = 1
  let previousTimestamp = null

  const enrichedSteps = dedupedLogs.map((log, index) => {
    const timestamp = parseDateValue(log.datevalue)
    const timestampMs = timestamp?.getTime() ?? null

    if (
      previousTimestamp !== null &&
      timestampMs !== null &&
      timestampMs - previousTimestamp > SESSION_GAP_MS
    ) {
      sessionId += 1
    }

    if (timestampMs !== null) {
      previousTimestamp = timestampMs
    }

    // Classify event using centralized classification function
    const eventClassification = classifyEvent(log)

    const requestPath = extractPathFromRequestUrl(log.request_url)
    const isIntentGeneration = isIntentGenerationRequestPath(requestPath)
    const type = isIntentGeneration
      ? 'Enquiry Intent'
      : ACTIVITY_LABELS[log.fk_activity_id] ?? 'Other'
    const imUrls = getImTrackingUrls(requestPath, log.domain_name, log.referer)
    const imageViewDetails = extractImageViewDetails(requestPath)
    const enquiryIntentDetails = extractEnquiryIntentDetails(
      requestPath,
      log.fk_display_title,
      log.fk_activity_id,
    )
    const searchJourneyEvent = extractSearchJourneyEvent(log.fk_activity_id, requestPath)
    const pageUrl = imUrls.pageUrl
    const searchDetails = extractSearchDetails(requestPath)
    const mcatPageName = extractMcatPageName(requestPath)
    const productName =
      imageViewDetails.productName ||
      extractProductName(requestPath) ||
      cleanText(imUrls.intentProductName) ||
      null
    const refererUrl = imUrls.refererUrl
    const imageSourceUrl =
      type === 'Image View'
        ? imUrls.currPageUrl || imUrls.prevPageUrl || refererUrl || pageUrl || null
        : null
    const productId =
      imageViewDetails.productId ||
      extractProductIdFromRequestPath(requestPath) ||
      cleanText(imUrls.intentProductId) ||
      cleanText(log.product_disp_id) ||
      null
    const resolvedProductUrl = buildProductUrl(
      productId,
      cleanText(log.modid),
      log.referer || '-',
      log.domain_name || '-',
    )

    const activityId = Number(log.fk_activity_id)
    const normalizedType = type.toLowerCase()
    const isSearch =
      SEARCH_ACTIVITY_IDS.has(activityId) || normalizedType.includes('search')
    const isProductView =
      PRODUCT_VIEW_ACTIVITY_IDS.has(activityId) ||
      normalizedType.includes('product detail') ||
      normalizedType.includes('product view')
    const isSupplierView =
      SUPPLIER_VIEW_ACTIVITY_IDS.has(activityId) ||
      normalizedType.includes('supplier') ||
      normalizedType.includes('company products')
    const isImageView =
      IMAGE_VIEW_ACTIVITY_IDS.has(activityId) || normalizedType.includes('image')
    const isLanding =
      LANDING_ACTIVITY_IDS.has(activityId) ||
      normalizedType.includes('home page') ||
      normalizedType.includes('homepage') ||
      normalizedType.includes('landing')
    const isEnquiry =
      ENQUIRY_ACTIVITY_IDS.has(activityId) ||
      normalizedType.includes('enquiry') ||
      isIntentGeneration
    const isBuyLead =
      BUYLEAD_ACTIVITY_IDS.has(activityId) ||
      normalizedType.includes('bl form final step') ||
      normalizedType.includes('buylead')

    // Use eventClassification to determine action type
    // Example: if (eventClassification.action === 'view_image') { ... }
    // Available classifications: 'ignore', 'view_image', 'enquiry', 'search', 'filter_applied', 'unknown'
    // Always check eventClassification.action first to avoid misclassifications

    const step = {
      step: index + 1,
      session: sessionId,
      time: formatDisplayTime(log.datevalue),
      timestamp_ms: timestampMs,
      type,
      activity_id: log.fk_activity_id,
      title: log.fk_display_title || '-',
      classified_action: eventClassification.action, // Store classified action
      keyword: searchJourneyEvent.searchTerm || searchDetails.keyword,
      search_city: searchJourneyEvent.filters.city || searchDetails.city,
      city:
        searchJourneyEvent.filters.city ||
        searchDetails.city ||
        log.glb_city ||
        null,
      search_action: searchJourneyEvent.action,
      search_filters: searchJourneyEvent.filters,
      mcat_page_name: mcatPageName,
      product: productName,
      image_view_city: imageViewDetails.city,
      product_id: productId,
      product_url: resolvedProductUrl,
      company_url: isSupplierView
        ? buildCompanyUrl(
            requestPath,
            cleanText(log.modid),
            log.referer || '-',
            log.domain_name || '-',
          ) || pageUrl
        : null,
      image_product_id: productId,
      image_product_url: resolvedProductUrl,
      modid: cleanText(log.modid),
      referer_domain: detectDomainFromReferer(log.referer),
      log_domain: log.domain_name || '-',
      domain: log.domain_name || '-',
      page_url: pageUrl,
      request_path: requestPath || '-',
      referer: log.referer || '-',
      referer_url: refererUrl,
      image_source_url: imageSourceUrl,
      service_url: imUrls.serviceUrl,
      service_type: imUrls.serviceType,
      previous_page_url: imUrls.prevPageUrl,
      product_disp_id: log.product_disp_id || null,
      intent_product_id: imUrls.intentProductId,
      mcat_names: log.mcat_names || null,
      mcat_ids: cleanText(log.mcat_ids),

      http_status: cleanText(log.http_status),
      user_agent: cleanText(log.user_agent),
      is_search: isSearch,
      is_product_view: isProductView,
      is_supplier_view: isSupplierView,
      is_image_view: isImageView,
      is_landing: isLanding,
      is_enquiry: isEnquiry,
      is_enquiry_intent: isIntentGeneration,
      is_best_price_intent: enquiryIntentDetails.isBestPriceIntent,
      enquiry_cta_name: enquiryIntentDetails.ctaName,
      enquiry_cta_type: enquiryIntentDetails.ctaType,
      enquiry_section: enquiryIntentDetails.section,
      enquiry_source: enquiryIntentDetails.sourceLabel,
      is_buylead: isBuyLead,
      is_mcat_page:
        Boolean(mcatPageName) ||
        Number(log.fk_activity_id) === 393 ||
        /\/impcat\//i.test(requestPath),
      mcat_ids: cleanText(log.mcat_ids),
      entity_key: null,
    }

    step.entity_key = getEntityKey(step)

    return step
  })

  const journey = mergeRelatedJourneySteps(enrichedSteps)

  const summary = journey.reduce(
    (accumulator, step) => {
      accumulator.totalSteps += 1

      if (step.is_search) {
        accumulator.searches += 1
        accumulator.intentScore += 2
      }

      if (step.is_product_view) {
        accumulator.productViews += 1
        accumulator.intentScore += 3
      }

      if (step.is_supplier_view) {
        accumulator.supplierViews += 1
      }

      if (step.is_image_view) {
        accumulator.imageViews += 1
      }

      if (step.is_landing) {
        accumulator.landingSteps += 1
      }

      if (step.is_enquiry) {
        accumulator.enquiriesRaised += 1
        accumulator.intentScore += 4
      }

      if (step.is_buylead) {
        accumulator.buyLeadsGenerated += 1
        accumulator.intentScore += 5
      }

      return accumulator
    },
    {
      totalSteps: 0,
      searches: 0,
      productViews: 0,
      supplierViews: 0,
      imageViews: 0,
      landingSteps: 0,
      enquiriesRaised: 0,
      buyLeadsGenerated: 0,
      intentScore: 0,
    },
  )

  const insights = []
  if (summary.searches > 0 && summary.productViews === 0) {
    insights.push(
      'User searched but never opened a product page. Search relevance or ranking may need improvement.',
    )
  }

  if (summary.productViews > 0 && summary.supplierViews === 0) {
    insights.push(
      'User viewed product details but did not proceed to supplier-level engagement. Trust or pricing clarity may be missing.',
    )
  }

  if (summary.searches >= 3) {
    insights.push(
      'High search count suggests exploration friction or unclear discovery paths.',
    )
  }

  if (journey.length > 0) {
    const lastStep = journey[journey.length - 1]
    if (lastStep.is_search || lastStep.is_product_view) {
      insights.push(
        'Journey ends immediately after a high-intent action. This may indicate UX drop-off or decision uncertainty.',
      )
    }
  }

  if (insights.length === 0) {
    insights.push('No major friction detected in this session window.')
  }

  const funnel = [
    { label: 'Landing', value: summary.landingSteps },
    { label: 'Search', value: summary.searches },
    { label: 'Product', value: summary.productViews },
    { label: 'Exit', value: summary.totalSteps > 0 ? 1 : 0 },
  ]

  const searchKeywords = journey
    .map((step) => step.keyword)
    .filter((value) => Boolean(value))

  const keywordFrequency = searchKeywords.reduce((accumulator, keyword) => {
    const key = keyword.toLowerCase()
    accumulator[key] = (accumulator[key] || 0) + 1
    return accumulator
  }, {})

  const topKeyword = Object.entries(keywordFrequency).sort(
    (left, right) => right[1] - left[1],
  )[0]?.[0]

  const productSteps = journey.filter((step) => step.is_product_view)
  const imageSteps = journey.filter((step) => step.is_image_view)
  const categorizedStepCount = journey.filter(
    (step) =>
      step.is_search ||
      step.is_product_view ||
      step.is_supplier_view ||
      step.is_image_view ||
      step.is_landing ||
      step.is_enquiry ||
      step.is_buylead,
  ).length
  const uncategorizedActions = Math.max(0, summary.totalSteps - categorizedStepCount)

  const quickAuditSummary = {
    topKeyword: topKeyword || '-',
    topSignals: [
      `${summary.searches} search actions`,
      `${summary.productViews} product views`,
      `${summary.enquiriesRaised} enquiry actions`,
      `${summary.buyLeadsGenerated} buylead events`,
      `${summary.imageViews} image views`,
      `${summary.supplierViews} supplier interactions`,
      `${uncategorizedActions} uncategorized actions`,
    ],
    totalActivities: summary.totalSteps,
    enquiriesRaised: summary.enquiriesRaised,
    buyLeadsGenerated: summary.buyLeadsGenerated,
    productPagesSeen: productSteps
      .map((step) => step.page_url)
      .filter(Boolean)
      .slice(0, 4),
    imageSourcesSeen: imageSteps
      .map((step) => step.image_source_url)
      .filter(Boolean)
      .slice(0, 4),
    enquiryMoments: journey
      .filter((step) => step.is_enquiry)
      .slice(0, 6)
      .map((step) => `#${step.step} | ${step.time} | ${step.type}`),
    buyLeadMoments: journey
      .filter((step) => step.is_buylead)
      .slice(0, 6)
      .map((step) => `#${step.step} | ${step.time} | ${step.type}`),
  }

  const apiMeta = {
    code: normalized?.code ?? null,
    status: normalized?.status ?? '-',
    datetime: normalized?.datetime ?? '-',
    message: normalized?.message ?? '-',
  }

  return {
    glusr_id: String(dedupedLogs[0]?.glusr_id ?? '-'),
    gl_country: dedupedLogs[0]?.gl_country || '-',
    glb_city: dedupedLogs[0]?.glb_city || '-',
    sessions: sessionId,
    apiMeta,
    summary,
    funnel,
    insights,
    quickAuditSummary,
    journey,
  }
}

const getProductIdFromProductUrl = (productUrl) => {
  if (!productUrl) {
    return null
  }

  const match = String(productUrl).match(/\/proddetail\/([^/.]+)\.html/i)
  if (!match) {
    return null
  }

  const token = safeDecode(match[1])
  const idMatch = token.match(/(\d{6,})$/)
  return idMatch ? idMatch[1] : token
}

const toTitleCase = (value) => {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((token) =>
      token ? `${token.charAt(0).toUpperCase()}${token.slice(1)}` : token,
    )
    .join(' ')
}

const getActionTypeTag = (step) => {
  if (step.is_enquiry) {
    return 'Enquiry Intent'
  }
  if (step.search_action === 'filter_applied') {
    return 'Filter Applied'
  }
  if (step.is_mcat_page) {
    return 'Mcat Page'
  }
  if (step.is_product_view) {
    return 'PDP Page'
  }
  if (step.is_image_view) {
    return 'Image View'
  }
  if (step.is_search) {
    return 'Search'
  }
  if (step.is_supplier_view) {
    return 'Supplier View'
  }
  if (step.is_buylead) {
    return 'BuyLead'
  }
  if (step.is_landing) {
    return 'Landing'
  }
  return null
}

const getActionTypeTagClass = (step) => {
  if (step.is_enquiry) {
    return 'timeline-tag--enquiry'
  }
  if (step.search_action === 'filter_applied') {
    return 'timeline-tag--filter'
  }
  if (step.is_mcat_page) {
    return 'timeline-tag--mcat'
  }
  if (step.is_product_view) {
    return 'timeline-tag--pdp'
  }
  if (step.is_image_view) {
    return 'timeline-tag--image'
  }
  if (step.is_search) {
    return 'timeline-tag--search'
  }
  if (step.is_supplier_view) {
    return 'timeline-tag--supplier'
  }
  if (step.is_buylead) {
    return 'timeline-tag--buylead'
  }
  if (step.is_landing) {
    return 'timeline-tag--landing'
  }
  return 'timeline-tag--default'
}

const splitActivityVerbAndTarget = (rawType) => {
  const normalized = String(rawType || '').trim().replace(/\s+/g, ' ')
  if (!normalized) {
    return {
      verb: 'performed',
      target: 'an activity',
    }
  }

  const rules = [
    { pattern: /^show\s+/i, verb: 'opened' },
    { pattern: /^open(?:ed)?\s+/i, verb: 'opened' },
    { pattern: /^view(?:ed)?\s+/i, verb: 'viewed' },
    { pattern: /^search(?:ed)?\s+/i, verb: 'searched' },
    { pattern: /^load(?:ed)?\s+/i, verb: 'loaded' },
    { pattern: /^fetch(?:ed)?\s+/i, verb: 'fetched' },
    { pattern: /^display(?:ed)?\s+/i, verb: 'displayed' },
    { pattern: /^check(?:ed)?\s+/i, verb: 'checked' },
    { pattern: /^verify(?:ied)?\s+/i, verb: 'verified' },
    { pattern: /^add(?:ed)?\s+/i, verb: 'added' },
    { pattern: /^edit(?:ed)?\s+/i, verb: 'edited' },
    { pattern: /^update(?:d)?\s+/i, verb: 'updated' },
    { pattern: /^delete(?:d)?\s+/i, verb: 'deleted' },
    { pattern: /^save(?:d)?\s+/i, verb: 'saved' },
    { pattern: /^submit(?:ted)?\s+/i, verb: 'submitted' },
    { pattern: /^click(?:ed)?\s+/i, verb: 'clicked' },
    { pattern: /^mark(?:ed)?\s+/i, verb: 'marked' },
    { pattern: /^unmark(?:ed)?\s+/i, verb: 'unmarked' },
    { pattern: /^reply(?:ed)?\s+/i, verb: 'replied on' },
    { pattern: /^send(?:\s+|$)/i, verb: 'sent' },
    { pattern: /^post(?:ed)?\s+/i, verb: 'posted' },
  ]

  for (const rule of rules) {
    if (rule.pattern.test(normalized)) {
      const target = normalized.replace(rule.pattern, '').trim()
      return {
        verb: rule.verb,
        target: target || normalized,
      }
    }
  }

  if (/(page|screen|popup|iframe|dashboard|directory|listing|details?)\b/i.test(normalized)) {
    return {
      verb: 'opened',
      target: normalized,
    }
  }

  return {
    verb: 'performed',
    target: normalized,
  }
}

const buildGenericActionText = (step) => {
  const cityText = step.city && step.city !== '-' ? ` in ${step.city}` : ''
  const activity = splitActivityVerbAndTarget(step.type)
  const targetText = toTitleCase(activity.target)
  return `User ${activity.verb} ${targetText}${cityText}`
}

export {
  buildJourneyFromLogs,
  buildSearchUrl,
  getSessionPalette,
  getActionTypeTag,
  getActionTypeTagClass,
  toTitleCase,
  buildGenericActionText,
}
