import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'

type InsightPayload = {
  summary: string
  intent: string
  keyPatterns: string[]
  dropOffPoints: string[]
  opportunities: string[]
  anomalies: string[]
}

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

type ConversationTurn = {
  question: string
  answer: string
}

type ConversationMemory = {
  summary: string
  recent_turns: ConversationTurn[]
}

type SalientEvent = {
  session_id: number | null
  step: number | null
  timestamp: string
  type: string
  title: string
  page: string
  product_name: string
  action: string
}

type OptimizedContext = {
  journey_summary: string
  user_intent: string
  drop_reason: string
  salient_events: SalientEvent[]
  conversation_memory: ConversationMemory
}

type LLMInsightsProps = {
  insights: unknown
  structuredContext: unknown
  loading: boolean
  error: string
  showChat: boolean
}

const EMPTY_INSIGHTS: InsightPayload = {
  summary: '',
  intent: '',
  keyPatterns: [],
  dropOffPoints: [],
  opportunities: [],
  anomalies: [],
}

const MAX_SALIENT_EVENTS = 5
const MAX_RECENT_TURNS = 3
const MAX_MEMORY_SUMMARY_CHARS = 500
const MAX_MEMORY_TEXT_CHARS = 220

const toText = (value: unknown) => {
  if (typeof value === 'string') {
    return value
  }

  if (value === null || value === undefined) {
    return ''
  }

  return String(value)
}

const toStringArray = (value: unknown) => {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map((item) => toText(item).trim()).filter(Boolean)
}

const parseMaybeJson = (value: unknown) => {
  if (typeof value !== 'string') {
    return value
  }

  const raw = value.trim()
  if (!raw) {
    return value
  }

  const parseJsonOrNull = (text: string) => {
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }

  const direct = parseJsonOrNull(raw)
  if (direct) {
    return direct
  }

  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fencedMatch?.[1]) {
    const fenced = parseJsonOrNull(fencedMatch[1].trim())
    if (fenced) {
      return fenced
    }
  }

  const firstBrace = raw.indexOf('{')
  const lastBrace = raw.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const extracted = parseJsonOrNull(raw.slice(firstBrace, lastBrace + 1))
    if (extracted) {
      return extracted
    }
  }

  try {
    return JSON.parse(raw)
  } catch {
    return value
  }
}

