import { useEffect, useState } from 'react'

const createEmptyItem = () => ({
  description: '',
  hsnCode: '',
  productCode: '',
  quantity: '1',
  amount: '',
})

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

function numberToWords(number) {
  const ones = [
    'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
  ]
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

  function underThousand(value) {
    const words = []
    if (value >= 100) {
      words.push(ones[Math.floor(value / 100)], 'Hundred')
      value %= 100
    }
    if (value >= 20) {
      words.push(tens[Math.floor(value / 10)])
      value %= 10
    }
    if (value > 0) words.push(ones[value])
    return words.join(' ')
  }

  const amountInPaise = Math.round(number * 100)
  if (!Number.isFinite(amountInPaise) || amountInPaise < 0 || amountInPaise > 99999999999) return ''
  const amount = Math.floor(amountInPaise / 100)
  const paise = amountInPaise % 100
  if (amount === 0 && paise === 0) return 'Zero Only'

  let remainder = amount
  const words = []
  const groups = [[10000000, 'Crore'], [100000, 'Lakh'], [1000, 'Thousand'], [1, '']]
  groups.forEach(([size, label]) => {
    const value = Math.floor(remainder / size)
    if (value > 0) {
      words.push(underThousand(value))
      if (label) words.push(label)
      remainder %= size
    }
  })

  const rupeeWords = amount === 0 ? 'Zero' : words.join(' ')
  return `${rupeeWords}${paise ? ` and ${underThousand(paise)} Paise` : ''} Only`
}

