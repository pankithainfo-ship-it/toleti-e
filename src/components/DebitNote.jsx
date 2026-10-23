import { useEffect, useState } from 'react'

const createEmptyItem = () => ({ description: '', quantity: '1', amount: '' })

async function readApiResponse(response) {
  const responseBody = await response.text()
  let data

  try {
    data = JSON.parse(responseBody)
  } catch {
    throw new Error(
      `The debit note API returned an invalid response (HTTP ${response.status}). `
      + 'Stop the old development server and restart with npm run dev.',
    )
  }

  if (!response.ok) {
    throw new Error(data.error || `The debit note API returned HTTP ${response.status}.`)
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

function DebitNote({ onBack }) {
  const [debitNotes, setDebitNotes] = useState([])
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

    async function loadDebitNotes() {
      setIsLoading(true)
      setLoadError('')

      try {
        const response = await fetch('/api/debit-notes')
        const result = await readApiResponse(response)
        if (!Array.isArray(result)) {
          throw new Error('The debit note server returned invalid data.')
        }
        if (isCurrent) setDebitNotes(result)
      } catch (error) {
        if (isCurrent) {
          setLoadError(error instanceof Error ? error.message : 'Could not load debit notes.')
        }
      } finally {
        if (isCurrent) setIsLoading(false)
      }
    }

    loadDebitNotes()
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
    const noteItems = items.map((item) => ({
      description: item.description.trim(),
      quantity: Number(item.quantity),
      amount: Number(item.amount),
    }))

    if (noteItems.some((item) => (
      !item.description || !Number.isFinite(item.quantity) || item.quantity <= 0
      || !Number.isFinite(item.amount) || item.amount < 0
    ))) {
      setFormError('Enter a description, positive quantity, and valid amount for each item.')
      return
    }

    const debitNote = {
      customerName: String(formData.get('customerName') || '').trim(),
      email: String(formData.get('email') || '').trim(),
      phone: String(formData.get('phone') || '').trim(),
      address: String(formData.get('address') || '').trim(),
      noteDate: String(formData.get('noteDate') || ''),
      reference: String(formData.get('reference') || '').trim(),
      reason: String(formData.get('reason') || '').trim(),
      notes: String(formData.get('notes') || '').trim(),
      items: noteItems,
    }

    setIsSaving(true)

    try {
      const response = await fetch('/api/debit-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(debitNote),
      })
      const savedDebitNote = await readApiResponse(response)

      setDebitNotes((current) => [savedDebitNote, ...current])
      setIsModalOpen(false)
      setItems([createEmptyItem()])
      setSuccessMessage(`Debit note ${savedDebitNote.id} was saved to Debit note.json.`)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not save the debit note.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="quotation-page debit-note-page">
      <div className="quotation-heading">
        <div>
          <p className="dashboard-eyebrow">DOCUMENTS</p>
          <h1>Debit Note</h1>
          <p className="dashboard-description">Create and manage customer debit notes.</p>
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
            <span aria-hidden="true">+</span> New debit note
          </button>
        </div>
      </div>

      {loadError && (
        <div className="quotation-alert quotation-alert-error" role="alert">
          {loadError}
          <button
            className="purchase-order-retry-button"
            type="button"
            onClick={() => setRefreshKey((key) => key + 1)}
          >
            Retry
          </button>
        </div>
      )}
      {successMessage && <p className="quotation-alert quotation-alert-success" role="status">{successMessage}</p>}

      <div className="quotation-summary">
        <span className="quotation-summary-icon" aria-hidden="true">DN</span>
        <div>
          <p className="quotation-summary-label">Saved debit notes</p>
          <p className="quotation-summary-number">{isLoading ? '…' : debitNotes.length}</p>
        </div>
      </div>

      <div className="quotation-list-heading">
        <h2>Recent debit notes</h2>
        {!isLoading && debitNotes.length > 0 && (
          <span>{debitNotes.length} {debitNotes.length === 1 ? 'debit note' : 'debit notes'}</span>
        )}
      </div>

      {isLoading ? (
        <div className="quotation-empty-state" role="status">
          <p>Loading debit notes…</p>
        </div>
      ) : debitNotes.length === 0 ? (
        <div className="quotation-empty-state">
          <span className="empty-state-icon" aria-hidden="true">DN</span>
          <h2>No debit notes yet</h2>
          <p>Create a debit note to see it listed here.</p>
        </div>
      ) : (
        <div className="quotation-table-wrap">
          <table className="quotation-table">
            <thead>
              <tr>
                <th scope="col">Debit note</th>
                <th scope="col">Customer</th>
                <th scope="col">Date</th>
                <th scope="col">Reference</th>
                <th scope="col">Total</th>
              </tr>
            </thead>
            <tbody>
              {debitNotes.map((note) => (
                <tr key={note.id}>
                  <td className="quotation-number">{note.id}</td>
                  <td>
                    <span className="quotation-customer">{note.customerName}</span>
                    {note.email && <span className="quotation-customer-email">{note.email}</span>}
                  </td>
                  <td>{note.noteDate}</td>
                  <td>{note.reference || '—'}</td>
                  <td className="quotation-total">{formatCurrency(note.total)}</td>
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
          <section
            className="quotation-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="debit-note-modal-title"
          >
            <header className="quotation-modal-header">
              <div>
                <p className="dashboard-eyebrow">NEW DOCUMENT</p>
                <h2 id="debit-note-modal-title">Create debit note</h2>
              </div>
              <button
                className="quotation-close-button"
                type="button"
                aria-label="Close debit note form"
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
                    <span>Debit note date <b>*</b></span>
                    <input name="noteDate" type="date" defaultValue={getLocalDateString()} required />
                  </label>
                  <label className="quotation-field">
                    <span>Reference invoice / document</span>
                    <input name="reference" type="text" />
                  </label>
                  <label className="quotation-field quotation-field-full">
                    <span>Billing address</span>
                    <textarea name="address" rows="2" autoComplete="street-address" />
                  </label>
                  <label className="quotation-field quotation-field-full">
                    <span>Reason for debit note</span>
                    <input name="reason" type="text" placeholder="For example, additional charges or price adjustment" />
                  </label>
                </div>
              </fieldset>

              <fieldset className="quotation-fieldset quotation-items-fieldset" disabled={isSaving}>
                <legend>Debit note items</legend>
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
                        <span>Unit amount (₹) <b>*</b></span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.amount}
                          onChange={(event) => updateItem(index, 'amount', event.target.value)}
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
                <span>Additional notes</span>
                <textarea name="notes" rows="2" placeholder="Additional details" disabled={isSaving} />
              </label>

              <p className="quotation-form-total">
                Debit total <strong>{formatCurrency(items.reduce((sum, item) => (
                  sum + (Number(item.quantity) || 0) * (Number(item.amount) || 0)
                ), 0))}</strong>
              </p>

              {formError && <p className="quotation-alert quotation-alert-error" role="alert">{formError}</p>}

              <footer className="quotation-form-actions">
                <button
                  className="quotation-cancel-button"
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button className="quotation-create-button" type="submit" disabled={isSaving}>
                  {isSaving ? 'Saving…' : 'Save debit note'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </section>
  )
}

export default DebitNote
