import { useEffect, useState } from 'react'

const createEmptyItem = () => ({ description: '', quantity: '1', unitPrice: '' })

async function readApiResponse(response) {
  const responseBody = await response.text()
  let data

  try {
    data = JSON.parse(responseBody)
  } catch {
    throw new Error(
      `The quotation API returned an invalid response (HTTP ${response.status}). `
      + 'Stop the old development server and restart with npm run dev.',
    )
  }

  if (!response.ok) {
    throw new Error(data.error || `The quotation API returned HTTP ${response.status}.`)
  }

  return data
}

async function getQuotations() {
  const response = await fetch('/api/quotations')
  const data = await readApiResponse(response)

  if (!Array.isArray(data)) {
    throw new Error('The quotation server returned invalid data.')
  }

  return data
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount)
}

function getLocalDateString() {
  const date = new Date()
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 10)
}

function Quotation({ onBack }) {
  const [quotations, setQuotations] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [items, setItems] = useState([createEmptyItem()])
  const [formError, setFormError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    let isCurrent = true

    async function loadData() {
      setIsLoading(true)
      setLoadError('')

      try {
        const result = await getQuotations()
        if (isCurrent) setQuotations(result)
      } catch (error) {
        if (isCurrent) {
          setLoadError(error instanceof Error ? error.message : 'Could not load quotations.')
        }
      } finally {
        if (isCurrent) setIsLoading(false)
      }
    }

    loadData()
    return () => {
      isCurrent = false
    }
  }, [refreshKey])

  useEffect(() => {
    if (!isModalOpen) return undefined

    function handleKeyDown(event) {
      if (event.key === 'Escape' && !isSaving) setIsModalOpen(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isModalOpen, isSaving])

  function updateItem(index, field, value) {
    setItems((currentItems) => currentItems.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [field]: value } : item
    )))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError('')
    setSuccessMessage('')

    const formData = new FormData(event.currentTarget)
    const quotationItems = items.map((item) => ({
      description: item.description.trim(),
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
    }))
    const quotationDate = String(formData.get('quotationDate') || '')
    const validUntil = String(formData.get('validUntil') || '')

    if (quotationItems.some((item) => (
      !item.description || !Number.isFinite(item.quantity) || item.quantity <= 0
      || !Number.isFinite(item.unitPrice) || item.unitPrice < 0
    ))) {
      setFormError('Enter a description, positive quantity, and valid unit price for each item.')
      return
    }

    if (validUntil && validUntil < quotationDate) {
      setFormError('The valid-until date cannot be earlier than the quotation date.')
      return
    }

    const quotation = {
      customerName: String(formData.get('customerName') || '').trim(),
      email: String(formData.get('email') || '').trim(),
      phone: String(formData.get('phone') || '').trim(),
      address: String(formData.get('address') || '').trim(),
      quotationDate,
      validUntil,
      notes: String(formData.get('notes') || '').trim(),
      items: quotationItems,
    }

    setIsSaving(true)

    try {
      const response = await fetch('/api/quotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quotation),
      })
      const savedQuotation = await readApiResponse(response)

      setQuotations((current) => [savedQuotation, ...current])
      setIsModalOpen(false)
      setItems([createEmptyItem()])
      setSuccessMessage(`Quotation ${savedQuotation.id} was saved to a JSON file.`)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not save the quotation.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="quotation-page">
      <div className="quotation-heading">
        <div>
          <p className="dashboard-eyebrow">DOCUMENTS</p>
          <h1>Quotations</h1>
          <p className="dashboard-description">Create and manage customer quotations.</p>
        </div>
        <div className="quotation-heading-actions">
          {onBack && (
            <button className="quotation-back-button" type="button" onClick={onBack}>
              Back to overview
            </button>
          )}
          <button
            className="quotation-create-button"
            type="button"
            onClick={() => {
              setFormError('')
              setSuccessMessage('')
              setIsModalOpen(true)
            }}
          >
            <span aria-hidden="true">+</span> New quotation
          </button>
        </div>
      </div>

      {loadError && (
        <div className="quotation-alert quotation-alert-error" role="alert">
          {loadError}
          <button className="quotation-retry-button" type="button" onClick={() => setRefreshKey((key) => key + 1)}>
            Retry
          </button>
        </div>
      )}
      {successMessage && <p className="quotation-alert quotation-alert-success" role="status">{successMessage}</p>}

      <div className="quotation-summary">
        <span className="quotation-summary-icon" aria-hidden="true">Q</span>
        <div>
          <p className="quotation-summary-label">Saved quotations</p>
          <p className="quotation-summary-number">{isLoading ? '…' : quotations.length}</p>
        </div>
      </div>

      <div className="quotation-list-heading">
        <h2>Recent quotations</h2>
        {!isLoading && quotations.length > 0 && (
          <span>{quotations.length} {quotations.length === 1 ? 'quotation' : 'quotations'}</span>
        )}
      </div>

      {isLoading ? (
        <div className="quotation-empty-state" role="status">
          <p>Loading quotations…</p>
        </div>
      ) : quotations.length === 0 ? (
        <div className="quotation-empty-state">
          <span className="empty-state-icon" aria-hidden="true">Q</span>
          <h2>No quotations yet</h2>
          <p>Create a quotation to see it listed here.</p>
        </div>
      ) : (
        <div className="quotation-table-wrap">
          <table className="quotation-table">
            <thead>
              <tr>
                <th scope="col">Quotation</th>
                <th scope="col">Customer</th>
                <th scope="col">Date</th>
                <th scope="col">Valid until</th>
                <th scope="col">Total</th>
              </tr>
            </thead>
            <tbody>
              {quotations.map((quotation) => (
                <tr key={quotation.id}>
                  <td className="quotation-number">{quotation.id}</td>
                  <td>
                    <span className="quotation-customer">{quotation.customerName}</span>
                    {quotation.email && <span className="quotation-customer-email">{quotation.email}</span>}
                  </td>
                  <td>{quotation.quotationDate}</td>
                  <td>{quotation.validUntil || '—'}</td>
                  <td className="quotation-total">{formatCurrency(quotation.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isModalOpen && (
        <div
          className="quotation-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isSaving) setIsModalOpen(false)
          }}
        >
          <section className="quotation-modal" role="dialog" aria-modal="true" aria-labelledby="quotation-modal-title">
            <header className="quotation-modal-header">
              <div>
                <p className="dashboard-eyebrow">NEW DOCUMENT</p>
                <h2 id="quotation-modal-title">Create quotation</h2>
              </div>
              <button
                className="quotation-close-button"
                type="button"
                aria-label="Close quotation form"
                onClick={() => setIsModalOpen(false)}
                disabled={isSaving}
              >
                ×
              </button>
            </header>

            <form className="quotation-form" onSubmit={handleSubmit}>
              <fieldset className="quotation-fieldset" disabled={isSaving}>
                <legend>Customer details</legend>
                <div className="quotation-form-grid">
                  <label className="quotation-field">
                    <span>Customer name <b>*</b></span>
                    <input name="customerName" type="text" autoComplete="name" required />
                  </label>
                  <label className="quotation-field">
                    <span>Email address</span>
                    <input name="email" type="email" autoComplete="email" />
                  </label>
                  <label className="quotation-field">
                    <span>Phone number</span>
                    <input name="phone" type="tel" autoComplete="tel" />
                  </label>
                  <label className="quotation-field">
                    <span>Quotation date <b>*</b></span>
                    <input name="quotationDate" type="date" defaultValue={getLocalDateString()} required />
                  </label>
                  <label className="quotation-field">
                    <span>Valid until</span>
                    <input name="validUntil" type="date" />
                  </label>
                  <label className="quotation-field quotation-field-full">
                    <span>Billing address</span>
                    <textarea name="address" rows="2" autoComplete="street-address" />
                  </label>
                </div>
              </fieldset>

              <fieldset className="quotation-fieldset quotation-items-fieldset" disabled={isSaving}>
                <legend>Items</legend>
                <div className="quotation-items">
                  {items.map((item, index) => (
                    <div className="quotation-item-row" key={index}>
                      <label className="quotation-field quotation-item-description">
                        <span>Description <b>*</b></span>
                        <input
                          type="text"
                          value={item.description}
                          onChange={(event) => updateItem(index, 'description', event.target.value)}
                          required
                        />
                      </label>
                      <label className="quotation-field quotation-item-quantity">
                        <span>Qty <b>*</b></span>
                        <input
                          type="number"
                          min="0.01"
                          step="any"
                          value={item.quantity}
                          onChange={(event) => updateItem(index, 'quantity', event.target.value)}
                          required
                        />
                      </label>
                      <label className="quotation-field quotation-item-price">
                        <span>Unit price (₹) <b>*</b></span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(event) => updateItem(index, 'unitPrice', event.target.value)}
                          required
                        />
                      </label>
                      {items.length > 1 && (
                        <button
                          className="quotation-remove-item"
                          type="button"
                          aria-label={`Remove item ${index + 1}`}
                          onClick={() => setItems((currentItems) => currentItems.filter((_, itemIndex) => itemIndex !== index))}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  className="quotation-add-item"
                  type="button"
                  onClick={() => setItems((currentItems) => [...currentItems, createEmptyItem()])}
                >
                  + Add another item
                </button>
              </fieldset>

              <label className="quotation-field quotation-notes-field">
                <span>Notes</span>
                <textarea name="notes" rows="2" placeholder="Additional terms or details" disabled={isSaving} />
              </label>

              <p className="quotation-form-total">
                Estimated total <strong>{formatCurrency(items.reduce((sum, item) => (
                  sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)
                ), 0))}</strong>
              </p>

              {formError && <p className="quotation-alert quotation-alert-error" role="alert">{formError}</p>}

              <footer className="quotation-form-actions">
                <button className="quotation-cancel-button" type="button" onClick={() => setIsModalOpen(false)} disabled={isSaving}>
                  Cancel
                </button>
                <button className="quotation-create-button" type="submit" disabled={isSaving}>
                  {isSaving ? 'Saving…' : 'Save quotation'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </section>
  )
}

export default Quotation
