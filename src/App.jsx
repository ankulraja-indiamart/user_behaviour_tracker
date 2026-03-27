import { useEffect, useMemo, useState } from 'react'
import './App.css'
import ProductHoverPreview from './components/previews/ProductHoverPreview'
import SearchInlinePreview from './components/previews/SearchInlinePreview'
import EnquiryIntentCard from './components/previews/EnquiryIntentCard'
import CompanyInlinePreview from './components/previews/CompanyInlinePreview'
import DirectImagePreview from './components/previews/DirectImagePreview'
import {
  buildGenericActionText,
  buildJourneyFromLogs,
  buildSearchUrl,
  getActionTypeTag,
  getActionTypeTagClass,
  getSessionPalette,
  toTitleCase,
} from './utils/journeyUtils'

function App() {
  const [formData, setFormData] = useState({
    glId: '',
    startDate: '',
    endDate: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [journeyData, setJourneyData] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [selectedSession, setSelectedSession] = useState(null)
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false)

  const sessionGroups = useMemo(() => {
    if (!journeyData?.journey?.length) {
      return []
    }

    return journeyData.journey.reduce((groups, step) => {
      const previousGroup = groups[groups.length - 1]
      if (!previousGroup || previousGroup.session !== step.session) {
        groups.push({ session: step.session, steps: [step] })
      } else {
        previousGroup.steps.push(step)
      }
      return groups
    }, [])
  }, [journeyData])

  useEffect(() => {
    if (sessionGroups.length === 0) {
      setSelectedSession(null)
      return
    }

    const selectedExists = sessionGroups.some(
      (group) => group.session === selectedSession,
    )
    if (!selectedExists) {
      setSelectedSession(sessionGroups[0].session)
    }
  }, [sessionGroups, selectedSession])

  const visibleSessionGroups = useMemo(() => {
    if (selectedSession === null) {
      return sessionGroups
    }

    return sessionGroups.filter((group) => group.session === selectedSession)
  }, [sessionGroups, selectedSession])

  const visibleSteps = useMemo(() => {
    return visibleSessionGroups.flatMap((group) => group.steps)
  }, [visibleSessionGroups])

  const sessionAuditSummary = useMemo(() => {
    const totalSteps = visibleSteps.length
    const searches = visibleSteps.filter((step) => step.is_search).length
    const productViews = visibleSteps.filter((step) => step.is_product_view).length
    const enquiriesRaised = visibleSteps.filter((step) => step.is_enquiry).length
    const buyLeadsGenerated = visibleSteps.filter((step) => step.is_buylead).length
    const imageViews = visibleSteps.filter((step) => step.is_image_view).length
    const supplierViews = visibleSteps.filter((step) => step.is_supplier_view).length

    const categorizedStepCount = visibleSteps.filter(
      (step) =>
        step.is_search ||
        step.is_product_view ||
        step.is_supplier_view ||
        step.is_image_view ||
        step.is_landing ||
        step.is_enquiry ||
        step.is_buylead,
    ).length

    const uncategorizedActions = Math.max(0, totalSteps - categorizedStepCount)

    const searchKeywords = visibleSteps
      .map((step) => step.keyword)
      .filter(Boolean)

    const keywordFrequency = searchKeywords.reduce((accumulator, keyword) => {
      const key = String(keyword).toLowerCase()
      accumulator[key] = (accumulator[key] || 0) + 1
      return accumulator
    }, {})

    const topKeyword = Object.entries(keywordFrequency).sort(
      (left, right) => right[1] - left[1],
    )[0]?.[0]

    const topSignals = []
    if (searches > 0) {
      topSignals.push(`${searches} search actions`)
    }
    if (productViews > 0) {
      topSignals.push(`${productViews} product views`)
    }
    if (enquiriesRaised > 0) {
      topSignals.push(`${enquiriesRaised} enquiry actions`)
    }
    if (buyLeadsGenerated > 0) {
      topSignals.push(`${buyLeadsGenerated} buylead events`)
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

    const enquiryMoments = visibleSteps
      .filter((step) => step.is_enquiry)
      .slice(0, 8)
      .map((step) => {
        const context = []

        if (step.product) {
          context.push(`Product: ${step.product}`)
        } else if (step.product_id) {
          context.push(`Product ID: ${step.product_id}`)
        }

        if (step.keyword) {
          context.push(`Query: ${step.keyword}`)
        }

        if (step.enquiry_cta_name) {
          context.push(`CTA: ${step.enquiry_cta_name}`)
        }

        return `#${step.step} | ${step.time}${context.length ? ` | ${context.join(' | ')}` : ''}`
      })

    const buyLeadMoments = visibleSteps
      .filter((step) => step.is_buylead)
      .slice(0, 8)
      .map((step) => `#${step.step} | ${step.time} | ${step.type}`)

    return {
      totalSteps,
      topKeyword: topKeyword || '-',
      topSignals,
      enquiriesRaised,
      buyLeadsGenerated,
      enquiryMoments,
      buyLeadMoments,
      productPagesSeen: visibleSteps
        .filter((step) => step.is_product_view)
        .map((step) => step.page_url)
        .filter(Boolean)
        .slice(0, 4),
      imageSourcesSeen: visibleSteps
        .filter((step) => step.is_image_view)
        .map((step) => step.image_source_url)
        .filter(Boolean)
        .slice(0, 4),
    }
  }, [visibleSteps])

  const resolveMcatName = (step) => {
    if (!step.is_product_view) {
      return null
    }

    return step.mcat_page_name || step.mcat_names || null
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

  const fetchPdpMcatName = async (productUrl) => {
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
      return payload?.data?.breadcrumb?.mcat || null
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
        const mcatValue = await fetchPdpMcatName(urlValue)
        return [urlValue, mcatValue]
      }),
    )

    mcatResults.forEach(([urlValue, mcatValue]) => {
      if (mcatValue) {
        mcatByUrl.set(urlValue, mcatValue)
      }
    })

    return currentSessionGroups.map((group) => ({
      ...group,
      steps: group.steps.map((step) => {
        if (!step.is_product_view) {
          return step
        }

        const stepUrl = step.product_url || step.page_url
        const mcatValue = mcatByUrl.get(stepUrl)
        if (!mcatValue) {
          return step
        }

        return {
          ...step,
          mcat_page_name: step.mcat_page_name || mcatValue,
          mcat_name: mcatValue,
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

  const handlePdpMcatResolved = (session, stepNumber, mcatName) => {
    const resolvedMcat = String(mcatName || '').trim()
    if (!resolvedMcat) {
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

        if (entry.mcat_page_name === resolvedMcat || entry.mcat_name === resolvedMcat) {
          return entry
        }

        hasChanged = true
        return {
          ...entry,
          mcat_page_name: entry.mcat_page_name || resolvedMcat,
          mcat_name: resolvedMcat,
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
      console.log('GetCSLData response:', responseData)
      const transformed = buildJourneyFromLogs(responseData)

      if (!transformed) {
        setErrorMessage('No activity data found for the selected inputs.')
        return
      }

      setJourneyData(transformed)
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
            <div className="results-navbar-title">
              <h2>User Journey Workspace</h2>
            </div>
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
            {errorMessage ? <p className="error-text error-text--inline">{errorMessage}</p> : null}
          </header>

          <section className="results-shell">
            <article className="panel timeline-panel">
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
                {journeyData.gl_country} | Steps: {journeyData.journey.length}
              </p>

              {sessionGroups.length > 0 ? (
                <div className="session-switcher" aria-label="Session selector">
                  {sessionGroups.map((group) => {
                    const isActive = group.session === selectedSession
                    return (
                      <button
                        key={`session-tab-${group.session}`}
                        type="button"
                        className={`session-switcher-button ${isActive ? 'session-switcher-button--active' : ''}`}
                        onClick={() => setSelectedSession(group.session)}
                      >
                        Session {group.session}
                      </button>
                    )
                  })}
                </div>
              ) : null}

              <div className="timeline-list">
                {visibleSessionGroups.map((group) => {
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

                        const actionTypeTag = getActionTypeTag(step)
                        const actionTypeTagClass = getActionTypeTagClass(step)

                        return (
                          <article
                            key={`${step.step}-${step.time}`}
                            className="timeline-item"
                            style={itemStyle}
                          >
                            <span className="timeline-step">#{stepIndex + 1}</span>
                            <div className="timeline-content">
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
                                  <p className="timeline-action-link">
                                    <a href={actionUrl} target="_blank" rel="noreferrer">
                                      {actionText}
                                    </a>
                                  </p>
                                )
                              ) : (
                                <p className="timeline-action-text">{actionText}</p>
                              )}
                              <p className="timeline-time">{step.time}</p>
                              {step.is_product_view && resolveMcatName(step) ? (
                                <p className="timeline-meta">mCat: {resolveMcatName(step)}</p>
                              ) : null}
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

            <aside className="panel audit-panel">
              <h3>Quick Summary</h3>
              <p className="panel-subtitle">
                {selectedSession !== null
                  ? `Showing summary for Session ${selectedSession}.`
                  : 'Short audit snapshot to understand behavior quality and drop-offs.'}
              </p>

              <div className="audit-meta-grid">
                <p>
                  <span>Session</span>
                  <strong>{selectedSession ?? '-'}</strong>
                </p>
                <p>
                  <span>Steps</span>
                  <strong>{sessionAuditSummary.totalSteps}</strong>
                </p>
                <p>
                  <span>Enquiry Raised</span>
                  <strong>{sessionAuditSummary.enquiriesRaised}</strong>
                </p>
                <p>
                  <span>BuyLead Generated</span>
                  <strong>{sessionAuditSummary.buyLeadsGenerated}</strong>
                </p>
              </div>

              <h4>Top Signals</h4>
              {sessionAuditSummary.topSignals.length > 0 ? (
                <ul className="audit-list">
                  {sessionAuditSummary.topSignals.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="audit-note">No signal activity in this session.</p>
              )}

              <h4>Top Keyword</h4>
              <p className="audit-highlight">{sessionAuditSummary.topKeyword}</p>

              {sessionAuditSummary.enquiryMoments.length > 0 ? (
                <>
                  <h4>Enquiry Journey Points</h4>
                  <ul className="audit-list">
                    {sessionAuditSummary.enquiryMoments.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </>
              ) : null}

              {sessionAuditSummary.buyLeadMoments.length > 0 ? (
                <>
                  <h4>BuyLead Journey Points</h4>
                  <ul className="audit-list">
                    {sessionAuditSummary.buyLeadMoments.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </>
              ) : null}

              {sessionAuditSummary.productPagesSeen.length > 0 ? (
                <>
                  <h4>Product Pages Seen</h4>
                  <ul className="audit-link-list">
                    {sessionAuditSummary.productPagesSeen.map((url) => (
                      <li key={url}>
                        <a href={url} target="_blank" rel="noreferrer">
                          {url}
                        </a>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              {sessionAuditSummary.imageSourcesSeen.length > 0 ? (
                <>
                  <h4>Image View Sources</h4>
                  <ul className="audit-link-list">
                    {sessionAuditSummary.imageSourcesSeen.map((url) => (
                      <li key={url}>
                        <a href={url} target="_blank" rel="noreferrer">
                          {url}
                        </a>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              <h4>Audit Note</h4>
              <p className="audit-note">
                {journeyData.insights[0] ||
                  journeyData.apiMeta.message ||
                  'No specific issue detected.'}
              </p>
            </aside>
          </section>
        </>
      )}
    </main>
  )
}

export default App

