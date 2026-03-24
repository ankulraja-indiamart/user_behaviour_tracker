import { useEffect, useRef, useState } from 'react'

function CompanyInlinePreview({ companyUrl }) {
  if (!companyUrl) {
    return null
  }

  const [previewState, setPreviewState] = useState('idle')
  const [previewData, setPreviewData] = useState(null)
  const [previewError, setPreviewError] = useState('')
  const [resolvedCompanyUrl, setResolvedCompanyUrl] = useState(companyUrl)
  const activeAbortController = useRef(null)

  useEffect(() => {
    setPreviewState('idle')
    setPreviewData(null)
    setPreviewError('')
    setResolvedCompanyUrl(companyUrl)
    if (activeAbortController.current) {
      activeAbortController.current.abort()
      activeAbortController.current = null
    }
  }, [companyUrl])

  const loadPreview = async () => {
    if (!companyUrl || previewState === 'loading' || previewState === 'ready') {
      return
    }

    const controller = new AbortController()
    activeAbortController.current = controller
    setPreviewState('loading')
    setPreviewError('')

    try {
      const response = await fetch(
        `/api/company-preview?url=${encodeURIComponent(companyUrl)}`,
        {
          method: 'GET',
          signal: controller.signal,
        },
      )

      const payload = await response.json()
      if (!response.ok || !payload?.data) {
        setPreviewState('error')
        setPreviewError(payload?.message || 'Company page preview is not available.')
        return
      }

      setPreviewData(payload.data)
      setResolvedCompanyUrl(payload.url || companyUrl)
      setPreviewState('ready')
    } catch (error) {
      if (error?.name === 'AbortError') {
        return
      }

      setPreviewState('error')
      setPreviewError('Could not load company page preview right now.')
    } finally {
      activeAbortController.current = null
    }
  }

  useEffect(() => {
    loadPreview()
  }, [companyUrl])

  return (
    <section className="company-preview-inline" aria-live="polite">
      <header className="company-preview-inline-header">
        <span className="company-preview-badge">User View Company Page</span>
      </header>

      {previewState === 'loading' || previewState === 'idle' ? (
        <span className="company-preview-loading">
          <span className="spinner"></span>
          <span>Loading company page...</span>
        </span>
      ) : null}

      {previewState === 'ready' && previewData ? (
        <div className="company-preview-card">
          <h4 className="company-preview-title">{previewData.companyName || previewData.title}</h4>
          {previewData.description ? (
            <p className="company-preview-description">{previewData.description}</p>
          ) : null}
          <a
            href={resolvedCompanyUrl || companyUrl}
            target="_blank"
            rel="noreferrer"
            className="company-preview-open"
          >
            Open company page
          </a>
        </div>
      ) : null}

      {previewState === 'error' ? (
        <span className="company-preview-error">
          {previewError}
          <a
            href={resolvedCompanyUrl || companyUrl}
            target="_blank"
            rel="noreferrer"
            className="company-preview-open"
          >
            Open company page
          </a>
        </span>
      ) : null}
    </section>
  )
}

export default CompanyInlinePreview
