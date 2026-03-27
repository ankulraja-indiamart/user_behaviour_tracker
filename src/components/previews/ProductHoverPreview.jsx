import { useEffect, useRef, useState } from 'react'

const safeDecode = (value) => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

const getProductIdFromProductUrl = (productUrl) => {
  if (!productUrl) {
    return null
  }

  const match = String(productUrl).match(/\/proddetail\/([^/.]+)\.html/i)
  if (!match) {
    return null
  }

  const token = safeDecode(match[1])
  const idMatch = token.match(/(\d{6,})$/)
  return idMatch ? idMatch[1] : token
}

function ProductHoverPreview({ productUrl, onMcatResolved }) {
  if (!productUrl) {
    return null
  }

  const previewId = getProductIdFromProductUrl(productUrl)
  const [previewState, setPreviewState] = useState('idle')
  const [previewData, setPreviewData] = useState(null)
  const [previewError, setPreviewError] = useState('')
  const [resolvedPreviewUrl, setResolvedPreviewUrl] = useState(productUrl)
  const activeAbortController = useRef(null)

  useEffect(() => {
    setPreviewState('idle')
    setPreviewData(null)
    setPreviewError('')
    setResolvedPreviewUrl(productUrl)
    if (activeAbortController.current) {
      activeAbortController.current.abort()
      activeAbortController.current = null
    }
  }, [productUrl])

  const loadPreview = async () => {
    if (!productUrl || previewState === 'loading' || previewState === 'ready') {
      return
    }

    const controller = new AbortController()
    activeAbortController.current = controller
    setPreviewState('loading')
    setPreviewError('')

    try {
      const response = await fetch(
        `/api/product-preview?url=${encodeURIComponent(productUrl)}`,
        {
          method: 'GET',
          signal: controller.signal,
        },
      )

      const payload = await response.json()
      if (!response.ok || !payload?.data) {
        setPreviewState('error')
        setPreviewError(payload?.message || 'Preview not available for this product.')
        return
      }

      setPreviewData(payload.data)
      setResolvedPreviewUrl(payload.url || productUrl)
      if (payload?.data?.breadcrumb?.mcat) {
        onMcatResolved?.(payload.data.breadcrumb.mcat)
      }
      setPreviewState('ready')
    } catch (error) {
      if (error?.name === 'AbortError') {
        return
      }

      setPreviewState('error')
      setPreviewError('Could not load preview right now.')
    } finally {
      activeAbortController.current = null
    }
  }

  useEffect(() => {
    loadPreview()
  }, [productUrl])

  return (
    <section className="product-preview-inline" aria-live="polite">
      <header className="product-preview-inline-header">
        <span className="product-preview-badge">Preview</span>
        {previewId ? <span className="product-preview-id">PID {previewId}</span> : null}
      </header>

      {previewState === 'loading' || previewState === 'idle' ? (
        <span className="product-preview-loading">
          <span className="spinner"></span>
          <span>Loading preview...</span>
        </span>
      ) : null}

      {previewState === 'ready' && previewData ? (
        <div className="product-preview-card">
          {previewData.image ? (
            <img
              src={previewData.image}
              alt={previewData.title}
              className="product-preview-image"
            />
          ) : null}
          <div className="product-preview-info">
            <h4 className="product-preview-title">{previewData.title}</h4>
            <p className="product-preview-price">{previewData.price}</p>
            {previewData?.breadcrumb?.mcat ? (
              <p className="product-preview-rating">mCat: {previewData.breadcrumb.mcat}</p>
            ) : null}
            {previewData.rating ? (
              <p className="product-preview-rating">Rating: {previewData.rating} / 5</p>
            ) : null}
            <a
              href={resolvedPreviewUrl || productUrl}
              target="_blank"
              rel="noreferrer"
              className="product-preview-open"
            >
              Open product page
            </a>
          </div>
        </div>
      ) : null}

      {previewState === 'error' ? (
        <span className="product-preview-error">
          {previewError}
          <a
            href={resolvedPreviewUrl || productUrl}
            target="_blank"
            rel="noreferrer"
            className="product-preview-open"
          >
            Open product page
          </a>
        </span>
      ) : null}
    </section>
  )
}

export default ProductHoverPreview
