const formatDateForApi = (dateValue) => String(dateValue).replaceAll('-', '')
const CSL_FETCH_TIMEOUT_MS = Number(process.env.CSL_FETCH_TIMEOUT_MS || 30000)

const isValidDateInput = (dateValue) => /^\d{4}-\d{2}-\d{2}$/.test(String(dateValue || ''))

const fetchJsonOrText = async (response) => {
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    return response.json()
  }

  const rawText = await response.text()
  try {
    return JSON.parse(rawText)
  } catch {
    return rawText
  }
}

const extractRawCslLogs = (payload) => {
  const activitySource = payload?.activity ?? payload?.data?.activity ?? payload?.logs ?? payload?.data ?? payload

  if (Array.isArray(activitySource)) {
    return activitySource.filter((entry) => entry && typeof entry === 'object')
  }

  if (activitySource && typeof activitySource === 'object') {
    return Object.values(activitySource)
      .flat()
      .filter((entry) => entry && typeof entry === 'object')
  }

  return []
}

export async function fetchRawCslLogs({ glid, startDate, endDate }) {
  const apiToken = process.env.GLACTIVITY_AK
  const baseUrl = process.env.GLACTIVITY_BASE_URL

  if (!apiToken || !baseUrl) {
    throw new Error('Server environment is missing CSL API configuration.')
  }

  if (!glid || !startDate || !endDate) {
    throw new Error('glid, startDate, and endDate are required.')
  }

  if (!isValidDateInput(startDate) || !isValidDateInput(endDate)) {
    throw new Error('Dates must be in YYYY-MM-DD format.')
  }

  const queryParams = new URLSearchParams({
    AK: apiToken,
    flag: '2',
    glusrId: String(glid),
    starttime: formatDateForApi(startDate),
    endtime: formatDateForApi(endDate),
  })

  const targetUrl = `${baseUrl}?${queryParams.toString()}`
  console.log('[CSL_FETCH] External API request started')

  const abortController = new AbortController()
  const timeoutHandle = setTimeout(() => abortController.abort(), CSL_FETCH_TIMEOUT_MS)

  let externalResponse

  try {
    externalResponse = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json, text/plain, */*',
      },
      signal: abortController.signal,
    })
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error(
        `CSL API request timed out after ${CSL_FETCH_TIMEOUT_MS}ms.`,
      )
      timeoutError.status = 504
      throw timeoutError
    }
    throw error
  } finally {
    clearTimeout(timeoutHandle)
  }

  const responsePayload = await fetchJsonOrText(externalResponse)

  if (!externalResponse.ok) {
    const errorMessage =
      (responsePayload && typeof responsePayload === 'object' && responsePayload.message) ||
      'External API returned an error.'

    const error = new Error(String(errorMessage))
    error.status = externalResponse.status
    error.payload = responsePayload
    throw error
  }

  console.log('[CSL_FETCH] External API request succeeded')

  return {
    payload: responsePayload,
    rawLogs: extractRawCslLogs(responsePayload),
  }
}
