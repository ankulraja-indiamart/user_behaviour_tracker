const SESSION_GAP_MS = 30 * 60 * 1000

type RawCslLog = Record<string, unknown>

type NormalizedActivityType = 'ENQUIRY' | 'BUYLEAD' | 'PAGE_VIEW' | 'PRODUCT_VIEW'

type StructuredActivity = {
  step: number
  timestamp: string
  type: NormalizedActivityType
  page: string
  productName?: string
  category?: string
  action?: string
  metadata?: Record<string, unknown>
}

type StructuredSession = {
  sessionId: number
  date: string
  startTime: string
  endTime: string
  totalSteps: number
  activities: StructuredActivity[]
}

type StructuredInsight = {
  enquiryCount: number
  buyleadCount: number
  topCategories: Array<{ name: string; count: number }>
  topProducts: Array<{ name: string; count: number }>
}

type StructuredCslPayload = {
  user: {
    glid: string
    totalSessions: number
    totalActivities: number
  }
  sessions: StructuredSession[]
  insights: StructuredInsight
}

type ClassifiedActivity = {
  type: NormalizedActivityType
  page: string
  productName?: string
  category?: string
  action?: string
}

const safeString = (value: unknown, fallback = '-') => {
  const text = String(value ?? '').trim()
  return text || fallback
}

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

const parseDateValue = (value: unknown) => {
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

const formatDate = (date: Date) =>
  date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

const formatTime = (date: Date) =>
  date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })

