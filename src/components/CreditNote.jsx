import { Fragment, useEffect, useState } from 'react'

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
  const [editingCreditNote, setEditingCreditNote] = useState(null)
  const [deletingCreditNoteId, setDeletingCreditNoteId] = useState('')
  const [items, setItems] = useState([createEmptyItem()])
  const [cgstRate, setCgstRate] = useState('9')
  const [sgstRate, setSgstRate] = useState('9')
  const [formDefaults, setFormDefaults] = useState({})
  const [expandedCreditNoteId, setExpandedCreditNoteId] = useState('')
  const [printCreditNote, setPrintCreditNote] = useState(null)
  const [formError, setFormError] = useState('')
  const [actionError, setActionError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    if (!printCreditNote) return undefined

    const handleAfterPrint = () => setPrintCreditNote(null)
    window.addEventListener('afterprint', handleAfterPrint)
    const printFrame = window.requestAnimationFrame(() => window.print())

    return () => {
      window.cancelAnimationFrame(printFrame)
      window.removeEventListener('afterprint', handleAfterPrint)
    }
  }, [printCreditNote])

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
      const response = await fetch(
        editingCreditNote
          ? `/api/credit-notes/${encodeURIComponent(editingCreditNote.id)}`
          : '/api/credit-notes',
        {
          method: editingCreditNote ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(creditNote),
        },
      )
      const savedCreditNote = await readApiResponse(response)

      setCreditNotes((current) => editingCreditNote
        ? current.map((entry) => (entry.id === savedCreditNote.id ? savedCreditNote : entry))
        : [savedCreditNote, ...current])
      setIsModalOpen(false)
      setEditingCreditNote(null)
      setItems([createEmptyItem()])
      setSuccessMessage(editingCreditNote
        ? `Credit note ${savedCreditNote.id} was updated.`
        : `Credit note ${savedCreditNote.id} was saved to Credit note.json.`)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not save the credit note.')
    } finally {
      setIsSaving(false)
    }
  }

  function openCreditNoteForm(note) {
    setEditingCreditNote(note)
    setFormDefaults(note)
    setItems(Array.isArray(note.items) && note.items.length > 0
      ? note.items.map((item) => ({
        description: item.description || '',
        productCode: item.productCode || '',
        hsnCode: item.hsnCode || '',
        quantity: String(item.quantity ?? '1'),
        amount: String(item.amount ?? ''),
      }))
      : [createEmptyItem()])
    setCgstRate(String(note.cgstRate ?? 9))
    setSgstRate(String(note.sgstRate ?? 9))
    setFormError('')
    setActionError('')
    setSuccessMessage('')
    setIsModalOpen(true)
  }

  async function handleDelete(note) {
    if (!window.confirm(`Delete credit note ${note.id} for ${note.customerName}? This cannot be undone.`)) {
      return
    }

    setDeletingCreditNoteId(note.id)
    setActionError('')
    setSuccessMessage('')

    try {
      const response = await fetch(`/api/credit-notes/${encodeURIComponent(note.id)}`, {
        method: 'DELETE',
      })
      await readApiResponse(response)
      setCreditNotes((current) => current.filter((entry) => entry.id !== note.id))
      setExpandedCreditNoteId((current) => (current === note.id ? '' : current))
      setSuccessMessage(`Credit note ${note.id} was deleted.`)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not delete the credit note.')
    } finally {
      setDeletingCreditNoteId('')
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
              setEditingCreditNote(null)
              setFormDefaults({})
              setItems([createEmptyItem()])
              setCgstRate('9')
              setSgstRate('9')
              setFormError('')
              setActionError('')
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
      {actionError && <p className="quotation-alert quotation-alert-error" role="alert">{actionError}</p>}
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
                <th scope="col">Details</th>
              </tr>
            </thead>
            <tbody>
              {creditNotes.map((note) => (
                <Fragment key={note.id}>
                  <tr>
                    <td className="quotation-number">{note.id}</td>
                    <td>
                      <span className="quotation-customer">{note.customerName}</span>
                      {note.email && <span className="quotation-customer-email">{note.email}</span>}
                    </td>
                    <td>{note.noteDate}</td>
                    <td>{note.reference || '—'}</td>
                    <td className="quotation-total">{formatCurrency(note.total)}</td>
                    <td>
                      <button
                        className="quotation-details-toggle"
                        type="button"
                        aria-expanded={expandedCreditNoteId === note.id}
                        aria-controls={`credit-note-details-${note.id}`}
                        onClick={() => setExpandedCreditNoteId((current) => (
                          current === note.id ? '' : note.id
                        ))}
                      >
                        {expandedCreditNoteId === note.id ? 'Hide' : 'View'}
                      </button>
                    </td>
                  </tr>
                  {expandedCreditNoteId === note.id && (
                    <tr key={`${note.id}-details`}>
                      <td colSpan="6">
                        <section
                          className="quotation-record-details"
                          id={`credit-note-details-${note.id}`}
                        >
                          <div className="quotation-record-toolbar">
                            <span>Credit note details</span>
                            <div className="quotation-record-actions">
                              <button
                                className="quotation-print-button"
                                type="button"
                                onClick={() => setPrintCreditNote(note)}
                              >
                                Print credit note
                              </button>
                              <button
                                className="quotation-edit-button"
                                type="button"
                                onClick={() => openCreditNoteForm(note)}
                                disabled={Boolean(deletingCreditNoteId)}
                              >
                                Edit credit note
                              </button>
                              <button
                                className="quotation-delete-button"
                                type="button"
                                onClick={() => handleDelete(note)}
                                disabled={Boolean(deletingCreditNoteId)}
                              >
                                {deletingCreditNoteId === note.id ? 'Deleting…' : 'Delete credit note'}
                              </button>
                            </div>
                          </div>
                          <dl className="quotation-record-grid">
                            <div><dt>Email</dt><dd>{note.email || '—'}</dd></div>
                            <div><dt>Phone</dt><dd>{note.phone || '—'}</dd></div>
                            <div><dt>Customer GST number</dt><dd>{note.customerGstNumber || '—'}</dd></div>
                            <div><dt>Billing address</dt><dd>{note.address || '—'}</dd></div>
                            <div><dt>Purchase order number</dt><dd>{note.purchaseOrderNumber || '—'}</dd></div>
                            <div><dt>Purchase order date</dt><dd>{note.purchaseOrderDate || '—'}</dd></div>
                            <div><dt>Invoice number</dt><dd>{note.invoiceNumber || '—'}</dd></div>
                            <div><dt>Invoice date</dt><dd>{note.invoiceDate || '—'}</dd></div>
                            <div><dt>Credit note type</dt><dd>{note.creditNoteType || '—'}</dd></div>
                            <div><dt>Delivery challan number</dt><dd>{note.deliveryChallanNumber || '—'}</dd></div>
                            <div><dt>Delivery challan date</dt><dd>{note.deliveryChallanDate || '—'}</dd></div>
                            <div><dt>Reference</dt><dd>{note.reference || '—'}</dd></div>
                            <div><dt>Reason</dt><dd>{note.reason || '—'}</dd></div>
                          </dl>
                          <div className="quotation-record-items-wrap">
                            <table className="quotation-record-items">
                              <thead>
                                <tr>
                                  <th>Description</th>
                                  <th>Product code</th>
                                  <th>HSN</th>
                                  <th>Qty</th>
                                  <th>Unit amount</th>
                                  <th>Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(note.items || []).map((item, index) => (
                                  <tr key={`${note.id}-item-${index}`}>
                                    <td>{item.description}</td>
                                    <td>{item.productCode || '—'}</td>
                                    <td>{item.hsnCode || '—'}</td>
                                    <td>{item.quantity}</td>
                                    <td>{formatCurrency(item.amount)}</td>
                                    <td>{formatCurrency(item.total ?? item.quantity * item.amount)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div className="quotation-record-totals">
                            <p>Subtotal <strong>{formatCurrency(note.subtotal ?? note.total)}</strong></p>
                            <p>CGST ({note.cgstRate ?? 0}%) <strong>{formatCurrency(note.cgstAmount ?? 0)}</strong></p>
                            <p>SGST ({note.sgstRate ?? 0}%) <strong>{formatCurrency(note.sgstAmount ?? 0)}</strong></p>
                            <p className="quotation-grand-total">Total credit <strong>{formatCurrency(note.total)}</strong></p>
                            <p className="quotation-record-amount-words">Total in words: {numberToWords(note.total)}</p>
                          </div>
                          {note.comments && <p className="quotation-record-notes"><strong>Comments:</strong> {note.comments}</p>}
                          {note.notes && <p className="quotation-record-notes"><strong>Notes:</strong> {note.notes}</p>}
                        </section>
                      </td>
                    </tr>
                  )}
                </Fragment>
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
                <h2 id="credit-note-modal-title">
                  {editingCreditNote ? 'Edit credit note' : 'Create credit note'}
                </h2>
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
                    <input type="text" value={editingCreditNote?.id || 'Generated when saved'} readOnly />
                  </label>
                  <label className="quotation-field">
                    <span>Credit note date <b>*</b></span>
                    <input name="noteDate" type="date" defaultValue={formDefaults.noteDate || getLocalDateString()} required />
                  </label>
                  <label className="quotation-field">
                    <span>Customer name <b>*</b></span>
                    <input name="customerName" type="text" autoComplete="name" defaultValue={formDefaults.customerName || ''} required />
                  </label>
                  <label className="quotation-field">
                    <span>Customer GST number</span>
                    <input name="customerGstNumber" type="text" defaultValue={formDefaults.customerGstNumber || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>Email address</span>
                    <input name="email" type="email" autoComplete="email" defaultValue={formDefaults.email || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>Phone number</span>
                    <input name="phone" type="tel" autoComplete="tel" defaultValue={formDefaults.phone || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>Purchase order number</span>
                    <input name="purchaseOrderNumber" type="text" defaultValue={formDefaults.purchaseOrderNumber || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>Purchase order date</span>
                    <input name="purchaseOrderDate" type="date" defaultValue={formDefaults.purchaseOrderDate || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>Invoice number</span>
                    <input name="invoiceNumber" type="text" defaultValue={formDefaults.invoiceNumber || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>Invoice date</span>
                    <input name="invoiceDate" type="date" defaultValue={formDefaults.invoiceDate || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>Credit note type</span>
                    <input name="creditNoteType" type="text" defaultValue={formDefaults.creditNoteType || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>Delivery challan number</span>
                    <input name="deliveryChallanNumber" type="text" defaultValue={formDefaults.deliveryChallanNumber || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>Delivery challan date</span>
                    <input name="deliveryChallanDate" type="date" defaultValue={formDefaults.deliveryChallanDate || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>Reference invoice / document</span>
                    <input name="reference" type="text" defaultValue={formDefaults.reference || ''} />
                  </label>
                  <label className="quotation-field quotation-field-full">
                    <span>Billing address</span>
                    <textarea name="address" rows="2" autoComplete="street-address" defaultValue={formDefaults.address || ''} />
                  </label>
                  <label className="quotation-field quotation-field-full">
                    <span>Reason for credit note</span>
                    <input name="reason" type="text" placeholder="For example, returned goods or price adjustment" defaultValue={formDefaults.reason || ''} />
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
                    <textarea name="comments" rows="2" defaultValue={formDefaults.comments || ''} />
                  </label>
                </div>
              </fieldset>

              <label className="quotation-field quotation-notes-field">
                <span>Additional notes</span>
                <textarea name="notes" rows="2" placeholder="Additional details" defaultValue={formDefaults.notes || ''} disabled={isSaving} />
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
                  {isSaving
                    ? (editingCreditNote ? 'Updating…' : 'Saving…')
                    : (editingCreditNote ? 'Update credit note' : 'Save credit note')}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {printCreditNote && (
        <article className="quotation-print-document credit-note-print-document" id="credit-note-print-document">
          <header className="quotation-print-company">
            <div className="quotation-print-brand-mark">TE</div>
            <div>
              <h1>TOLETI ENTERPRISES</h1>
              <p>1-1-287/20, Bapunagar, Street No. 4, Chikkadpally, Hyderabad-500020, Telangana</p>
              <p>Cell No.: 9885480036 / 8121494837 | Mail: toletienterprises@gmail.com</p>
              <p>GSTN No.: 36AKUPG7555J1ZG | IEC &amp; PAN No.: AKUPG7555J</p>
            </div>
          </header>

          <h2 className="quotation-print-title">CREDIT NOTE</h2>

          <section className="quotation-print-parties">
            <div className="quotation-print-bill-to">
              <strong>To:</strong>
              <strong>{printCreditNote.customerName}</strong>
              {printCreditNote.address && <p>{printCreditNote.address}</p>}
              {printCreditNote.customerGstNumber && <p>GSTIN: {printCreditNote.customerGstNumber}</p>}
              {printCreditNote.email && <p>Email: {printCreditNote.email}</p>}
              {printCreditNote.phone && <p>Contact: {printCreditNote.phone}</p>}
            </div>
            <dl>
              <div><dt>Credit note No.</dt><dd>{printCreditNote.id}</dd></div>
              <div><dt>Date</dt><dd>{printCreditNote.noteDate || '—'}</dd></div>
              <div><dt>Credit note type</dt><dd>{printCreditNote.creditNoteType || '—'}</dd></div>
              <div><dt>Reference</dt><dd>{printCreditNote.reference || '—'}</dd></div>
              <div><dt>Reason</dt><dd>{printCreditNote.reason || '—'}</dd></div>
              <div><dt>Purchase order No.</dt><dd>{printCreditNote.purchaseOrderNumber || '—'}</dd></div>
              <div><dt>Purchase order date</dt><dd>{printCreditNote.purchaseOrderDate || '—'}</dd></div>
              <div><dt>Invoice No.</dt><dd>{printCreditNote.invoiceNumber || '—'}</dd></div>
              <div><dt>Invoice date</dt><dd>{printCreditNote.invoiceDate || '—'}</dd></div>
              <div><dt>Delivery challan No.</dt><dd>{printCreditNote.deliveryChallanNumber || '—'}</dd></div>
              <div><dt>Delivery challan date</dt><dd>{printCreditNote.deliveryChallanDate || '—'}</dd></div>
            </dl>
          </section>

          <table className="quotation-print-items credit-note-print-items">
            <thead>
              <tr>
                <th>Sl. No.</th>
                <th>Description</th>
                <th>Product Code</th>
                <th>HSN Code</th>
                <th>Qty</th>
                <th>Unit Amount</th>
                <th>Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {(printCreditNote.items || []).map((item, index) => (
                <tr key={`${printCreditNote.id}-print-item-${index}`}>
                  <td>{String(index + 1).padStart(2, '0')}</td>
                  <td>{item.description}</td>
                  <td>{item.productCode || '—'}</td>
                  <td>{item.hsnCode || '—'}</td>
                  <td>{item.quantity}</td>
                  <td>{formatCurrency(item.amount)}</td>
                  <td>{formatCurrency(item.total ?? item.quantity * item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <section className="quotation-print-bottom credit-note-print-bottom">
            <div className="quotation-print-terms">
              <strong>Comments and notes:</strong>
              <p>{printCreditNote.comments || '—'}</p>
              {printCreditNote.notes && <p className="quotation-print-notes">{printCreditNote.notes}</p>}
            </div>
            <table className="quotation-print-totals">
              <tbody>
                <tr><th>Sub Total</th><td>{formatCurrency(printCreditNote.subtotal ?? printCreditNote.total)}</td></tr>
                <tr><th>CGST @ {printCreditNote.cgstRate ?? 0}%</th><td>{formatCurrency(printCreditNote.cgstAmount ?? 0)}</td></tr>
                <tr><th>SGST @ {printCreditNote.sgstRate ?? 0}%</th><td>{formatCurrency(printCreditNote.sgstAmount ?? 0)}</td></tr>
                <tr className="quotation-print-grand-total"><th>Total Credit</th><td>{formatCurrency(printCreditNote.total)}</td></tr>
              </tbody>
            </table>
          </section>

          <p className="quotation-print-words">
            <strong>Total in words:</strong> {numberToWords(printCreditNote.total)}
          </p>

          <footer className="quotation-print-signature">
            <strong>For Toleti Enterprises</strong>
            <div className="quotation-print-signature-space" />
            <strong>Authorized Signatory</strong>
          </footer>
        </article>
      )}
    </section>
  )
}

export default CreditNote
