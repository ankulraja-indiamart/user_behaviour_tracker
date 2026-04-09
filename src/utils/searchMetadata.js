const QUERY_PARAM_KEYS = ['ss', 'q', 'keyword']
const CITY_PARAM_KEYS = ['cq', 'city']
const CITY_TAG_KEYS = new Set(['cq', 'city', 'cty', 'glbct', 'ipct', 'prefct'])

const decodeSafe = (value) => {
  try {
    return decodeURIComponent(String(value || '').replace(/\+/g, ' '))
  } catch {
    return String(value || '')
  }
}

const sanitizeText = (value) => {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

const isMeaningfulCity = (value) => {
  const normalized = sanitizeText(value)
  if (!normalized || normalized.length < 2 || normalized.length > 40) {
    return false
  }

  if (!/[a-z]/i.test(normalized)) {
    return false
  }

  // Reject noisy coded values like RC2, N0, G3.
  if (/[0-9]/.test(normalized) && !/\s/.test(normalized)) {
    return false
  }

  return true
}

const toTitleCase = (value) => {
  return sanitizeText(value)
    .toLowerCase()
    .replace(/(^|\s|-)([a-z])/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`)
}

const getFirstNonEmpty = (values) => {
  for (const value of values) {
    const normalized = sanitizeText(value)
    if (normalized) {
      return normalized
    }
  }

  return ''
}

const extractCityFromTags = (tagsRaw) => {
  const decodedTags = decodeSafe(tagsRaw)
  if (!decodedTags) {
    return ''
  }

  const parts = decodedTags
    .split(/[|,;]+/)
    .map((part) => sanitizeText(part))
    .filter(Boolean)

  for (const part of parts) {
    const keyValueMatch = part.match(/^([^:=]+)[:=](.+)$/)
    if (!keyValueMatch) {
      continue
    }

    const key = sanitizeText(keyValueMatch[1]).toLowerCase()
    const value = sanitizeText(keyValueMatch[2])

    if (CITY_TAG_KEYS.has(key) && isMeaningfulCity(value)) {
      return toTitleCase(value)
    }
  }

  return ''
}

export const parseSearchMetadata = ({ url, query, city, tags } = {}) => {
  let paramQuery = ''
  let paramCity = ''
  let minPrice = ''
  let maxPrice = ''
  let tagCity = ''

  try {
    const parsed = new URL(String(url || ''))
    const params = parsed.searchParams

    paramQuery = getFirstNonEmpty(QUERY_PARAM_KEYS.map((key) => decodeSafe(params.get(key))))
    paramCity = getFirstNonEmpty(CITY_PARAM_KEYS.map((key) => decodeSafe(params.get(key))))
    minPrice = sanitizeText(params.get('minprice'))
    maxPrice = sanitizeText(params.get('maxprice'))
    tagCity = extractCityFromTags(tags || params.get('tags'))
  } catch {
    tagCity = extractCityFromTags(tags)
  }

  const normalizedQuery = getFirstNonEmpty([query, paramQuery])
  const normalizedCity = getFirstNonEmpty([city, paramCity, tagCity])
  const priceRange = minPrice || maxPrice ? `${minPrice || '-'} to ${maxPrice || '-'}` : ''

  return {
    query: normalizedQuery,
    city: isMeaningfulCity(normalizedCity) ? toTitleCase(normalizedCity) : '',
    priceRange,
  }
}
