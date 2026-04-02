const DEFAULT_LLM_MODEL = process.env.LLM_MODEL?.trim() || 'google/gemini-2.5-flash'
const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 45000)

const normalizeBaseUrl = (value) => value.replace(/\/+$/, '')

const getLlmConfig = () => {
  const baseUrl = process.env.OPENAI_BASE_URL?.trim()
  const apiKey = process.env.OPENAI_API_KEY?.trim()

  if (!baseUrl) {
    throw new Error('OPENAI_BASE_URL is not configured.')
  }

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured.')
  }

  return {
    baseUrl: normalizeBaseUrl(baseUrl),
    apiKey,
  }
}

const parseLlmResponse = (responseData) => {
  const content = responseData?.choices?.[0]?.message?.content

  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('LLM response did not contain message content.')
  }

  return content
}

export async function generateLLMResponse(data, prompt) {
  const { baseUrl, apiKey } = getLlmConfig()

  if (!prompt || !prompt.trim()) {
    throw new Error('Prompt is required.')
  }

  const requestPayload = {
    model: DEFAULT_LLM_MODEL,
    messages: [
      {
        role: 'system',
        content: prompt.trim(),
      },
      {
        role: 'user',
        content: JSON.stringify(data ?? {}),
      },
    ],
    temperature: 0.3,
  }

  console.log('[LLM_SERVICE] Request started')

  const abortController = new AbortController()
  const timeoutHandle = setTimeout(() => abortController.abort(), LLM_TIMEOUT_MS)

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestPayload),
      signal: abortController.signal,
    })

    const responseData = await response.json().catch(() => null)

    console.log(`[LLM_SERVICE] Request completed with status ${response.status}`)

    if (!response.ok) {
      const errorMessage =
        responseData?.error?.message || `LLM request failed with status ${response.status}`
      const error = new Error(errorMessage)
      error.status = response.status
      error.response = responseData
      throw error
    }

    if (!responseData) {
      throw new Error('LLM response was empty or invalid JSON.')
    }

    return parseLlmResponse(responseData)
  } catch (error) {
    const isAbortError = error?.name === 'AbortError'
    const message = isAbortError
      ? `LLM request timed out after ${LLM_TIMEOUT_MS}ms.`
      : error?.message || 'LLM request failed.'

    console.error(`[LLM_SERVICE] Request failed: ${message}`)

    const wrappedError = new Error(message)
    wrappedError.status = error?.status || (isAbortError ? 504 : 500)
    wrappedError.response = error?.response || null
    throw wrappedError
  } finally {
    clearTimeout(timeoutHandle)
  }
}
