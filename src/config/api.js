const DEFAULT_LOCAL_API_URL = 'http://localhost:5000'

const rawEnvBaseUrl =
  import.meta.env.VITE_API_URL ||
  import.meta.env.REACT_APP_API_URL ||
  ''

const normalizeBaseUrl = (value) => String(value || '').trim().replace(/\/+$/, '')

const resolvedBaseUrl = normalizeBaseUrl(rawEnvBaseUrl)

export const API_BASE_URL = resolvedBaseUrl || DEFAULT_LOCAL_API_URL
export const IS_API_BASE_URL_FALLBACK = !resolvedBaseUrl

if (IS_API_BASE_URL_FALLBACK) {
  console.warn(
    '[API_CONFIG] Missing VITE_API_URL/REACT_APP_API_URL. Falling back to http://localhost:5000.',
  )
}

export const buildApiUrl = (path) => {
  const safePath = String(path || '')

  if (/^https?:\/\//i.test(safePath)) {
    return safePath
  }

  const normalizedPath = safePath.startsWith('/') ? safePath : `/${safePath}`
  return `${API_BASE_URL}${normalizedPath}`
}