const normalizeText = (value: unknown, maxLength = MAX_MEMORY_TEXT_CHARS) => {
  const text = toText(value).replace(/\s+/g, ' ').trim()

  if (!text) {
    return ''
  }

  if (text.length <= maxLength) {
    return text
  }

  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

const normalizeStructuredContext = (value: unknown) => {
  const parsed = parseMaybeJson(value)
  return parsed && typeof parsed === 'object' ? parsed : null
}

const getUserStats = (structuredContext: Record<string, unknown> | null) => {
  const user = structuredContext && typeof structuredContext.user === 'object'
    ? (structuredContext.user as Record<string, unknown>)
    : null

  const totalSessions = Number(user?.totalSessions ?? 0)
  const totalActivities = Number(user?.totalActivities ?? 0)

  return {
    totalSessions: Number.isFinite(totalSessions) ? totalSessions : 0,
    totalActivities: Number.isFinite(totalActivities) ? totalActivities : 0,
  }
}

const deriveJourneySummary = (
  structuredContext: Record<string, unknown> | null,
  insights: InsightPayload,
) => {
  if (insights.summary) {
    return normalizeText(insights.summary, 320)
  }

  const stats = getUserStats(structuredContext)
  const summaryParts: string[] = []

  if (stats.totalSessions > 0) {
    summaryParts.push(`${stats.totalSessions} sessions`)
  }

  if (stats.totalActivities > 0) {
    summaryParts.push(`${stats.totalActivities} activities`)
  }

  if (summaryParts.length > 0) {
    return normalizeText(`Journey covers ${summaryParts.join(' and ')}.`, 320)
  }

  return 'Journey context is available for follow-up questions.'
}

const deriveUserIntent = (insights: InsightPayload) => {
  if (insights.intent) {
    return normalizeText(insights.intent, 240)
  }

  return 'User intent is not explicitly stated in the available summary.'
}

const deriveDropReason = (insights: InsightPayload) => {
  if (insights.dropOffPoints.length > 0) {
    return normalizeText(insights.dropOffPoints.slice(0, 2).join('; '), 240)
  }

  return 'No clear drop reason was identified in the current summary.'
}

const buildSalientEvents = (structuredContext: Record<string, unknown> | null) => {
  const sessions = Array.isArray(structuredContext?.sessions)
    ? (structuredContext?.sessions as Array<Record<string, unknown>>)
    : []

  const flattenedEvents: SalientEvent[] = []

  sessions.forEach((session) => {
    const activities = Array.isArray(session?.activities)
      ? (session.activities as Array<Record<string, unknown>>)
      : []

    activities.forEach((activity) => {
      const activityMetadata =
        activity?.metadata && typeof activity.metadata === 'object'
          ? (activity.metadata as Record<string, unknown>)
          : null

      const sessionIdValue = session?.sessionId ?? activityMetadata?.sessionId ?? null

      flattenedEvents.push({
        session_id: Number.isFinite(Number(sessionIdValue)) ? Number(sessionIdValue) : null,
        step: Number.isFinite(Number(activity?.step)) ? Number(activity?.step) : null,
        timestamp: normalizeText(activity?.timestamp, 80),
        type: normalizeText(activity?.type, 40),
        title: normalizeText(activity?.action || activity?.productName || activity?.page || '-', 140),
        page: normalizeText(activity?.page, 120),
        product_name: normalizeText(activity?.productName, 120),
        action: normalizeText(activity?.action || '-', 120),
      })
    })
  })

  const importantTypes = new Set(['BUYLEAD', 'ENQUIRY', 'PRODUCT_VIEW'])
  const prioritized = [
    ...flattenedEvents.filter((event) => importantTypes.has(String(event.type || '').toUpperCase())),
    ...flattenedEvents.filter((event) => !importantTypes.has(String(event.type || '').toUpperCase())),
  ]

  const seen = new Set<string>()
  const result: SalientEvent[] = []

  for (const event of prioritized) {
    const signature = [
      event.session_id ?? '-',
      event.step ?? '-',
      event.timestamp,
      event.type,
      event.title,
      event.page,
    ].join('|')

    if (seen.has(signature)) {
      continue
    }

    seen.add(signature)
    result.push(event)

    if (result.length >= MAX_SALIENT_EVENTS) {
      break
    }
  }

  return result
}

const buildOptimizedContext = (
  structuredContext: Record<string, unknown> | null,
  insights: InsightPayload,
): OptimizedContext | null => {
  if (!structuredContext) {
    return null
  }

  return {
    journey_summary: deriveJourneySummary(structuredContext, insights),
    user_intent: deriveUserIntent(insights),
    drop_reason: deriveDropReason(insights),
    salient_events: buildSalientEvents(structuredContext),
    conversation_memory: {
      summary: '',
      recent_turns: [],
    },
  }
}

const summarizeTurn = (turn: ConversationTurn) =>
  `Q: ${normalizeText(turn.question, 140)} | A: ${normalizeText(turn.answer, 180)}`

const trimMemorySummary = (summary: string) => {
  if (summary.length <= MAX_MEMORY_SUMMARY_CHARS) {
    return summary
  }

  return summary.slice(summary.length - MAX_MEMORY_SUMMARY_CHARS)
}

const updateConversationMemory = (
  memory: ConversationMemory,
  question: string,
  answer: string,
): ConversationMemory => {
  const nextTurns = [...memory.recent_turns, { question, answer }]

  if (nextTurns.length <= MAX_RECENT_TURNS) {
    return {
      summary: trimMemorySummary(memory.summary),
      recent_turns: nextTurns,
    }
  }

  const overflowTurns = nextTurns.slice(0, nextTurns.length - MAX_RECENT_TURNS)
  const compressedOverflow = overflowTurns.map((turn) => summarizeTurn(turn)).join(' || ')
  const combinedSummary = [memory.summary, compressedOverflow].filter(Boolean).join(' || ')

  return {
    summary: trimMemorySummary(combinedSummary),
    recent_turns: nextTurns.slice(-MAX_RECENT_TURNS),
  }
}

const normalizeInsights = (value: unknown): InsightPayload => {
  const parsed = parseMaybeJson(value)

  if (!parsed || typeof parsed !== 'object') {
    return EMPTY_INSIGHTS
  }

  const source = parsed as Partial<InsightPayload>

  return {
    summary: toText(source.summary).trim(),
    intent: toText(source.intent).trim(),
    keyPatterns: toStringArray(source.keyPatterns),
    dropOffPoints: toStringArray(source.dropOffPoints),
    opportunities: toStringArray(source.opportunities),
    anomalies: toStringArray(source.anomalies),
  }
}

const toChatText = (value: unknown) => {
  if (typeof value === 'string') {
    return value.trim()
  }

  if (value === null || value === undefined) {
    return ''
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }

  return String(value)
}

const nowLabel = () =>
  new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })

