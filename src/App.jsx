import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import ProductHoverPreview from './components/previews/ProductHoverPreview'
import SearchInlinePreview from './components/previews/SearchInlinePreview'
import EnquiryIntentCard from './components/previews/EnquiryIntentCard'
import CompanyInlinePreview from './components/previews/CompanyInlinePreview'
import DirectImagePreview from './components/previews/DirectImagePreview'
import LLMInsights from './components/LLMInsights'
import {
  buildGenericActionText,
  buildJourneyFromLogs,
  buildSearchUrl,
  getActionTypeTag,
  getActionTypeTagClass,
  getSessionPalette,
  toTitleCase,
} from './utils/journeyUtils'

const DATE_FILTER_ALL = 'ALL'
const ACTIVITY_FILTER_ALL = 'ALL'
const ACTIVITY_FILTER_ENQUIRY = 'ENQUIRY'
const ACTIVITY_FILTER_BUYLEAD = 'BUYLEAD'
const SESSION_FILTER_ALL = 'ALL'

const toDayKey = (timestampMs) => {
  if (!Number.isFinite(timestampMs)) {
    return null
  }

  const dateValue = new Date(timestampMs)
  const year = dateValue.getFullYear()
  const month = String(dateValue.getMonth() + 1).padStart(2, '0')
  const day = String(dateValue.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const formatDayLabel = (dayKey) => {
  const [yearText, monthText, dayText] = String(dayKey || '').split('-')
  const year = Number(yearText)
  const month = Number(monthText) - 1
  const day = Number(dayText)
  const parsed = new Date(year, month, day)

  if (Number.isNaN(parsed.getTime())) {
    return dayKey
  }

  const monthShort = parsed.toLocaleDateString('en-GB', {
    month: 'short',
  })

  return `${String(parsed.getDate()).padStart(2, '0')}/${monthShort}`
}

const getAvailableDates = (journeySteps) => {
  const uniqueDayKeys = new Set(
    journeySteps
      .map((step) => toDayKey(step.timestamp_ms))
      .filter(Boolean),
  )

  return Array.from(uniqueDayKeys)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
    .map((dayKey) => ({
      key: dayKey,
      label: formatDayLabel(dayKey),
    }))
}

function App() {
  const [formData, setFormData] = useState({
    glId: '',
    startDate: '',
    endDate: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [journeyData, setJourneyData] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [selectedSession, setSelectedSession] = useState(SESSION_FILTER_ALL)
  const [selectedDate, setSelectedDate] = useState(DATE_FILTER_ALL)
  const [activityFilter, setActivityFilter] = useState(ACTIVITY_FILTER_ALL)
  const [summaryType, setSummaryType] = useState('DATE')
  const [summaryHeight, setSummaryHeight] = useState(70)
  const [llmInsights, setLlmInsights] = useState(null)
  const [llmStructuredContext, setLlmStructuredContext] = useState(null)
  const [llmLoading, setLlmLoading] = useState(false)
  const [llmError, setLlmError] = useState('')
  const [showChat, setShowChat] = useState(true)
  const [leftWidth, setLeftWidth] = useState(() => {
    const saved = Number(localStorage.getItem('timelineLayoutWidth'))
    if (Number.isFinite(saved) && saved >= 20 && saved <= 80) {
      return saved
    }
    return 60
  })
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false)
  const layoutRef = useRef(null)
  const rightPanelRef = useRef(null)
  const llmPaneRef = useRef(null)

  useEffect(() => {
    localStorage.setItem('timelineLayoutWidth', String(leftWidth))
  }, [leftWidth])

  useEffect(() => {
    const llmPaneNode = llmPaneRef.current
    const parentNode = rightPanelRef.current

    if (!llmPaneNode || !parentNode) {
      return
    }

    let frameId = 0

    const computeVisibility = () => {
      const llmRect = llmPaneNode.getBoundingClientRect()
      const parentRect = parentNode.getBoundingClientRect()

      if (!llmRect.height || !parentRect.height) {
        return
      }

      const heightPercentage = (llmRect.height / parentRect.height) * 100
      setShowChat(heightPercentage >= 40)
    }

    const scheduleCompute = () => {
      if (frameId) {
        cancelAnimationFrame(frameId)
      }

      frameId = requestAnimationFrame(computeVisibility)
    }

    const observer = new ResizeObserver(() => {
      scheduleCompute()
    })

    observer.observe(llmPaneNode)
    observer.observe(parentNode)
    scheduleCompute()

    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId)
      }
      observer.disconnect()
    }
  }, [summaryHeight])

  const startResize = (event) => {
    event.preventDefault()

    const onMouseMove = (moveEvent) => {
      const container = layoutRef.current
      if (!container) {
        return
      }

      const rect = container.getBoundingClientRect()
      if (!rect.width) {
        return
      }

      let nextWidth = ((moveEvent.clientX - rect.left) / rect.width) * 100
      if (nextWidth < 20) {
        nextWidth = 20
      }
      if (nextWidth > 80) {
        nextWidth = 80
      }

      setLeftWidth(nextWidth)
    }

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  const startRightPanelResize = (event) => {
    event.preventDefault()

    const onMouseMove = (moveEvent) => {
      const container = rightPanelRef.current
      if (!container) {
        return
      }

      const rect = container.getBoundingClientRect()
      if (!rect.height) {
        return
      }

      let nextHeight = ((moveEvent.clientY - rect.top) / rect.height) * 100
      if (nextHeight < 10) {
        nextHeight = 10
      }
      if (nextHeight > 90) {
        nextHeight = 90
      }

      setSummaryHeight(nextHeight)
    }

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  const availableDates = useMemo(() => {
    if (!journeyData?.journey?.length) {
      return []
    }

    return getAvailableDates(journeyData.journey)
  }, [journeyData])

  useEffect(() => {
    if (selectedDate === DATE_FILTER_ALL) {
      return
    }

    const hasSelectedDate = availableDates.some((dateItem) => dateItem.key === selectedDate)
    if (!hasSelectedDate) {
      setSelectedDate(DATE_FILTER_ALL)
    }
  }, [availableDates, selectedDate])

  const filteredJourneySteps = useMemo(() => {
    if (!journeyData?.journey?.length) {
      return []
    }

    return journeyData.journey.filter((step) => {
      const matchesDate =
        selectedDate === DATE_FILTER_ALL || toDayKey(step.timestamp_ms) === selectedDate

      const matchesActivity =
        activityFilter === ACTIVITY_FILTER_ALL ||
        (activityFilter === ACTIVITY_FILTER_ENQUIRY && step.is_enquiry) ||
        (activityFilter === ACTIVITY_FILTER_BUYLEAD && (step.is_buylead || step.is_buylead_generated))

      return matchesDate && matchesActivity
    })
  }, [journeyData, selectedDate, activityFilter])

  const handleActivityFilterClick = (filterType) => {
    setActivityFilter((previous) =>
      previous === filterType ? ACTIVITY_FILTER_ALL : filterType,
    )
  }

  const sessionGroups = useMemo(() => {
    if (!filteredJourneySteps.length) {
      return []
    }

    const groupedSessions = filteredJourneySteps.reduce((groups, step) => {
      const previousGroup = groups[groups.length - 1]
      if (!previousGroup || previousGroup.session !== step.session) {
        groups.push({ session: step.session, steps: [step] })
      } else {
        previousGroup.steps.push(step)
      }
      return groups
    }, [])

    return groupedSessions.map((group, index) => ({
      ...group,
      displaySession:
        selectedDate === DATE_FILTER_ALL ? group.session : index + 1,
    }))
  }, [filteredJourneySteps, selectedDate])

  useEffect(() => {
    setSelectedSession(SESSION_FILTER_ALL)
  }, [selectedDate, activityFilter])

  const topBarMetrics = useMemo(() => {
    const fullJourneySteps = journeyData?.journey || []
    const totalActivities = fullJourneySteps.length
    const totalSessions = new Set(fullJourneySteps.map((step) => step.session)).size
    const enquiriesGenerated = fullJourneySteps.filter((step) => step.is_enquiry).length
    const buyleadsGenerated = fullJourneySteps.filter(
      (step) => step.is_buylead || step.is_buylead_generated,
    ).length

    return {
      totalSessions,
      totalActivities,
      enquiriesGenerated,
      buyleadsGenerated,
    }
  }, [journeyData])

  useEffect(() => {
    if (sessionGroups.length === 0) {
      setSelectedSession(SESSION_FILTER_ALL)
      return
    }

    if (selectedSession === SESSION_FILTER_ALL) {
      return
    }

    const selectedExists = sessionGroups.some(
      (group) => group.session === selectedSession,
    )
    if (!selectedExists) {
      setSelectedSession(SESSION_FILTER_ALL)
    }
  }, [sessionGroups, selectedSession])

  const visibleSessionGroups = useMemo(() => {
    if (selectedSession === SESSION_FILTER_ALL) {
      return sessionGroups
    }

    return sessionGroups.filter((group) => group.session === selectedSession)
  }, [sessionGroups, selectedSession])

  const visibleSteps = useMemo(() => {
    return visibleSessionGroups.flatMap((group) => group.steps)
  }, [visibleSessionGroups])

  const selectedSessionDisplay = useMemo(() => {
    if (selectedSession === SESSION_FILTER_ALL) {
      return null
    }

    return (
      sessionGroups.find((group) => group.session === selectedSession)?.displaySession ??
      selectedSession
    )
  }, [selectedSession, sessionGroups])

  const buildSummaryData = (steps, totalSessions, title) => {
    const searches = steps.filter((step) => step.is_search).length
    const productViews = steps.filter((step) => step.is_product_view).length
    const enquiriesGenerated = steps.filter((step) => step.is_enquiry).length
    const buyleadsGenerated = steps.filter(
      (step) => step.is_buylead || step.is_buylead_generated,
    ).length
    const imageViews = steps.filter((step) => step.is_image_view).length
    const supplierViews = steps.filter((step) => step.is_supplier_view).length

    const categorizedStepCount = steps.filter(
      (step) =>
        step.is_search ||
        step.is_product_view ||
        step.is_supplier_view ||
        step.is_image_view ||
        step.is_landing ||
        step.is_enquiry ||
        step.is_buylead ||
        step.is_buylead_generated,
    ).length
    const uncategorizedActions = Math.max(0, steps.length - categorizedStepCount)

    const topSignals = []
    if (searches > 0) {
      topSignals.push(`${searches} search actions`)
    }
    if (productViews > 0) {
      topSignals.push(`${productViews} product views`)
    }
    if (enquiriesGenerated > 0) {
      topSignals.push(`${enquiriesGenerated} enquiry actions`)
    }
    if (buyleadsGenerated > 0) {
      topSignals.push(`${buyleadsGenerated} buylead events`)
    }
    if (imageViews > 0) {
      topSignals.push(`${imageViews} image views`)
    }
    if (supplierViews > 0) {
      topSignals.push(`${supplierViews} supplier interactions`)
    }
    if (uncategorizedActions > 0) {
      topSignals.push(`${uncategorizedActions} uncategorized actions`)
    }

    const enquiryJourneyPoints = steps
      .filter((step) => step.is_enquiry)
      .slice(0, 8)
      .map((step) => {
        const productLabel = step.product || step.product_id || '-'
        const ctaLabel = step.enquiry_cta_name || step.enquiry_cta_type || '-'
        return {
          key: `${step.session}-${step.step}-${step.time}`,
          time: step.time,
          productLabel,
          ctaLabel,
        }
      })

    return {
      title,
      totalSessions,
      totalSteps: steps.length,
      enquiriesGenerated,
      buyleadsGenerated,
      topSignals,
      enquiryJourneyPoints,
    }
  }

  const dateSummaryData = useMemo(() => {
    return buildSummaryData(
      filteredJourneySteps,
      sessionGroups.length,
      selectedDate === DATE_FILTER_ALL
        ? 'Overall Summary (Selected Range)'
        : `Date: ${formatDayLabel(selectedDate)}`,
    )
  }, [filteredJourneySteps, selectedDate, sessionGroups])

  const sessionSummaryData = useMemo(() => {
    const isAllSessionsSelected = selectedSession === SESSION_FILTER_ALL
    return buildSummaryData(
      visibleSteps,
      isAllSessionsSelected
        ? sessionGroups.length
        : selectedSessionDisplay !== null
          ? 1
          : 0,
      isAllSessionsSelected
        ? 'All Sessions (Filtered)'
        : selectedSessionDisplay !== null
        ? `Session ${selectedSessionDisplay}`
        : 'No Session Selected',
    )
  }, [selectedSession, selectedSessionDisplay, sessionGroups, visibleSteps])

  const summaryData = summaryType === 'DATE' ? dateSummaryData : sessionSummaryData

  const resolveMcatName = (step) => {
    if (!step.is_product_view) {
      return null
    }

    return step.mcat_page_name || step.mcat_name || step.mcat_names || null
  }

  const resolveMcatId = (step) => {
    if (!step.is_product_view) {
      return null
    }

    return step.mcat_id || step.brd_mcat_id || null
  }

  const pickStructuredStep = (step) => ({
    step: step.step,
    session: step.session,
    time: step.time,
    type: step.type,
    activity_id: step.activity_id,
    classified_action: step.classified_action,
    city: step.city,
    search_city: step.search_city,
    keyword: step.keyword,
    search_action: step.search_action,
    search_filters: step.search_filters,
    mcat_name: resolveMcatName(step),
    mcat_id: resolveMcatId(step),
    mcat_page_name: step.mcat_page_name,
    product: step.product,
    product_id: step.product_id,
    product_url: step.product_url,
    company_url: step.company_url,
    page_url: step.page_url,
    request_path: step.request_path,
    image_view_city: step.image_view_city,
    image_source_url: step.image_source_url,
    image_product_url: step.image_product_url,
    service_type: step.service_type,
    service_url: step.service_url,
    page_refer: step.page_refer,
    is_search: step.is_search,
    is_product_view: step.is_product_view,
    is_supplier_view: step.is_supplier_view,
    is_image_view: step.is_image_view,
    is_landing: step.is_landing,
    is_enquiry: step.is_enquiry,
    is_buylead: step.is_buylead,
    is_best_price_intent: step.is_best_price_intent,
    enquiry_cta_name: step.enquiry_cta_name,
    enquiry_cta_type: step.enquiry_cta_type,
    enquiry_section: step.enquiry_section,
    enquiry_source: step.enquiry_source,
    is_buylead_generated: step.is_buylead_generated,
    buylead_source: step.buylead_source,
    buylead_group_size: step.buylead_group_size,
  })

  const downloadPayloadAsJson = (payload, formatName) => {
    const jsonText = JSON.stringify(payload, null, 2)
    const blob = new Blob([jsonText], { type: 'application/json' })
    const downloadUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const userId = journeyData?.glusr_id || formData.glId || 'user'
    link.href = downloadUrl
    link.download = `user-journey-${formatName}-${userId}-${Date.now()}.json`
    document.body.append(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(downloadUrl)
  }

  const buildCurrentSessionGroups = () => {
    return visibleSessionGroups.map((group) => ({
      session: group.session,
      steps_count: group.steps.length,
      steps: group.steps,
    }))
  }

  const fetchPdpMcatDetails = async (productUrl) => {
    const safeUrl = String(productUrl || '').trim()
    if (!safeUrl) {
      return null
    }

    try {
      const response = await fetch(
        `/api/product-preview?url=${encodeURIComponent(safeUrl)}`,
        {
          method: 'GET',
        },
      )

      if (!response.ok) {
        return null
      }

      const payload = await response.json()
      const mcatName = payload?.data?.breadcrumb?.mcat || null
      const mcatId = payload?.data?.breadcrumb?.mcatId || null
      if (!mcatName && !mcatId) {
        return null
      }

      return {
        mcatName,
        mcatId,
      }
    } catch {
      return null
    }
  }

  const enrichSessionGroupsWithPdpMcat = async (currentSessionGroups) => {
    const productUrls = Array.from(
      new Set(
        currentSessionGroups
          .flatMap((group) => group.steps)
          .filter((step) => step.is_product_view)
          .map((step) => step.product_url || step.page_url)
          .filter((urlValue) => /\/proddetail\//i.test(String(urlValue || ''))),
      ),
    )

    if (productUrls.length === 0) {
      return currentSessionGroups
    }

    const mcatByUrl = new Map()
    const mcatResults = await Promise.all(
      productUrls.map(async (urlValue) => {
        const mcatDetails = await fetchPdpMcatDetails(urlValue)
        return [urlValue, mcatDetails]
      }),
    )

    mcatResults.forEach(([urlValue, mcatDetails]) => {
      if (mcatDetails) {
        mcatByUrl.set(urlValue, mcatDetails)
      }
    })

    return currentSessionGroups.map((group) => ({
      ...group,
      steps: group.steps.map((step) => {
        if (!step.is_product_view) {
          return step
        }

        const stepUrl = step.product_url || step.page_url
        const mcatDetails = mcatByUrl.get(stepUrl)
        if (!mcatDetails) {
          return step
        }

        return {
          ...step,
          mcat_page_name: step.mcat_page_name || mcatDetails.mcatName,
          mcat_name: mcatDetails.mcatName || step.mcat_name,
          mcat_id: mcatDetails.mcatId || step.mcat_id,
        }
      }),
    }))
  }

  const buildImportantMinimalPayload = (currentSessionGroups) => {
    const importantSteps = currentSessionGroups.flatMap((group) => group.steps).filter(
      (step) => step.is_product_view || step.is_search || step.is_mcat_page,
    )

    return {
      user: {
        glusr_id: journeyData.glusr_id,
      },
      sessions: currentSessionGroups.map((group) => group.session),
      pdp_pages: importantSteps
        .filter((step) => step.is_product_view)
        .map((step) => ({
          pdp_page_url: step.product_url || step.page_url || null,
          pdp_title: step.product || step.title || null,
          pdp_mcat_name: resolveMcatName(step),
          pdp_mcat_id: resolveMcatId(step),
        })),
      search_pages: importantSteps
        .filter((step) => step.is_search)
        .map((step) => ({
          keyword: step.keyword || null,
          city: step.search_city || step.city || journeyData.glb_city || null,
          country: journeyData.gl_country || null,
        })),
      category_pages: importantSteps
        .filter((step) => step.is_mcat_page)
        .map((step) => ({
          mcat_name: resolveMcatName(step),
        })),
    }
  }

  const buildImportantFullPayload = (currentSessionGroups) => {
    const importantSteps = currentSessionGroups.flatMap((group) => group.steps).filter(
      (step) => step.is_product_view || step.is_search || step.is_mcat_page,
    )

    return {
      user: {
        glusr_id: journeyData.glusr_id,
        gl_country: journeyData.gl_country,
        glb_city: journeyData.glb_city,
      },
      sessions: currentSessionGroups.map((group) => group.session),
      pdp_pages: importantSteps
        .filter((step) => step.is_product_view)
        .map((step) => pickStructuredStep(step)),
      search_pages: importantSteps
        .filter((step) => step.is_search)
        .map((step) => pickStructuredStep(step)),
      category_pages: importantSteps
        .filter((step) => step.is_mcat_page)
        .map((step) => pickStructuredStep(step)),
    }
  }

  const handleDownloadJson = async (formatType) => {
    if (!journeyData) {
      return
    }

    const currentSessionGroups = await enrichSessionGroupsWithPdpMcat(
      buildCurrentSessionGroups(),
    )

    const fullPayload = {
      user: {
        glusr_id: journeyData.glusr_id,
        gl_country: journeyData.gl_country,
        glb_city: journeyData.glb_city,
      },
      total_sessions: currentSessionGroups.length,
      user_journey_sessions: currentSessionGroups.map((group) => ({
        session: group.session,
        steps_count: group.steps.length,
        steps: group.steps.map(pickStructuredStep),
      })),
    }

    if (formatType === 'full') {
      downloadPayloadAsJson(fullPayload, 'full-session')
    } else if (formatType === 'important-minimal') {
      downloadPayloadAsJson(
        buildImportantMinimalPayload(currentSessionGroups),
        'important-minimal',
      )
    } else if (formatType === 'important-full') {
      downloadPayloadAsJson(
        buildImportantFullPayload(currentSessionGroups),
        'important-full',
      )
    }

    setIsDownloadMenuOpen(false)
  }

  const handleChange = (event) => {
    const { name, value } = event.target
    setFormData((previous) => ({ ...previous, [name]: value }))
  }

  const handlePdpMcatResolved = (session, stepNumber, mcatDetails) => {
    const resolvedMcat = String(mcatDetails?.mcatName || '').trim()
    const resolvedMcatId = String(mcatDetails?.mcatId || '').trim()
    if (!resolvedMcat && !resolvedMcatId) {
      return
    }

    setJourneyData((previous) => {
      if (!previous?.journey?.length) {
        return previous
      }

      let hasChanged = false
      const updatedJourney = previous.journey.map((entry) => {
        if (entry.session !== session || entry.step !== stepNumber) {
          return entry
        }

        const sameName =
          !resolvedMcat ||
          entry.mcat_page_name === resolvedMcat ||
          entry.mcat_name === resolvedMcat
        const sameId = !resolvedMcatId || String(entry.mcat_id || '') === resolvedMcatId
        if (sameName && sameId) {
          return entry
        }

        hasChanged = true
        return {
          ...entry,
          mcat_page_name: entry.mcat_page_name || resolvedMcat || entry.mcat_page_name,
          mcat_name: resolvedMcat || entry.mcat_name,
          mcat_id: resolvedMcatId || entry.mcat_id,
        }
      })

      if (!hasChanged) {
        return previous
      }

      return {
        ...previous,
        journey: updatedJourney,
      }
    })
  }

  const triggerLLMAnalysis = async (request) => {
    setLlmLoading(true)
    setLlmError('')
    setLlmInsights(null)
    setLlmStructuredContext(null)

    console.log('Calling LLM API', request)

    try {
      const response = await fetch('/api/llm/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })

      const data = await response.json()
      console.log('LLM Response', data)

      if (!response.ok || !data?.success) {
        throw new Error(data?.message || 'Failed to load LLM insights.')
      }

      console.log('LLM Insights:', data?.data)
      setLlmInsights(data?.data ?? null)
      setLlmStructuredContext(data?.structuredData ?? null)
    } catch (error) {
      setLlmError(error instanceof Error ? error.message : 'Failed to load LLM insights.')
    } finally {
      setLlmLoading(false)
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const requestStartedAt = Date.now()

    try {
      setIsSubmitting(true)
      setErrorMessage('')

      const response = await fetch('/api/behavior', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          glId: formData.glId,
          startDate: formData.startDate,
          endDate: formData.endDate,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error('API request failed:', errorData)
        setErrorMessage(errorData?.message || 'Failed to fetch journey data.')
        return
      }

      const responseData = await response.json()
      console.log('GetCSLData request succeeded')

      const analysisPayload = {
        glid: formData.glId,
        startDate: formData.startDate,
        endDate: formData.endDate,
      }

      const transformed = buildJourneyFromLogs(responseData)

      if (!transformed) {
        setErrorMessage('No activity data found for the selected inputs.')
        return
      }

      setJourneyData(transformed)
      setSelectedDate(DATE_FILTER_ALL)
      setActivityFilter(ACTIVITY_FILTER_ALL)
      setSelectedSession(SESSION_FILTER_ALL)

      void triggerLLMAnalysis(analysisPayload)
    } catch (error) {
      console.error('API request failed:', error)
      setErrorMessage('Unable to load data. Please check server connectivity.')
    } finally {
      const elapsedTime = Date.now() - requestStartedAt
      const remainingTime = Math.max(0, 1000 - elapsedTime)
      if (remainingTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, remainingTime))
      }
      setIsSubmitting(false)
    }
  }

  return (
    <main className={`app-shell ${journeyData ? 'app-shell--results' : ''}`}>
      {!journeyData ? (
        <section className="landing-page">
          <section className="intro-panel">
            <p className="tagline">Behavior Intelligence Platform</p>
            <h1>Welcome to User Behavior Tracker</h1>
            <p className="intro-text">
              Transform raw CSL logs into a clear user journey. Investigate
              behavior patterns, understand friction points, and find likely
              reasons behind negative feedback.
            </p>
          </section>

          <section className="form-card" aria-label="Tracking filters">
            <h2>Start Your Analysis</h2>
            <p className="form-subtitle">
              Enter GL ID and date range to generate a clean timeline of user
              activity.
            </p>

            <form className="tracking-form" onSubmit={handleSubmit}>
              <div className="field-group">
                <label htmlFor="gl-id">User GL ID</label>
                <input
                  id="gl-id"
                  name="glId"
                  type="text"
                  placeholder="Enter User GL ID"
                  autoComplete="off"
                  value={formData.glId}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="date-grid">
                <div className="field-group">
                  <label htmlFor="start-date">Start Date</label>
                  <input
                    id="start-date"
                    name="startDate"
                    type="date"
                    value={formData.startDate}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="field-group">
                  <label htmlFor="end-date">End Date</label>
                  <input
                    id="end-date"
                    name="endDate"
                    type="date"
                    value={formData.endDate}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>

              <button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <span className="spinner"></span>
                    <span>Tracking...</span>
                  </>
                ) : (
                  'Track Behavior'
                )}
              </button>
            </form>

            {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
          </section>
        </section>
      ) : (
        <>
          <header className="results-navbar" aria-label="Active tracking filters">
            <div className="results-navbar-main">
              <form className="tracking-form tracking-form--inline" onSubmit={handleSubmit}>
                <div className="field-group field-group--compact">
                  <label htmlFor="results-gl-id">User GL ID</label>
                  <input
                    id="results-gl-id"
                    name="glId"
                    type="text"
                    autoComplete="off"
                    value={formData.glId}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="field-group field-group--compact">
                  <label htmlFor="results-start-date">Start Date</label>
                  <input
                    id="results-start-date"
                    name="startDate"
                    type="date"
                    value={formData.startDate}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="field-group field-group--compact">
                  <label htmlFor="results-end-date">End Date</label>
                  <input
                    id="results-end-date"
                    name="endDate"
                    type="date"
                    value={formData.endDate}
                    onChange={handleChange}
                    required
                  />
                </div>

                <button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <span className="spinner"></span>
                      <span>Tracking...</span>
                    </>
                  ) : (
                    'Track Behavior'
                  )}
                </button>
              </form>

              <div className="results-metrics" aria-label="Journey summary metrics">
          
                <span className="results-metric-pill">
                  <strong>{topBarMetrics.totalSessions}</strong> Sessions
                </span>
                <span className="results-metric-pill">
                  <strong>{topBarMetrics.totalActivities}</strong> Activities
                </span>
                <button
                  type="button"
                  className={`results-metric-pill results-metric-pill--filter ${
                    activityFilter === ACTIVITY_FILTER_ENQUIRY ? 'results-metric-pill--active' : ''
                  }`}
                  onClick={() => handleActivityFilterClick(ACTIVITY_FILTER_ENQUIRY)}
                  aria-pressed={activityFilter === ACTIVITY_FILTER_ENQUIRY}
                >
                  <strong>{topBarMetrics.enquiriesGenerated}</strong> Enquiry
                </button>
                <button
                  type="button"
                  className={`results-metric-pill results-metric-pill--filter ${
                    activityFilter === ACTIVITY_FILTER_BUYLEAD ? 'results-metric-pill--active' : ''
                  }`}
                  onClick={() => handleActivityFilterClick(ACTIVITY_FILTER_BUYLEAD)}
                  aria-pressed={activityFilter === ACTIVITY_FILTER_BUYLEAD}
                >
                  <strong>{topBarMetrics.buyleadsGenerated}</strong> Buylead
                </button>
              </div>
            </div>
            {errorMessage ? <p className="error-text error-text--inline">{errorMessage}</p> : null}
          </header>

          <section className="results-shell main-layout" ref={layoutRef}>
            <article
              className="panel timeline-panel timeline-section"
              style={{ width: `${leftWidth}%` }}
            >
              <div className="timeline-panel-header">
                <h3>Timeline View</h3>
                <div className="timeline-download-menu">
                  <button
                    type="button"
                    className="timeline-download-button"
                    onClick={() => setIsDownloadMenuOpen((previous) => !previous)}
                    aria-expanded={isDownloadMenuOpen}
                    aria-haspopup="true"
                  >
                    Download JSON
                  </button>
                  {isDownloadMenuOpen ? (
                    <div className="timeline-download-options" role="menu">
                      <button
                        type="button"
                        className="timeline-download-option"
                        onClick={() => handleDownloadJson('full')}
                      >
                        1. Full JSON (Current Session)
                      </button>
                      <button
                        type="button"
                        className="timeline-download-option"
                        onClick={() => handleDownloadJson('important-minimal')}
                      >
                        2. Important Activity JSON (Minimal Keys)
                      </button>
                      <button
                        type="button"
                        className="timeline-download-option"
                        onClick={() => handleDownloadJson('important-full')}
                      >
                        3. Important Activity JSON (All Keys)
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
              <p className="panel-subtitle">
                User: {journeyData.glusr_id} | {journeyData.glb_city},{' '}
                {journeyData.gl_country} | Steps: {filteredJourneySteps.length}
              </p>

              <div className="date-segment-switcher" aria-label="Date selector">
                <button
                  type="button"
                  className={`date-segment-button ${selectedDate === DATE_FILTER_ALL ? 'date-segment-button--active' : ''}`}
                  onClick={() => setSelectedDate(DATE_FILTER_ALL)}
                >
                  All
                </button>
                {availableDates.map((dateItem) => {
                  const isActive = selectedDate === dateItem.key
                  return (
                    <button
                      key={dateItem.key}
                      type="button"
                      className={`date-segment-button ${isActive ? 'date-segment-button--active' : ''}`}
                      onClick={() => setSelectedDate(dateItem.key)}
                    >
                      {dateItem.label}
                    </button>
                  )
                })}
              </div>

              <div className="session-switcher" aria-label="Session selector">
                <button
                  type="button"
                  className={`session-switcher-button ${selectedSession === SESSION_FILTER_ALL ? 'session-switcher-button--active' : ''}`}
                  onClick={() => setSelectedSession(SESSION_FILTER_ALL)}
                >
                  All
                </button>
                {sessionGroups.map((group) => {
                  const isActive = group.session === selectedSession
                  return (
                    <button
                      key={`session-tab-${group.session}`}
                      type="button"
                      className={`session-switcher-button ${isActive ? 'session-switcher-button--active' : ''}`}
                      onClick={() => setSelectedSession(group.session)}
                    >
                      Session {group.displaySession}
                    </button>
                  )
                })}
              </div>

              <div className="timeline-list">
                {visibleSessionGroups.length === 0 ? (
                  <p className="timeline-empty-state">No data for the selected filters.</p>
                ) : visibleSessionGroups.map((group) => {
                  const sessionPalette = getSessionPalette(group.session)

                  return (
                    <section
                      className="timeline-session-group"
                      key={`session-${group.session}`}
                    >
                      {group.steps.map((step, stepIndex) => {
                        const enquiryActionText = step.is_best_price_intent
                          ? step.product
                            ? step.city
                              ? `User requested best price for "${step.product}" in ${step.city}`
                              : `User requested best price for "${step.product}"`
                            : 'User requested best price through enquiry intent'
                          : step.product
                            ? step.city
                              ? `User generated enquiry for "${step.product}" in ${step.city}`
                              : `User generated enquiry for "${step.product}"`
                            : 'User generated an enquiry intent'
                        const mcatActionText = step.mcat_page_name
                          ? step.city
                            ? `User opened Mcat page (${toTitleCase(step.mcat_page_name)}) in ${step.city}`
                            : `User opened Mcat page (${toTitleCase(step.mcat_page_name)})`
                          : step.city
                            ? `User opened Mcat page in ${step.city}`
                            : 'User opened Mcat page'
                        const searchActionText = step.keyword
                          ? step.search_action === 'filter_applied'
                            ? `User applied filters on "${step.keyword}"${step.search_filters?.city ? ` in ${step.search_filters.city}` : ''}${step.search_filters?.price ? ` with price ${step.search_filters.price}` : ''}`
                            : step.search_city
                              ? `User searched "${step.keyword}" in ${step.search_city}`
                              : `User searched "${step.keyword}"`
                          : step.type || 'User performed a search'
                        const pdpActionText = 'User Saw PDP page'
                        const productActionName = step.product || null
                        const productActionText = productActionName
                          ? `User viewed "${productActionName}"`
                          : 'User viewed a product'
                        const imageActionText = productActionName
                          ? step.image_view_city
                            ? `User viewed "${productActionName}" in ${step.image_view_city}`
                            : `User viewed "${productActionName}"`
                          : 'User viewed a product'
                        const genericActionText = buildGenericActionText(step)
                        const supplierActionText = 'Open company page'
                        const requestPathValue = String(step.request_path || '').trim()
                        const imageSourceValue = String(step.image_source_url || '').trim()
                        const hasDirectImageExtension = (value) =>
                          /\.(avif|bmp|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/i.test(value)
                        const normalizeDirectImageUrl = (value) => {
                          const trimmed = String(value || '').trim()
                          if (!trimmed || !hasDirectImageExtension(trimmed)) {
                            return null
                          }

                          if (/^https?:\/\//i.test(trimmed)) {
                            return trimmed
                          }

                          const relativePath = trimmed.replace(/^\/+/, '')
                          if (!/^data\d+\//i.test(relativePath)) {
                            return null
                          }

                          return `https://d1qsk4aqkpwap4.cloudfront.net/${relativePath}`
                        }
                        const directImagePreviewUrl =
                          normalizeDirectImageUrl(requestPathValue) ||
                          normalizeDirectImageUrl(imageSourceValue)
                        const isProductRelated =
                          Boolean(step.product_id) || step.is_product_view || step.is_image_view
                        const shouldRenderProductPreview =
                          !directImagePreviewUrl &&
                          isProductRelated &&
                          Boolean(step.product_url || step.image_product_url)
                        const actionText = step.is_buylead_generated || step.is_buylead
                          ? 'BuyLead Generated'
                          : step.is_enquiry
                          ? enquiryActionText
                          : step.is_mcat_page
                            ? mcatActionText
                            : step.is_search
                              ? searchActionText
                              : step.is_supplier_view
                                ? supplierActionText
                                : step.is_product_view
                                  ? pdpActionText
                                  : step.is_image_view
                                    ? imageActionText
                                    : isProductRelated
                                      ? productActionText
                                      : genericActionText
                        const actionUrl = step.is_buylead_generated || step.is_buylead
                          ? step.product_url || step.page_url || step.service_url
                          : step.is_enquiry
                          ? step.product_url || step.page_url || step.service_url
                          : directImagePreviewUrl
                            ? directImagePreviewUrl
                          : step.is_search
                            ? buildSearchUrl(
                              step.request_path,
                              step.modid,
                              step.referer || '-',
                              step.log_domain || '-',
                            )
                            : step.is_supplier_view
                              ? step.company_url || step.page_url
                              : shouldRenderProductPreview
                                ? step.product_url || step.image_product_url
                                : step.page_url
                        const itemStyle = {
                          '--session-item-bg': sessionPalette.itemBg,
                          '--session-item-border': sessionPalette.itemBorder,
                        }

                        const actionTypeTag = step.is_enquiry
                          ? 'Enquiry Generated'
                          : getActionTypeTag(step)
                        const actionTypeTagClass = getActionTypeTagClass(step)

                        return (
                          <article
                            key={`${step.step}-${step.time}`}
                            className="timeline-item"
                            style={itemStyle}
                          >
                            <div className="timeline-content">
                              <div className="timeline-item-header">
                                <span className="timeline-step">#{stepIndex + 1}</span>
                                <p className="timeline-time timeline-time--top">{step.time}</p>
                              </div>
                              {actionUrl ? (
                                directImagePreviewUrl ? (
                                  <>
                                    <p className="timeline-action-link">
                                      <a href={actionUrl} target="_blank" rel="noreferrer">
                                        {actionText}
                                      </a>
                                    </p>
                                    <DirectImagePreview imageUrl={directImagePreviewUrl} />
                                  </>
                                ) : step.is_buylead_generated || step.is_buylead ? (
                                  <>
                                    <p className="timeline-action-link">
                                      <span className="timeline-status-dot" aria-hidden="true">🟢</span>{' '}
                                      <a href={actionUrl} target="_blank" rel="noreferrer">
                                        {actionText}
                                      </a>
                                    </p>
                                    {step.keyword ? (
                                      <p className="timeline-meta">Keyword: {step.keyword}</p>
                                    ) : null}
                                    {step.product_url ? (
                                      <ProductHoverPreview productUrl={step.product_url} />
                                    ) : null}
                                  </>
                                ) : step.is_enquiry ? (
                                  <>
                                    <p className="timeline-action-link">
                                      <a href={actionUrl} target="_blank" rel="noreferrer">
                                        {actionText}
                                      </a>
                                    </p>
                                    <EnquiryIntentCard step={step} />
                                  </>
                                ) : shouldRenderProductPreview ? (
                                  <>
                                    <p className="timeline-action-link">
                                      <a href={actionUrl} target="_blank" rel="noreferrer">
                                        {actionText}
                                      </a>
                                    </p>
                                    <ProductHoverPreview
                                      productUrl={actionUrl}
                                      onMcatResolved={(mcatName) =>
                                        handlePdpMcatResolved(
                                          step.session,
                                          step.step,
                                          mcatName,
                                        )
                                      }
                                    />
                                  </>
                                ) : step.is_supplier_view ? (
                                  <>
                                    <p className="timeline-action-link">
                                      <a href={actionUrl} target="_blank" rel="noreferrer">
                                        {actionText}
                                      </a>
                                    </p>
                                    <CompanyInlinePreview companyUrl={actionUrl} />
                                  </>
                                ) : step.is_search ? (
                                  <>
                                    <p className="timeline-action-link">
                                      <a href={actionUrl} target="_blank" rel="noreferrer">
                                        {actionText}
                                      </a>
                                    </p>
                                    <SearchInlinePreview searchUrl={actionUrl} />
                                  </>
                                ) : (
                                  <>
                                    <p className="timeline-action-link">
                                      <a href={actionUrl} target="_blank" rel="noreferrer">
                                        {actionText}
                                      </a>
                                    </p>
                                  </>
                                )
                              ) : (
                                <>
                                  <p className="timeline-action-text">{actionText}</p>
                                </>
                              )}
                              {step.keyword && !step.is_search && !(step.is_buylead_generated || step.is_buylead) ? (
                                <p className="timeline-meta">Keyword: {step.keyword}</p>
                              ) : null}
                              {step.product && !isProductRelated ? (
                                <p className="timeline-meta">Product: {step.product}</p>
                              ) : null}
                              {step.is_image_view && step.image_source_url ? (
                                <p className="timeline-meta">
                                  Image Source:{' '}
                                  <a
                                    href={step.image_source_url}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    Open Source
                                  </a>
                                </p>
                              ) : null}
                              {step.type === 'Supplier View' && step.service_type ? (
                                <p className="timeline-meta">
                                  Supplier Service: {step.service_type}
                                </p>
                              ) : null}
                              {step.type === 'Supplier View' && step.service_url ? (
                                <p className="timeline-meta">
                                  Service URL:{' '}
                                  <a href={step.service_url} target="_blank" rel="noreferrer">
                                    Open Service
                                  </a>
                                </p>
                              ) : null}
                            </div>
                            {actionTypeTag ? (
                              <span className={`timeline-tag ${actionTypeTagClass}`}>
                                {actionTypeTag}
                              </span>
                            ) : null}
                          </article>
                        )
                      })}
                    </section>
                  )
                })}
              </div>
            </article>

            <div
              className="resizer"
              onMouseDown={startResize}
              onDoubleClick={() => setLeftWidth(60)}
              role="separator"
              aria-label="Resize timeline and summary panels"
              aria-orientation="vertical"
            />

            <aside
              className="audit-panel summary-section"
              style={{ width: `${100 - leftWidth}%` }}
            >
              <div className="right-panel-split" ref={rightPanelRef}>
                <section className="summary-pane" style={{ height: `calc(${summaryHeight}% - 4px)` }}>
                  <h3>Quick Summary</h3>
                  <div className="summary-container">
                    <div className="summary-header">
                      <div className="summary-toggle" role="tablist" aria-label="Summary type">
                        <button
                          type="button"
                          role="tab"
                          aria-selected={summaryType === 'DATE'}
                          className={`summary-toggle-button ${summaryType === 'DATE' ? 'summary-toggle-button--active' : ''}`}
                          onClick={() => setSummaryType('DATE')}
                        >
                          Day Wise Summary
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={summaryType === 'SESSION'}
                          className={`summary-toggle-button ${summaryType === 'SESSION' ? 'summary-toggle-button--active' : ''}`}
                          onClick={() => setSummaryType('SESSION')}
                        >
                          Session Wise Summary
                        </button>
                      </div>

                      <p className="panel-subtitle summary-subtitle">{summaryData.title}</p>

                      <div className="summary-stats-row">
                        {summaryType === 'DATE' ? (
                          <span className="summary-stat-pill">Sessions: {summaryData.totalSessions}</span>
                        ) : null}
                        <span className="summary-stat-pill">Steps: {summaryData.totalSteps}</span>
                        <span className="summary-stat-pill">Enquiry: {summaryData.enquiriesGenerated}</span>
                        <span className="summary-stat-pill">Buylead: {summaryData.buyleadsGenerated}</span>
                      </div>
                    </div>

                    <div className="summary-body">
                      {summaryData.totalSteps === 0 ? (
                        <p className="audit-note">No activity found.</p>
                      ) : (
                        <>
                          <h4>Top Signals</h4>
                          {summaryData.topSignals.length > 0 ? (
                            <div className="summary-signal-tags">
                              {summaryData.topSignals.map((item) => (
                                <span key={item} className="summary-signal-tag">{item}</span>
                              ))}
                            </div>
                          ) : (
                            <p className="audit-note">No signal activity.</p>
                          )}

                          <h4>Enquiry Journey Points</h4>
                          {summaryData.enquiryJourneyPoints.length > 0 ? (
                            <ul className="audit-list summary-list-compact">
                              {summaryData.enquiryJourneyPoints.map((item) => (
                                <li key={item.key} className="summary-journey-item">
                                  <span className="summary-journey-time">{item.time}</span>
                                  <span className="summary-journey-detail">
                                    <span className="summary-journey-key">Product:</span>{' '}
                                    <span className="summary-journey-value">{item.productLabel}</span>
                                  </span>
                                  <span className="summary-journey-detail">
                                    <span className="summary-journey-key">CTA:</span>{' '}
                                    <span className="summary-journey-value">{item.ctaLabel}</span>
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="audit-note">No enquiry journey points.</p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </section>

                <div
                  className="right-panel-resizer"
                  onMouseDown={startRightPanelResize}
                  onDoubleClick={() => setSummaryHeight(70)}
                  role="separator"
                  aria-label="Resize quick summary and llm insights"
                  aria-orientation="horizontal"
                />

                <section
                  className="llm-pane"
                  ref={llmPaneRef}
                  style={{ height: `calc(${100 - summaryHeight}% - 4px)` }}
                >
                  <LLMInsights
                    insights={llmInsights}
                    structuredContext={llmStructuredContext}
                    loading={llmLoading}
                    error={llmError}
                    showChat={showChat}
                  />
                </section>
              </div>
            </aside>
          </section>
        </>
      )}
    </main>
  )
}

export default App

