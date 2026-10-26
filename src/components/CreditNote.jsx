import { useEffect, useState } from 'react'

const createEmptyItem = () => ({
  description: '',
  productCode: '',
  hsnCode: '',
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
      `The credit note API returned an invalid response (HTTP ${response.status}). `
      + 'Stop the old development server and restart with npm run dev.',
    )
  }

  if (!response.ok) {
    throw new Error(data.error || `The credit note API returned HTTP ${response.status}.`)
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

function CreditNote({ onBack }) {
  const [creditNotes, setCreditNotes] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [items, setItems] = useState([createEmptyItem()])
  const [cgstRate, setCgstRate] = useState('9')
  const [sgstRate, setSgstRate] = useState('9')
  const [formError, setFormError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    let isCurrent = true

    async function loadCreditNotes() {
      setIsLoading(true)
      setLoadError('')

      try {
        const response = await fetch('/api/credit-notes')
        const result = await readApiResponse(response)
        if (!Array.isArray(result)) {
          throw new Error('The credit note server returned invalid data.')
        }
        if (isCurrent) setCreditNotes(result)
      } catch (error) {
        if (isCurrent) {
          setLoadError(error instanceof Error ? error.message : 'Could not load credit notes.')
        }
      } finally {
        if (isCurrent) setIsLoading(false)
      }
    }

    loadCreditNotes()
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
      productCode: item.productCode.trim(),
      hsnCode: item.hsnCode.trim(),
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

    const creditNote = {
      customerName: String(formData.get('customerName') || '').trim(),
      email: String(formData.get('email') || '').trim(),
      phone: String(formData.get('phone') || '').trim(),
      address: String(formData.get('address') || '').trim(),
      noteDate: String(formData.get('noteDate') || ''),
      purchaseOrderNumber: String(formData.get('purchaseOrderNumber') || '').trim(),
      purchaseOrderDate: String(formData.get('purchaseOrderDate') || ''),
      invoiceNumber: String(formData.get('invoiceNumber') || '').trim(),
      invoiceDate: String(formData.get('invoiceDate') || ''),
      creditNoteType: String(formData.get('creditNoteType') || '').trim(),
      deliveryChallanNumber: String(formData.get('deliveryChallanNumber') || '').trim(),
      deliveryChallanDate: String(formData.get('deliveryChallanDate') || ''),
      customerGstNumber: String(formData.get('customerGstNumber') || '').trim(),
      cgstRate: Number(formData.get('cgstRate')),
      sgstRate: Number(formData.get('sgstRate')),
      comments: String(formData.get('comments') || '').trim(),
      reference: String(formData.get('reference') || '').trim(),
      reason: String(formData.get('reason') || '').trim(),
      notes: String(formData.get('notes') || '').trim(),
      items: noteItems,
    }

    if (
      !Number.isFinite(creditNote.cgstRate) || creditNote.cgstRate < 0
      || !Number.isFinite(creditNote.sgstRate) || creditNote.sgstRate < 0
    ) {
      setFormError('Enter valid non-negative CGST and SGST rates.')
      return
    }

    setIsSaving(true)

    try {
      const response = await fetch('/api/credit-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creditNote),
      })
      const savedCreditNote = await readApiResponse(response)

      setCreditNotes((current) => [savedCreditNote, ...current])
      setIsModalOpen(false)
      setItems([createEmptyItem()])
      setSuccessMessage(`Credit note ${savedCreditNote.id} was saved to Credit note.json.`)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not save the credit note.')
    } finally {
      setIsSaving(false)
    }
  }

  const subtotal = Math.round(items.reduce((sum, item) => (
    sum + Math.round((Number(item.quantity) || 0) * (Number(item.amount) || 0) * 100) / 100
  ), 0) * 100) / 100
  const cgstAmount = Math.round(subtotal * (Number(cgstRate) || 0)) / 100
  const sgstAmount = Math.round(subtotal * (Number(sgstRate) || 0)) / 100
  const grandTotal = Math.round((subtotal + cgstAmount + sgstAmount) * 100) / 100

  return (
    <section className="quotation-page credit-note-page">
      <div className="quotation-heading">
        <div>
          <p className="dashboard-eyebrow">DOCUMENTS</p>
          <h1>Credit Note</h1>
          <p className="dashboard-description">Create and manage customer credit notes.</p>
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
            <span aria-hidden="true">+</span> New credit note
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
        <span className="quotation-summary-icon" aria-hidden="true">CN</span>
        <div>
          <p className="quotation-summary-label">Saved credit notes</p>
          <p className="quotation-summary-number">{isLoading ? '…' : creditNotes.length}</p>
        </div>
      </div>

      <div className="quotation-list-heading">
        <h2>Recent credit notes</h2>
        {!isLoading && creditNotes.length > 0 && (
          <span>{creditNotes.length} {creditNotes.length === 1 ? 'credit note' : 'credit notes'}</span>
        )}
      </div>

      {isLoading ? (
        <div className="quotation-empty-state" role="status">
          <p>Loading credit notes…</p>
        </div>
      ) : creditNotes.length === 0 ? (
        <div className="quotation-empty-state">
          <span className="empty-state-icon" aria-hidden="true">CN</span>
          <h2>No credit notes yet</h2>
          <p>Create a credit note to see it listed here.</p>
        </div>
      ) : (
        <div className="quotation-table-wrap">
          <table className="quotation-table">
            <thead>
              <tr>
                <th scope="col">Credit note</th>
                <th scope="col">Customer</th>
                <th scope="col">Date</th>
                <th scope="col">Reference</th>
                <th scope="col">Total</th>
              </tr>
            </thead>
            <tbody>
              {creditNotes.map((note) => (
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
            aria-labelledby="credit-note-modal-title"
          >
            <header className="quotation-modal-header">
              <div>
                <p className="dashboard-eyebrow">NEW DOCUMENT</p>
                <h2 id="credit-note-modal-title">Create credit note</h2>
              </div>
              <button
                className="quotation-close-button"
                type="button"
                aria-label="Close credit note form"
                onClick={() => setIsModalOpen(false)}
                disabled={isSaving}
              >
                ×
              </button>
            </header>

            <form className="quotation-form" onSubmit={handleSubmit}>
              <fieldset className="quotation-fieldset" disabled={isSaving}>
                <legend>Credit note and customer details</legend>
                <div className="quotation-form-grid">
                  <label className="quotation-field">
                    <span>Credit note number</span>
                    <input type="text" value="Generated when saved" readOnly />
                  </label>
                  <label className="quotation-field">
                    <span>Credit note date <b>*</b></span>
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
                  <label className="quotation-field quotation-field-full">
                    <span>Billing address</span>
                    <textarea name="address" rows="2" autoComplete="street-address" />
                  </label>
                  <label className="quotation-field quotation-field-full">
                    <span>Reason for credit note</span>
                    <input name="reason" type="text" placeholder="For example, returned goods or price adjustment" />
                  </label>
                </div>
              </fieldset>

              <fieldset className="quotation-fieldset quotation-items-fieldset" disabled={isSaving}>
                <legend>Goods and services</legend>
                <div className="quotation-items">
                  {items.map((item, index) => (
                    <div className="quotation-item-row credit-note-item-row" key={index}>
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
                        <span>Product code</span>
                        <input
                          type="text"
                          value={item.productCode}
                          onChange={(event) => updateItem(index, 'productCode', event.target.value)}
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

              <fieldset className="quotation-fieldset credit-note-tax-fieldset" disabled={isSaving}>
                <legend>Taxes and comments</legend>
                <div className="quotation-form-grid">
                  <label className="quotation-field">
                    <span>CGST (%)</span>
                    <input
                      name="cgstRate"
                      type="number"
                      min="0"
                      step="0.01"
                      value={cgstRate}
                      onChange={(event) => setCgstRate(event.target.value)}
                      required
                    />
                  </label>
                  <label className="quotation-field">
                    <span>SGST (%)</span>
                    <input
                      name="sgstRate"
                      type="number"
                      min="0"
                      step="0.01"
                      value={sgstRate}
                      onChange={(event) => setSgstRate(event.target.value)}
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
                <p>Sub total <strong>{formatCurrency(subtotal)}</strong></p>
                <p>CGST ({Number(cgstRate) || 0}%) <strong>{formatCurrency(cgstAmount)}</strong></p>
                <p>SGST ({Number(sgstRate) || 0}%) <strong>{formatCurrency(sgstAmount)}</strong></p>
                <p className="quotation-grand-total">Total credit <strong>{formatCurrency(grandTotal)}</strong></p>
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
                  {isSaving ? 'Saving…' : 'Save credit note'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </section>
  )
}

export default CreditNote