const toPageName = (log: RawCslLog) => {
  const requestPath = safeString(log.request_path || log.request_url || log.page_url || '')
  const pageUrl = safeString(log.page_url || log.company_url || log.product_url || '')
  const raw = requestPath !== '-' ? requestPath : pageUrl
  if (!raw || raw === '-') {
    return 'Unknown page'
  }

  try {
    const parsed = new URL(raw, 'https://www.indiamart.com')
    const path = parsed.pathname.toLowerCase()

    if (path.includes('/proddetail/')) {
      const productMatch = path.match(/\/proddetail\/([^/]+)\.html/i)
      const slug = productMatch?.[1] ? safeDecode(productMatch[1]) : 'Product'
      return slug.replace(/-\d+$/, '').replace(/-/g, ' ').trim() || 'Product'
    }

    if (path.includes('/impcat/')) {
      const mcatMatch = path.match(/\/impcat\/([^/?#]+?)(?:\.html)?$/i)
      const slug = mcatMatch?.[1] ? safeDecode(mcatMatch[1]) : 'Category'
      return slug.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Category'
    }

    return `${parsed.hostname}${parsed.pathname}`.replace(/\/+$/, '')
  } catch {
    return raw
  }
}

const extractProductName = (log: RawCslLog) => {
  const candidates = [
    log.product,
    log.product_name,
    log.s_prod_name,
    log.intent_product_name,
    log.intent_product_name,
  ]

  for (const candidate of candidates) {
    const value = safeString(candidate, '')
    if (value) {
      return value
    }
  }

  const pageName = toPageName(log)
  return pageName === 'Unknown page' ? undefined : pageName
}

const extractCategory = (log: RawCslLog) => {
  const candidates = [
    log.mcat_page_name,
    log.mcat_names,
    log.category,
    log.page_category,
    log.service_type,
  ]

  for (const candidate of candidates) {
    const value = safeString(candidate, '')
    if (value) {
      return value
    }
  }

  const requestPath = safeString(log.request_path || log.request_url || '')
  const match = requestPath.match(/\/impcat\/([^/?#]+?)(?:\.html)?$/i)
  if (!match?.[1]) {
    return undefined
  }

  return safeDecode(match[1]).replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim() || undefined
}

const normalizeActivity = (log: RawCslLog): ClassifiedActivity => {
  const activityId = Number(log.fk_activity_id)
  const typeText = safeString(log.type || log.fk_display_title || '').toLowerCase()
  const requestPath = safeString(log.request_path || log.request_url || '')
  const page = toPageName(log)
  const productName = extractProductName(log)
  const category = extractCategory(log)
  const cta = safeString(log.enquiry_cta_name || log.enquiry_cta_type || log.ctaType || '', '')

  const isBuylead =
    Boolean(log.is_buylead || log.is_buylead_generated) ||
    [4400, 4403, 4406, 4409, 4656, 4729].includes(activityId) ||
    typeText.includes('buylead') ||
    typeText.includes('buy lead')

  const isEnquiry =
    !isBuylead &&
    (Boolean(log.is_enquiry || log.is_enquiry_intent) ||
      [507, 531, 533, 753, 754, 929, 996, 1489, 4269, 4656, 4729].includes(activityId) ||
      typeText.includes('enquiry') ||
      typeText.includes('intent generation'))

  const isProductView =
    Boolean(log.is_product_view) ||
    [438, 4383, 4481, 4657].includes(activityId) ||
    typeText.includes('product view') ||
    typeText.includes('product detail')

  const normalizedType: NormalizedActivityType = isBuylead
    ? 'BUYLEAD'
    : isEnquiry
      ? 'ENQUIRY'
      : isProductView
        ? 'PRODUCT_VIEW'
        : 'PAGE_VIEW'

  return {
    type: normalizedType,
    page,
    productName,
    category,
    action:
      cta ||
      (normalizedType === 'ENQUIRY'
        ? 'Enquiry'
        : normalizedType === 'BUYLEAD'
          ? 'Buylead'
          : normalizedType === 'PRODUCT_VIEW'
            ? 'Open product'
            : 'Page visit'),
  }
}

const normalizeStepTimestamp = (log: RawCslLog) => {
  const parsed = parseDateValue(log.datevalue || log.timestamp || log.time)
  if (!parsed) {
    return {
      date: safeString(log.date || log.timestamp || '-', '-'),
      timestamp: safeString(log.datevalue || log.timestamp || log.time || '-', '-'),
      parsed: null,
    }
  }

  return {
    date: formatDate(parsed),
    timestamp: `${formatDate(parsed)} ${formatTime(parsed)}`,
    parsed,
  }
}

const buildTopList = (counts: Map<string, number>) =>
  [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }))

const ensureSessions = (logs: RawCslLog[]) => {
  const orderedLogs = [...logs].sort((left, right) => {
    const leftDate = parseDateValue(left.datevalue || left.timestamp || left.time)?.getTime() ?? 0
    const rightDate = parseDateValue(right.datevalue || right.timestamp || right.time)?.getTime() ?? 0
    return leftDate - rightDate
  })

  const sessions: Array<{ logs: RawCslLog[]; sessionId: number; start: Date | null; end: Date | null }> = []
  let currentSession: { logs: RawCslLog[]; sessionId: number; start: Date | null; end: Date | null } | null = null
  let previousTimestamp: number | null = null
  let sessionId = 1

  for (const log of orderedLogs) {
    const parsed = parseDateValue(log.datevalue || log.timestamp || log.time)
    const timestampMs = parsed?.getTime() ?? null

    if (!currentSession) {
      currentSession = { logs: [], sessionId, start: parsed, end: parsed }
      sessions.push(currentSession)
    } else if (
      previousTimestamp !== null &&
      timestampMs !== null &&
      timestampMs - previousTimestamp > SESSION_GAP_MS
    ) {
      sessionId += 1
      currentSession = { logs: [], sessionId, start: parsed, end: parsed }
      sessions.push(currentSession)
    }

    currentSession.logs.push(log)
    if (parsed) {
      currentSession.start = currentSession.start ?? parsed
      currentSession.end = parsed
      previousTimestamp = timestampMs
    }
  }

  return sessions
}

export function transformCslLogs(rawLogs: RawCslLog[]): StructuredCslPayload {
  const safeLogs = Array.isArray(rawLogs) ? rawLogs : []
  const sessions = ensureSessions(safeLogs)
  const totalActivities = safeLogs.length
  const glid = safeString(safeLogs[0]?.glusr_id || safeLogs[0]?.glid || safeLogs[0]?.glusrId || '-', '-')

  const categoryCounts = new Map<string, number>()
  const productCounts = new Map<string, number>()
  let enquiryCount = 0
  let buyleadCount = 0

  const structuredSessions: StructuredSession[] = sessions.map((session, index) => {
    const activities: StructuredActivity[] = session.logs.map((log, stepIndex) => {
      const timestampInfo = normalizeStepTimestamp(log)
      const normalized = normalizeActivity(log)

      if (normalized.category) {
        categoryCounts.set(normalized.category, (categoryCounts.get(normalized.category) || 0) + 1)
      }

      if (normalized.productName) {
        productCounts.set(normalized.productName, (productCounts.get(normalized.productName) || 0) + 1)
      }

      if (normalized.type === 'ENQUIRY') {
        enquiryCount += 1
      }

      if (normalized.type === 'BUYLEAD') {
        buyleadCount += 1
      }

      return {
        step: stepIndex + 1,
        timestamp: timestampInfo.timestamp,
        type: normalized.type,
        page: normalized.page,
        productName: normalized.productName,
        category: normalized.category,
        action: normalized.action,
        metadata: {
          glid,
          sessionId: session.sessionId,
          rawActivityId: log.fk_activity_id ?? null,
          requestUrl: log.request_url ?? null,
          referer: log.referer ?? null,
          pageUrl: log.page_url ?? null,
          productId: log.product_disp_id ?? log.modref_id ?? null,
          ctaType: log.enquiry_cta_type ?? log.ctaType ?? null,
          ctaName: log.enquiry_cta_name ?? null,
          imageSourceUrl: log.image_source_url ?? null,
        },
      }
    })

    const firstTimestamp = session.start ? formatTime(session.start) : safeString(session.logs[0]?.datevalue || session.logs[0]?.timestamp || session.logs[0]?.time || '-', '-')
    const lastTimestamp = session.end ? formatTime(session.end) : safeString(session.logs[session.logs.length - 1]?.datevalue || session.logs[session.logs.length - 1]?.timestamp || session.logs[session.logs.length - 1]?.time || '-', '-')

    return {
      sessionId: index + 1,
      date: session.start ? formatDate(session.start) : safeString(session.logs[0]?.date || '-', '-'),
      startTime: firstTimestamp,
      endTime: lastTimestamp,
      totalSteps: activities.length,
      activities,
    }
  })

  return {
    user: {
      glid,
      totalSessions: structuredSessions.length,
      totalActivities,
    },
    sessions: structuredSessions,
    insights: {
      enquiryCount,
      buyleadCount,
      topCategories: buildTopList(categoryCounts),
      topProducts: buildTopList(productCounts),
    },
  }
}
