import { fetchRawCslLogs } from '../server/utils/cslLogsFetcher.js'
import { transformCslLogs } from '../utils/cslTransformer.js'
import { getBehaviorAnalysisPrompt } from '../prompts/behaviorAnalysisPrompt.js'
import { generateLLMResponse } from '../services/llmService.js'

type InsightPayload = {
  summary: string
  intent: string
  keyPatterns: string[]
  dropOffPoints: string[]
  opportunities: string[]
  anomalies: string[]
}

const normalizeInsightsPayload = (value: unknown): InsightPayload => {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}

  const toText = (input: unknown): string => {
    if (typeof input === 'string') {
      return input.trim()
    }
    if (input === null || input === undefined) {
      return ''
    }
    return String(input).trim()
  }

  const toStringArray = (input: unknown): string[] => {
    if (!Array.isArray(input)) {
      return []
    }
    return input.map((item) => toText(item)).filter(Boolean)
  }

  return {
    summary: toText(source.summary),
    intent: toText(source.intent),
    keyPatterns: toStringArray(source.keyPatterns),
    dropOffPoints: toStringArray(source.dropOffPoints),
    opportunities: toStringArray(source.opportunities),
    anomalies: toStringArray(source.anomalies),
  }
}

const parseLlmInsightsOutput = (value: unknown): InsightPayload => {
  if (value && typeof value === 'object') {
    return normalizeInsightsPayload(value)
  }

  const raw = String(value ?? '').trim()
  if (!raw) {
    throw new Error('LLM response was empty.')
  }

  const parseJsonOrNull = (text: string): unknown | null => {
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }

  const direct = parseJsonOrNull(raw)
  if (direct && typeof direct === 'object') {
    return normalizeInsightsPayload(direct)
  }

  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fencedMatch?.[1]) {
    const fenced = parseJsonOrNull(fencedMatch[1].trim())
    if (fenced && typeof fenced === 'object') {
      return normalizeInsightsPayload(fenced)
    }
  }

  const firstBrace = raw.indexOf('{')
  const lastBrace = raw.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const extracted = parseJsonOrNull(raw.slice(firstBrace, lastBrace + 1))
    if (extracted && typeof extracted === 'object') {
      return normalizeInsightsPayload(extracted)
    }
  }

  throw new Error('LLM response was not valid JSON.')
}

const buildChatPrompt = (question: string): string => `You are an expert user behavior analyst working for IndiaMART.

Answer ONLY from the provided structured CSL JSON context.
Do NOT use general knowledge.
Do NOT hallucinate or invent events, motives, outcomes, products, timelines, or counts.
If the requested information is not present in the provided JSON context, return exactly:
Not found in user CSL data
Keep the response concise, relevant, and evidence-based.

User question:
${question}

Return a natural language answer suitable for a dashboard chat panel.`

export async function llmAnalyze(req: any, res: any): Promise<any> {
  try {
    const glid = String(req.body?.glid || req.body?.glId || '').trim()
    const startDate = String(req.body?.startDate || '').trim()
    const endDate = String(req.body?.endDate || '').trim()

    console.log('[LLM_ANALYZE] Request received')

    if (!glid || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'glid, startDate, and endDate are required.',
      })
    }

    const { rawLogs } = await fetchRawCslLogs({ glid, startDate, endDate })

    if (!Array.isArray(rawLogs) || rawLogs.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No CSL logs found for the selected inputs.',
      })
    }

    console.log('[LLM_ANALYZE] Raw CSL data fetched successfully')

    console.log('[LLM_ANALYZE] Running CSL transformer')
    const structuredData = transformCslLogs(rawLogs)
    console.log('[LLM_ANALYZE] Structured data generated successfully')

    const prompt = getBehaviorAnalysisPrompt()
    console.log('[LLM_ANALYZE] Calling LLM service')
    const llmOutput = await generateLLMResponse(structuredData, prompt)
    console.log('RAW LLM OUTPUT:', llmOutput)
    console.log('[LLM_ANALYZE] LLM response received successfully')

    const parsedInsights = parseLlmInsightsOutput(llmOutput)

    return res.json({
      success: true,
      data: parsedInsights,
      structuredData,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[LLM_ANALYZE] Failed: ${message}`)

    const status = Number((error as { status?: number })?.status) || 500
    return res.status(status).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to analyze CSL data.',
    })
  }
}

export async function llmChat(req: any, res: any): Promise<any> {
  try {
    const question = String(req.body?.question || '').trim()
    const context = req.body?.context

    if (!question) {
      return res.status(400).json({
        success: false,
        message: 'question is required.',
      })
    }

    if (!context || typeof context !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'structured context is required.',
      })
    }

    const prompt = buildChatPrompt(question)
    const llmOutput = await generateLLMResponse({ question, context }, prompt)

    return res.json({
      success: true,
      data: llmOutput,
    })
  } catch (error) {
    const status = Number((error as { status?: number })?.status) || 500
    return res.status(status).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to generate chat response.',
    })
  }
}
