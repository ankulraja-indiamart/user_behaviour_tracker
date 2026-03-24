import { useEffect, useRef, useState } from 'react'

const decodeSafe = (value) => {
  try {
    return decodeURIComponent(String(value || '').replace(/\+/g, ' '))
  } catch {
    return String(value || '')
  }
}

const getSearchSignalsFromUrl = (urlValue) => {
  try {
    const parsed = new URL(urlValue)
    const params = parsed.searchParams
    const minPrice = params.get('minprice')
    const maxPrice = params.get('maxprice')
    const sourceRaw = decodeSafe(params.get('src') || '')
    const source = sourceRaw ? sourceRaw.split('|')[0] : ''

    return {
      path: parsed.pathname || '',
      query:
        params.get('ss') ||
        params.get('q') ||
        params.get('keyword') ||
        '',
      city: params.get('cq') || params.get('city') || '',
      priceRange:
        minPrice || maxPrice
          ? `${minPrice || '-'} to ${maxPrice || '-'}`
          : '',
      source,
      prdsrc: params.get('prdsrc') || '',
      tags: decodeSafe(params.get('tags') || ''),
    }
  } catch {
    return {
      path: '',
      query: '',
      city: '',
      priceRange: '',
      source: '',
      prdsrc: '',
      tags: '',
    }
  }
}

function SearchInlinePreview({ searchUrl }) {
  if (!searchUrl) {
    return null
  }

  const [previewState, setPreviewState] = useState('idle')
  const [previewData, setPreviewData] = useState(null)
  const [previewError, setPreviewError] = useState('')
  const [resolvedSearchUrl, setResolvedSearchUrl] = useState(searchUrl)
  const activeAbortController = useRef(null)

  const getSearchContext = () => {
    if (!searchUrl) {
      return {
        query: '',
        city: '',
      }
    }

    try {
      const parsed = new URL(searchUrl)
      return {
        query:
          previewData?.query ||
          parsed.searchParams.get('ss') ||
          parsed.searchParams.get('q') ||
          parsed.searchParams.get('keyword') ||
          '',
        city:
          previewData?.city ||
          parsed.searchParams.get('cq') ||
          parsed.searchParams.get('city') ||
          '',
      }
    } catch {
      return {
          query: previewData?.query || '',
          city: previewData?.city || '',
      }
    }
  }

  const searchContext = getSearchContext()
  const searchSignals = getSearchSignalsFromUrl(resolvedSearchUrl || searchUrl)

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
      const response = await fetch(
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
      <header className="search-preview-inline-header">
        <span className="search-preview-badge">Search Result</span>
        {searchContext.query ? (
          <span className="search-preview-query">
            {searchContext.city
              ? `${searchContext.query} in ${searchContext.city}`
              : searchContext.query}
          </span>
        ) : null}
      </header>

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
          {searchSignals.city ? (
            <p className="search-preview-description">City: {searchSignals.city}</p>
          ) : null}
          {searchSignals.priceRange ? (
            <p className="search-preview-description">Price Filter: {searchSignals.priceRange}</p>
          ) : null}
          {searchSignals.tags ? (
            <p className="search-preview-description">Tags: {searchSignals.tags}</p>
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
