import { useMemo, useState } from 'react'

const isHttpUrl = (value) => /^https?:\/\//i.test(String(value || '').trim())

function DirectImagePreview({ imageUrl }) {
  const normalizedUrl = useMemo(() => String(imageUrl || '').trim(), [imageUrl])
  const isValidUrl = isHttpUrl(normalizedUrl)
  const [status, setStatus] = useState('loading')

  if (!normalizedUrl || !isValidUrl) {
    return (
      <section className="direct-image-preview" aria-live="polite">
        <header className="direct-image-preview-header">
          <span className="direct-image-preview-badge">Viewed Image</span>
        </header>
        <div className="direct-image-preview-error">
          Image URL is missing or invalid for direct preview.
        </div>
      </section>
    )
  }

  return (
    <section className="direct-image-preview" aria-live="polite">
      <header className="direct-image-preview-header">
        <span className="direct-image-preview-badge">Viewed Image</span>
      </header>

      {status === 'loading' ? (
        <div className="direct-image-preview-loading">
          <span className="spinner"></span>
          <span>Loading image...</span>
        </div>
      ) : null}

      <a
        href={normalizedUrl}
        target="_blank"
        rel="noreferrer"
        className="direct-image-preview-link"
      >
        <img
          src={normalizedUrl}
          alt="Viewed source"
          className="direct-image-preview-image"
          onLoad={() => setStatus('ready')}
          onError={() => setStatus('error')}
        />
      </a>

      {status === 'error' ? (
        <div className="direct-image-preview-error">
          Could not load image preview. Open source URL to view it directly.
        </div>
      ) : null}

      <a
        href={normalizedUrl}
        target="_blank"
        rel="noreferrer"
        className="direct-image-preview-open"
      >
        Open source image
      </a>
    </section>
  )
}

export default DirectImagePreview
