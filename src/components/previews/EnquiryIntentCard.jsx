import { useEffect, useState } from 'react'
import ProductHoverPreview from './ProductHoverPreview'
import { apiFetch } from '../../services/apiClient'

function EnquiryIntentCard({ step }) {
  if (!step?.is_enquiry) {
    return null
  }

  const productUrl = step.product_url || null
  const intentUrl = step.service_url || step.page_url || null
  const isBestPriceIntent = Boolean(step.is_best_price_intent)
  const [resolvedCity, setResolvedCity] = useState(step.city || '')
  const [isResolvingCity, setIsResolvingCity] = useState(false)

  useEffect(() => {
    setResolvedCity(step.city || '')
  }, [step.city])

  useEffect(() => {
    const hasCity = Boolean(String(step.city || '').trim() && step.city !== '-')
    if (hasCity || !intentUrl) {
      return
    }

    const controller = new AbortController()
    let isMounted = true

    const loadIntentPreview = async () => {
      setIsResolvingCity(true)

      try {
        const response = await apiFetch(
          `/api/intent-preview?url=${encodeURIComponent(intentUrl)}`,
          {
            method: 'GET',
            signal: controller.signal,
          },
        )
        const payload = await response.json()

        if (!response.ok) {
          return
        }

        const city = String(payload?.data?.city || '').trim()
        if (isMounted && city) {
          setResolvedCity(city)
        }
      } catch (error) {
        if (error?.name === 'AbortError') {
          return
        }
      } finally {
        if (isMounted) {
          setIsResolvingCity(false)
        }
      }
    }

    loadIntentPreview()

    return () => {
      isMounted = false
      controller.abort()
    }
  }, [intentUrl, step.city])

  const cityText = resolvedCity && resolvedCity !== '-' ? ` in ${resolvedCity}` : ''

  return (
    <section className="enquiry-intent-card" aria-live="polite">
      {isResolvingCity && !cityText ? (
        <p className="enquiry-intent-link-row">Resolving city from intent URL...</p>
      ) : null}

      {!productUrl ? (
        <p className="enquiry-intent-link-row">Product URL not available</p>
      ) : null}

      {isBestPriceIntent ? (
        <section className="enquiry-intent-advanced-box">
          <p className="enquiry-intent-advanced-text">
            User generated an advanced enquiry to get the latest/best price for this product.
          </p>
          {cityText ? (
            <p className="enquiry-intent-advanced-text">
              City Context: <strong>{cityText.replace(/^\s*in\s+/i, '')}</strong>
            </p>
          ) : null}
        </section>
      ) : null}

      {productUrl ? <ProductHoverPreview productUrl={productUrl} hideTitle={true} /> : null}
    </section>
  )
}

export default EnquiryIntentCard