function LLMInsights({ insights, structuredContext, loading, error, showChat }: LLMInsightsProps) {
  const normalizedInsights = useMemo(() => normalizeInsights(insights), [insights])
  const normalizedStructuredContext = useMemo(
    () => normalizeStructuredContext(structuredContext),
    [structuredContext],
  )
  const hasInsights =
    Boolean(normalizedInsights.summary) ||
    Boolean(normalizedInsights.intent) ||
    normalizedInsights.keyPatterns.length > 0 ||
    normalizedInsights.dropOffPoints.length > 0 ||
    normalizedInsights.opportunities.length > 0 ||
    normalizedInsights.anomalies.length > 0

  const initialInsightsMessage = useMemo(() => {
    if (!hasInsights) {
      return ''
    }

    const lines: string[] = []

    if (normalizedInsights.summary) {
      lines.push('Summary:')
      lines.push(normalizedInsights.summary)
      lines.push('')
    }

    if (normalizedInsights.intent) {
      lines.push('Intent:')
      lines.push(normalizedInsights.intent)
      lines.push('')
    }

    if (normalizedInsights.keyPatterns.length > 0) {
      lines.push('Key Patterns:')
      normalizedInsights.keyPatterns.forEach((item, index) => {
        lines.push(`${index + 1}. ${item}`)
      })
      lines.push('')
    }

    if (normalizedInsights.dropOffPoints.length > 0) {
      lines.push('Drop-off Points:')
      normalizedInsights.dropOffPoints.forEach((item, index) => {
        lines.push(`${index + 1}. ${item}`)
      })
      lines.push('')
    }

    if (normalizedInsights.opportunities.length > 0) {
      lines.push('Opportunities:')
      normalizedInsights.opportunities.forEach((item, index) => {
        lines.push(`${index + 1}. ${item}`)
      })
      lines.push('')
    }

    if (normalizedInsights.anomalies.length > 0) {
      lines.push('Anomalies:')
      normalizedInsights.anomalies.forEach((item, index) => {
        lines.push(`${index + 1}. ${item}`)
      })
      lines.push('')
    }

    return lines.join('\n').trim()
  }, [hasInsights, normalizedInsights])

  const optimizedContext = useMemo(
    () => buildOptimizedContext(normalizedStructuredContext, normalizedInsights),
    [normalizedStructuredContext, normalizedInsights],
  )

  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatError, setChatError] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatContext, setChatContext] = useState<OptimizedContext | null>(null)
  const historyRef = useRef<HTMLDivElement | null>(null)
  const typingTimerRef = useRef<number | null>(null)
  const insightsSignatureRef = useRef('')
  const chatContextRef = useRef<OptimizedContext | null>(null)

  useEffect(() => {
    return () => {
      if (typingTimerRef.current !== null) {
        window.clearInterval(typingTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const node = historyRef.current
    if (!node) {
      return
    }

    node.scrollTo({
      top: node.scrollHeight,
      behavior: 'smooth',
    })
  }, [chatMessages, chatLoading])

  useEffect(() => {
    if (!loading) {
      return
    }

    insightsSignatureRef.current = ''
    chatContextRef.current = null
    setChatContext(null)
    setChatMessages([])
    setChatError('')
  }, [loading])

  useEffect(() => {
    if (loading || error || !optimizedContext) {
      chatContextRef.current = null
      setChatContext(null)
      return
    }

    chatContextRef.current = optimizedContext
    setChatContext(optimizedContext)
  }, [error, loading, optimizedContext])

  useEffect(() => {
    const signature = JSON.stringify(normalizedInsights)

    if (loading) {
      return
    }

    if (error || !hasInsights || !initialInsightsMessage) {
      return
    }

    if (insightsSignatureRef.current === signature) {
      return
    }

    insightsSignatureRef.current = signature
    setChatError('')
    setChatMessages([
      {
        id: `assistant-initial-${Date.now()}`,
        role: 'assistant',
        content: initialInsightsMessage,
        timestamp: nowLabel(),
      },
    ])
  }, [error, hasInsights, initialInsightsMessage, loading, normalizedInsights])

  const appendAssistantWithTyping = (text: string) => {
    const assistantId = `assistant-${Date.now()}-${Math.random().toString(36).slice(2)}`

    setChatMessages((previous) => [
      ...previous,
      {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: nowLabel(),
      },
    ])

    if (!text) {
      return
    }

    let index = 0

    if (typingTimerRef.current !== null) {
      window.clearInterval(typingTimerRef.current)
    }

    typingTimerRef.current = window.setInterval(() => {
      index += 1

      setChatMessages((previous) =>
        previous.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: text.slice(0, index),
              }
            : message,
        ),
      )

      if (index >= text.length && typingTimerRef.current !== null) {
        window.clearInterval(typingTimerRef.current)
        typingTimerRef.current = null
      }
    }, 18)
  }

  const handleChatSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const question = chatInput.trim()
    const currentContext = chatContextRef.current

    if (!question || chatLoading || !currentContext) {
      return
    }

    setChatError('')
    setChatLoading(true)

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      role: 'user',
      content: question,
      timestamp: nowLabel(),
    }

    setChatMessages((previous) => [...previous, userMessage])
    setChatInput('')

    try {
      const response = await fetch('/api/llm/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question,
          context: currentContext,
        }),
      })

      const payload = await response.json()

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || 'Unable to get AI chat response.')
      }

      const assistantText = toChatText(payload?.data) || 'No response returned.'
      const nextMemory = updateConversationMemory(
        currentContext.conversation_memory,
        question,
        assistantText,
      )
      const nextContext = {
        ...currentContext,
        conversation_memory: nextMemory,
      }

      chatContextRef.current = nextContext
      setChatContext(nextContext)
      appendAssistantWithTyping(assistantText)
    } catch (chatRequestError) {
      const errorText =
        chatRequestError instanceof Error
          ? chatRequestError.message
          : 'Unable to get AI chat response.'
      setChatError(errorText)
    } finally {
      setChatLoading(false)
    }
  }

  const canChat = Boolean(chatContext) && !loading

  return (
    <div className="llm-insights-shell">
      <div className="llm-insights-header-row">
        <div>
          <h3 className="llm-insights-title">LLM Insights</h3>
          <p className="llm-insights-subtitle">
            AI analysis generated from the latest CSL journey search.
          </p>
        </div>
      </div>

      {showChat ? (
      <section className="llm-chat-section">
        <div className="llm-chat-header">
          <h4>Chat</h4>
          <span className="llm-chat-hint">Ask follow-up questions on this CSL journey.</span>
        </div>

        <div className="llm-chat-history" ref={historyRef}>
          {loading ? (
            <div className="llm-empty-state llm-empty-state--chat">AI is preparing initial analysis...</div>
          ) : error ? (
            <div className="llm-empty-state llm-empty-state--error">{error}</div>
          ) : chatMessages.length === 0 ? (
            <div className="llm-empty-state llm-empty-state--chat">
              {canChat
                ? 'Ask a question to start a conversation with AI.'
                : 'Chat will be enabled after insights are ready.'}
            </div>
          ) : (
            chatMessages.map((message) => (
              <div
                key={message.id}
                className={`llm-chat-message-row llm-chat-message-row--${message.role}`}
              >
                <article className={`llm-chat-message llm-chat-message--${message.role}`}>
                  <div className="llm-chat-message-meta">
                    <span>{message.role === 'user' ? 'You' : 'AI'}</span>
                    <span>{message.timestamp}</span>
                  </div>
                  <div className="llm-chat-message-body">
                    {message.content
                      .split(/\n{2,}/)
                      .map((block) => block.trim())
                      .filter(Boolean)
                      .map((block, index) => (
                        <p key={`${message.id}-block-${index}`} className="llm-chat-message-text">
                          {block}
                        </p>
                      ))}
                  </div>
                </article>
              </div>
            ))
          )}

          {chatLoading ? (
            <div className="llm-chat-message-row llm-chat-message-row--assistant">
              <article className="llm-chat-message llm-chat-message--assistant llm-chat-message--loading">
                <div className="llm-chat-message-meta">
                  <span>AI</span>
                  <span>{nowLabel()}</span>
                </div>
                <p className="llm-chat-message-text llm-chat-typing">
                  AI is analyzing
                  <span className="llm-chat-dots">
                    <span>.</span>
                    <span>.</span>
                    <span>.</span>
                  </span>
                </p>
              </article>
            </div>
          ) : null}
        </div>

        <form className="llm-chat-form" onSubmit={handleChatSubmit}>
          <input
            type="text"
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
            placeholder={canChat ? 'Ask a follow-up question...' : 'Run analysis first'}
            disabled={!canChat || chatLoading}
          />
          <button type="submit" disabled={!canChat || chatLoading || !chatInput.trim()}>
            Send
          </button>
        </form>

        {chatError ? <p className="llm-chat-error">{chatError}</p> : null}
      </section>
      ) : (
      <div className="llm-chat-hidden-hint">Expand panel to enable chat</div>
      )}
    </div>
  )
}

export default LLMInsights
