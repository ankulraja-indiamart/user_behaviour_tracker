const DEFAULT_LLM_MODEL = process.env.LLM_MODEL?.trim() || 'google/gemini-2.5-flash'
const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 45000)

type LlmConfig = {
  baseUrl: string
  apiKey: string
}

type LlmMessage = {
  role: 'system' | 'user'
  content: string
}

type LlmResponsePayload = {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '')

const getLlmConfig = (): LlmConfig => {
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

const parseLlmResponse = (responseData: LlmResponsePayload): string => {
  const content = responseData?.choices?.[0]?.message?.content

  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('LLM response did not contain message content.')
  }

  return content
}

export async function generateLLMResponse(data: unknown, prompt: string): Promise<string> {
  const { baseUrl, apiKey } = getLlmConfig()

  if (!prompt || !prompt.trim()) {
    throw new Error('Prompt is required.')
  }

  const messages: LlmMessage[] = [
    {
      role: 'system',
      content: prompt.trim(),
    },
    {
      role: 'user',
      content: JSON.stringify(data ?? {}),
    },
  ]

  const requestPayload = {
    model: DEFAULT_LLM_MODEL,
    messages,
    temperature: 0.3,
  }

  console.log('[LLM_SERVICE] Request payload:', JSON.stringify(requestPayload))

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

    const responseData = (await response.json().catch(() => null)) as LlmResponsePayload | null

    console.log('[LLM_SERVICE] Response status:', response.status)
    console.log('[LLM_SERVICE] Response body:', JSON.stringify(responseData))

    if (!response.ok) {
      const errorMessage =
        (responseData as { error?: { message?: string } } | null)?.error?.message ||
        `LLM request failed with status ${response.status}`
      const error = new Error(errorMessage) as Error & { status?: number; response?: unknown }
      error.status = response.status
      error.response = responseData
      throw error
    }

    if (!responseData) {
      throw new Error('LLM response was empty or invalid JSON.')
    }

    return parseLlmResponse(responseData)
  } catch (error) {
    const typedError = error as Error & { status?: number; response?: unknown; name?: string }
    const isAbortError = typedError?.name === 'AbortError'
    const message = isAbortError
      ? `LLM request timed out after ${LLM_TIMEOUT_MS}ms.`
      : typedError?.message || 'LLM request failed.'

    console.error('[LLM_SERVICE] Request failed', {
      message,
      response: typedError?.response || null,
    })

    const wrappedError = new Error(message) as Error & { status?: number; response?: unknown }
    wrappedError.status = typedError?.status || (isAbortError ? 504 : 500)
    wrappedError.response = typedError?.response || null
    throw wrappedError
  } finally {
    clearTimeout(timeoutHandle)
  }
}