function DebitNote({ onBack }) {
  const [debitNotes, setDebitNotes] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [items, setItems] = useState([createEmptyItem()])
  const [packingChargeRate, setPackingChargeRate] = useState('0')
  const [gstRate, setGstRate] = useState('18')
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
      hsnCode: item.hsnCode.trim(),
      productCode: item.productCode.trim(),
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
      customerGstNumber: String(formData.get('customerGstNumber') || '').trim(),
      address: String(formData.get('address') || '').trim(),
      noteDate: String(formData.get('noteDate') || ''),
      purchaseOrderNumber: String(formData.get('purchaseOrderNumber') || '').trim(),
      purchaseOrderDate: String(formData.get('purchaseOrderDate') || ''),
      invoiceNumber: String(formData.get('invoiceNumber') || '').trim(),
      invoiceDate: String(formData.get('invoiceDate') || ''),
      creditNoteType: String(formData.get('creditNoteType') || '').trim(),
      creditNoteNumber: String(formData.get('creditNoteNumber') || '').trim(),
      creditNoteDate: String(formData.get('creditNoteDate') || ''),
      deliveryChallanNumber: String(formData.get('deliveryChallanNumber') || '').trim(),
      deliveryChallanDate: String(formData.get('deliveryChallanDate') || ''),
      reference: String(formData.get('reference') || '').trim(),
      reason: String(formData.get('reason') || '').trim(),
      packingChargeRate: Number(formData.get('packingChargeRate')),
      gstRate: Number(formData.get('gstRate')),
      comments: String(formData.get('comments') || '').trim(),
      notes: String(formData.get('notes') || '').trim(),
      items: noteItems,
    }

    if (
      !Number.isFinite(debitNote.packingChargeRate) || debitNote.packingChargeRate < 0
      || !Number.isFinite(debitNote.gstRate) || debitNote.gstRate < 0
    ) {
      setFormError('Enter valid non-negative P&F and IGST rates.')
      return
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

  const itemSubtotal = Math.round(items.reduce((sum, item) => (
    sum + Math.round((Number(item.quantity) || 0) * (Number(item.amount) || 0) * 100) / 100
  ), 0) * 100) / 100
  const packingCharge = Math.round(itemSubtotal * (Number(packingChargeRate) || 0)) / 100
  const subtotal = itemSubtotal + packingCharge
  const gstAmount = Math.round(subtotal * (Number(gstRate) || 0)) / 100
  const grandTotal = Math.round((subtotal + gstAmount) * 100) / 100

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
                <legend>Debit note and customer details</legend>
                <div className="quotation-form-grid">
                  <label className="quotation-field">
                    <span>Debit note number</span>
                    <input type="text" value="Generated when saved" readOnly />
                  </label>
                  <label className="quotation-field">
                    <span>Debit note date <b>*</b></span>
                    <input name="noteDate" type="date" defaultValue={getLocalDateString()} required />
                  </label>
                  <label className="quotation-field">
                    <span>Customer name <b>*</b></span>
                    <input name="customerName" type="text" autoComplete="name" required />
                  </label>
                  <label className="quotation-field">
                    <span>Customer GST number</span>
                    <input name="customerGstNumber" type="text" />
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
                    <span>Purchase order number</span>
                    <input name="purchaseOrderNumber" type="text" />
                  </label>
                  <label className="quotation-field">
                    <span>Purchase order date</span>
                    <input name="purchaseOrderDate" type="date" />
                  </label>
                  <label className="quotation-field">
                    <span>Invoice number</span>
                    <input name="invoiceNumber" type="text" />
                  </label>
                  <label className="quotation-field">
                    <span>Invoice date</span>
                    <input name="invoiceDate" type="date" />
                  </label>
                  <label className="quotation-field">
                    <span>Credit note type</span>
                    <input name="creditNoteType" type="text" />
                  </label>
                  <label className="quotation-field">
                    <span>Credit note number</span>
                    <input name="creditNoteNumber" type="text" />
                  </label>
                  <label className="quotation-field">
                    <span>Credit note date</span>
                    <input name="creditNoteDate" type="date" />
                  </label>
                  <label className="quotation-field">
                    <span>Delivery challan number</span>
                    <input name="deliveryChallanNumber" type="text" />
                  </label>
                  <label className="quotation-field">
                    <span>Delivery challan date</span>
                    <input name="deliveryChallanDate" type="date" />
                  </label>
                  <label className="quotation-field">
                    <span>Reference invoice / document</span>
                    <input name="reference" type="text" />
                  </label>
                  <label className="quotation-field">
                    <span>Reason for debit note</span>
                    <input name="reason" type="text" placeholder="For example, additional charges or price adjustment" />
                  </label>
                  <label className="quotation-field quotation-field-full">
                    <span>Bill to address</span>
                    <textarea name="address" rows="2" autoComplete="street-address" />
                  </label>
                </div>
              </fieldset>

              <fieldset className="quotation-fieldset quotation-items-fieldset" disabled={isSaving}>
                <legend>Goods and services</legend>
                <div className="quotation-items">
                  {items.map((item, index) => (
                    <div className="quotation-item-row debit-note-item-row" key={index}>
                      <label className="quotation-field quotation-item-description">
                        <span>Description of goods <b>*</b></span>
                        <input
                          type="text"
                          value={item.description}
                          onChange={(event) => updateItem(index, 'description', event.target.value)}
                          required
                        />
                      </label>
                      <label className="quotation-field">
                        <span>HSN code</span>
                        <input
                          type="text"
                          value={item.hsnCode}
                          onChange={(event) => updateItem(index, 'hsnCode', event.target.value)}
                        />
                      </label>
                      <label className="quotation-field">
                        <span>Product code</span>
                        <input
                          type="text"
                          value={item.productCode}
                          onChange={(event) => updateItem(index, 'productCode', event.target.value)}
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
                      <span className="quotation-item-amount">
                        <span>Amount</span>
                        <strong>{formatCurrency((Number(item.quantity) || 0) * (Number(item.amount) || 0))}</strong>
                      </span>
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

              <fieldset className="quotation-fieldset debit-note-terms-fieldset" disabled={isSaving}>
                <legend>Charges and tax</legend>
                <div className="quotation-form-grid">
                  <label className="quotation-field">
                    <span>P&amp;F charges (%)</span>
                    <input
                      name="packingChargeRate"
                      type="number"
                      min="0"
                      step="0.01"
                      value={packingChargeRate}
                      onChange={(event) => setPackingChargeRate(event.target.value)}
                      required
                    />
                  </label>
                  <label className="quotation-field">
                    <span>IGST (%)</span>
                    <input
                      name="gstRate"
                      type="number"
                      min="0"
                      step="0.01"
                      value={gstRate}
                      onChange={(event) => setGstRate(event.target.value)}
                      required
                    />
                  </label>
                  <label className="quotation-field quotation-field-full">
                    <span>Comments</span>
                    <textarea name="comments" rows="2" />
                  </label>
                </div>
              </fieldset>

              <label className="quotation-field quotation-notes-field">
                <span>Additional notes</span>
                <textarea name="notes" rows="2" placeholder="Additional details" disabled={isSaving} />
              </label>

              <div className="quotation-total-breakdown">
                <p>Sub total <strong>{formatCurrency(itemSubtotal)}</strong></p>
                <p>P&amp;F charges <strong>{formatCurrency(packingCharge)}</strong></p>
                <p>IGST ({Number(gstRate) || 0}%) <strong>{formatCurrency(gstAmount)}</strong></p>
                <p className="quotation-grand-total">Grand total <strong>{formatCurrency(grandTotal)}</strong></p>
                <label className="quotation-field quotation-total-words">
                  <span>Total amount in words</span>
                  <input type="text" value={numberToWords(grandTotal)} readOnly />
                </label>
              </div>

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
