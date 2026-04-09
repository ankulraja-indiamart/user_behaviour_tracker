import { useEffect, useRef, useState } from 'react'
import { parseSearchMetadata } from '../../utils/searchMetadata'
import { apiFetch } from '../../services/apiClient'

function SearchInlinePreview({ searchUrl }) {
  if (!searchUrl) {
    return null
  }

  const [previewState, setPreviewState] = useState('idle')
  const [previewData, setPreviewData] = useState(null)
  const [previewError, setPreviewError] = useState('')
  const [resolvedSearchUrl, setResolvedSearchUrl] = useState(searchUrl)
  const activeAbortController = useRef(null)
  const searchMetadata = parseSearchMetadata({
    url: resolvedSearchUrl || searchUrl,
    query: previewData?.query,
    city: previewData?.city,
  })

  useEffect(() => {
    setPreviewState('idle')
    setPreviewData(null)
    setPreviewError('')
    setResolvedSearchUrl(searchUrl)
    if (activeAbortController.current) {
      activeAbortController.current.abort()
      activeAbortController.current = null
    }
  }, [searchUrl])

  const loadPreview = async () => {
    if (!searchUrl || previewState === 'loading' || previewState === 'ready') {
      return
    }

    const controller = new AbortController()
    activeAbortController.current = controller
    setPreviewState('loading')
    setPreviewError('')

    try {
      const response = await apiFetch(
        `/api/search-preview?url=${encodeURIComponent(searchUrl)}`,
        {
          method: 'GET',
          signal: controller.signal,
        },
      )

      const payload = await response.json()
      if (!response.ok || !payload?.data) {
        setPreviewState('error')
        setPreviewError(payload?.message || 'Search preview is not available.')
        return
      }

      setPreviewData(payload.data)
      setResolvedSearchUrl(payload.url || searchUrl)
      setPreviewState('ready')
    } catch (error) {
      if (error?.name === 'AbortError') {
        return
      }

      setPreviewState('error')
      setPreviewError('Could not load search page preview right now.')
    } finally {
      activeAbortController.current = null
    }
  }

  useEffect(() => {
    loadPreview()
  }, [searchUrl])

  return (
    <section className="search-preview-inline" aria-live="polite">
      {searchMetadata.query ? (
        <p className="search-preview-query">
          {searchMetadata.city ? `${searchMetadata.query} in ${searchMetadata.city}` : searchMetadata.query}
        </p>
      ) : null}

      {previewState === 'loading' || previewState === 'idle' ? (
        <span className="search-preview-loading">
          <span className="spinner"></span>
          <span>Loading search page...</span>
        </span>
      ) : null}

      {previewState === 'ready' && previewData ? (
        <div className="search-preview-card">
          <h4 className="search-preview-title">{previewData.title}</h4>
          {previewData.resultCount ? (
            <p className="search-preview-count">{previewData.resultCount} results found</p>
          ) : null}
          {searchMetadata.city ? (
            <p className="search-preview-description">City: {searchMetadata.city}</p>
          ) : null}
          {searchMetadata.priceRange ? (
            <p className="search-preview-description">Price Filter: {searchMetadata.priceRange}</p>
          ) : null}
          {Array.isArray(previewData.topResults) && previewData.topResults.length > 0 ? (
            <ul className="search-preview-list">
              {previewData.topResults.slice(0, 3).map((item) => (
                <li key={`${item.url}-${item.title}`}>
                  <a href={item.url} target="_blank" rel="noreferrer">
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.title}
                        className="search-preview-item-image"
                      />
                    ) : null}
                    <span>{item.title}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          <a
            href={resolvedSearchUrl || searchUrl}
            target="_blank"
            rel="noreferrer"
            className="search-preview-open"
          >
            Open search page
          </a>
        </div>
      ) : null}

      {previewState === 'error' ? (
        <span className="search-preview-error">
          {previewError}
          <a
            href={resolvedSearchUrl || searchUrl}
            target="_blank"
            rel="noreferrer"
            className="search-preview-open"
          >
            Open search page
          </a>
        </span>
      ) : null}
    </section>
  )
}

export default SearchInlinePreview
