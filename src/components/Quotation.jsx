import { Fragment, useEffect, useState } from 'react'

const createEmptyItem = () => ({
  description: '',
  hsnCode: '',
  make: '',
  quantity: '1',
  unitPrice: '',
})

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
  if (amount === 0 && paise === 0) return 'Zero Rupees Only'

  let remainder = amount
  const groups = [
    [10000000, 'Crore'],
    [100000, 'Lakh'],
    [1000, 'Thousand'],
    [1, ''],
  ]
  const words = []
  groups.forEach(([size, label]) => {
    const value = Math.floor(remainder / size)
    if (value > 0) {
      words.push(underThousand(value))
      if (label) words.push(label)
      remainder %= size
    }
  })

  const rupeeWords = amount === 0 ? 'Zero' : words.join(' ')
  return `${rupeeWords} Rupees${paise ? ` and ${underThousand(paise)} Paise` : ''} Only`
}

function getQuotationTerm(quotation, field, label) {
  if (quotation[field]) {
    const embeddedTerm = quotation[field].match(
      /(?:^|\s)(Delivery|Payment|Validity|P&F Charges):\s*(.*?)(?=\s+(?:Delivery|Payment|Validity|P&F Charges):|$)/i,
    )
    if (embeddedTerm) {
      const requestedTerm = quotation[field].match(
        new RegExp(`(?:^|\\s)${label}:\\s*(.*?)(?=\\s+(?:Delivery|Payment|Validity|P&F Charges):|$)`, 'i'),
      )
      if (requestedTerm) return requestedTerm[1].replace(/,$/, '').trim()
    } else {
      return quotation[field]
    }
  }
  const match = quotation.notes?.match(new RegExp(`^${label}:\\s*(.+)$`, 'im'))
  return match ? match[1].replace(/,$/, '').trim() : ''
}

function Quotation({ onBack }) {
  const [quotations, setQuotations] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editingQuotation, setEditingQuotation] = useState(null)
  const [deletingQuotationId, setDeletingQuotationId] = useState('')
  const [items, setItems] = useState([createEmptyItem()])
  const [packingChargeRate, setPackingChargeRate] = useState('2')
  const [gstRate, setGstRate] = useState('18')
  const [formDefaults, setFormDefaults] = useState({})
  const [expandedQuotationId, setExpandedQuotationId] = useState('')
  const [printQuotation, setPrintQuotation] = useState(null)

  useEffect(() => {
    if (!printQuotation) return undefined

    const handleAfterPrint = () => setPrintQuotation(null)
    window.addEventListener('afterprint', handleAfterPrint)
    const printFrame = window.requestAnimationFrame(() => window.print())

    return () => {
      window.cancelAnimationFrame(printFrame)
      window.removeEventListener('afterprint', handleAfterPrint)
    }
  }, [printQuotation])
  const [formError, setFormError] = useState('')
  const [actionError, setActionError] = useState('')
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
      hsnCode: item.hsnCode.trim(),
      make: item.make.trim(),
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
      enquiryDate: String(formData.get('enquiryDate') || ''),
      enquiryReference: String(formData.get('enquiryReference') || '').trim(),
      attention: String(formData.get('attention') || '').trim(),
      region: String(formData.get('region') || '').trim(),
      freight: String(formData.get('freight') || '').trim(),
      deliveryTerms: String(formData.get('deliveryTerms') || '').trim(),
      paymentTerms: String(formData.get('paymentTerms') || '').trim(),
      validityTerms: String(formData.get('validityTerms') || '').trim(),
      freightTerms: String(formData.get('freightTerms') || '').trim(),
      packingChargeRate: Number(formData.get('packingChargeRate')),
      gstRate: Number(formData.get('gstRate')),
      notes: String(formData.get('notes') || '').trim(),
      items: quotationItems,
    }

    if (
      !Number.isFinite(quotation.packingChargeRate) || quotation.packingChargeRate < 0
      || !Number.isFinite(quotation.gstRate) || quotation.gstRate < 0
    ) {
      setFormError('Enter valid non-negative P&F and GST rates.')
      return
    }

    setIsSaving(true)

    try {
      const response = await fetch(
        editingQuotation
          ? `/api/quotations/${encodeURIComponent(editingQuotation.id)}`
          : '/api/quotations',
        {
          method: editingQuotation ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(quotation),
        },
      )
      const savedQuotation = await readApiResponse(response)

      setQuotations((current) => editingQuotation
        ? current.map((entry) => (entry.id === savedQuotation.id ? savedQuotation : entry))
        : [savedQuotation, ...current])
      setIsModalOpen(false)
      setEditingQuotation(null)
      setItems([createEmptyItem()])
      setSuccessMessage(editingQuotation
        ? `Quotation ${savedQuotation.id} was updated.`
        : `Quotation ${savedQuotation.id} was saved to a JSON file.`)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not save the quotation.')
    } finally {
      setIsSaving(false)
    }
  }

  function openQuotationForm(quotation) {
    setEditingQuotation(quotation)
    setFormDefaults(quotation)
    setItems(Array.isArray(quotation.items) && quotation.items.length > 0
      ? quotation.items.map((item) => ({
        description: item.description || '',
        hsnCode: item.hsnCode || '',
        make: item.make || '',
        quantity: String(item.quantity ?? '1'),
        unitPrice: String(item.unitPrice ?? ''),
      }))
      : [createEmptyItem()])
    setPackingChargeRate(String(quotation.packingChargeRate ?? 2))
    setGstRate(String(quotation.gstRate ?? 18))
    setFormError('')
    setActionError('')
    setSuccessMessage('')
    setIsModalOpen(true)
  }

  async function handleDelete(quotation) {
    if (!window.confirm(`Delete quotation ${quotation.id} for ${quotation.customerName}? This cannot be undone.`)) {
      return
    }

    setDeletingQuotationId(quotation.id)
    setActionError('')
    setSuccessMessage('')

    try {
      const response = await fetch(`/api/quotations/${encodeURIComponent(quotation.id)}`, {
        method: 'DELETE',
      })
      await readApiResponse(response)
      setQuotations((current) => current.filter((entry) => entry.id !== quotation.id))
      setExpandedQuotationId((current) => (current === quotation.id ? '' : current))
      setSuccessMessage(`Quotation ${quotation.id} was deleted.`)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not delete the quotation.')
    } finally {
      setDeletingQuotationId('')
    }
  }

  const subtotal = Math.round(items.reduce((sum, item) => (
    sum + Math.round((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0) * 100) / 100
  ), 0) * 100) / 100
  const packingCharge = Math.round(subtotal * (Number(packingChargeRate) || 0)) / 100
  const taxableAmount = subtotal + packingCharge
  const gstAmount = Math.round(taxableAmount * (Number(gstRate) || 0)) / 100
  const grandTotal = Math.round((taxableAmount + gstAmount) * 100) / 100

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
              const quotationDefaults = quotations[0] || {}
              openQuotationForm(quotationDefaults)
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
      {actionError && <p className="quotation-alert quotation-alert-error" role="alert">{actionError}</p>}
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
                <th scope="col">Details</th>
              </tr>
            </thead>
            <tbody>
              {quotations.map((quotation) => (
                <Fragment key={quotation.id}>
                  <tr>
                    <td className="quotation-number">{quotation.id}</td>
                    <td>
                      <span className="quotation-customer">{quotation.customerName}</span>
                      {quotation.email && <span className="quotation-customer-email">{quotation.email}</span>}
                    </td>
                    <td>{quotation.quotationDate}</td>
                    <td>{quotation.validUntil || '—'}</td>
                    <td className="quotation-total">{formatCurrency(quotation.total)}</td>
                    <td>
                      <button
                        className="quotation-details-toggle"
                        type="button"
                        aria-expanded={expandedQuotationId === quotation.id}
                        aria-controls={`quotation-details-${quotation.id}`}
                        onClick={() => setExpandedQuotationId((current) => (
                          current === quotation.id ? '' : quotation.id
                        ))}
                      >
                        {expandedQuotationId === quotation.id ? 'Hide' : 'View'}
                      </button>
                    </td>
                  </tr>
                  {expandedQuotationId === quotation.id && (
                    <tr key={`${quotation.id}-details`}>
                      <td colSpan="6">
                        <section className="quotation-record-details" id={`quotation-details-${quotation.id}`}>
                          <div className="quotation-record-toolbar">
                            <span>Quotation details</span>
                            <div className="quotation-record-actions">
                              <button
                                className="quotation-print-button"
                                type="button"
                                onClick={() => setPrintQuotation(quotation)}
                              >
                                Print quotation
                              </button>
                              <button
                                className="quotation-edit-button"
                                type="button"
                                onClick={() => openQuotationForm(quotation)}
                                disabled={Boolean(deletingQuotationId)}
                              >
                                Edit quotation
                              </button>
                              <button
                                className="quotation-delete-button"
                                type="button"
                                onClick={() => handleDelete(quotation)}
                                disabled={Boolean(deletingQuotationId)}
                              >
                                {deletingQuotationId === quotation.id ? 'Deleting…' : 'Delete quotation'}
                              </button>
                            </div>
                          </div>
                          <dl className="quotation-record-grid">
                            <div><dt>Phone</dt><dd>{quotation.phone || '—'}</dd></div>
                            <div><dt>Billing address</dt><dd>{quotation.address || '—'}</dd></div>
                            <div><dt>Enquiry reference</dt><dd>{quotation.enquiryReference || '—'}</dd></div>
                            <div><dt>Enquiry date</dt><dd>{quotation.enquiryDate || '—'}</dd></div>
                            <div><dt>Kind attention</dt><dd>{quotation.attention || '—'}</dd></div>
                            <div><dt>Region / area</dt><dd>{quotation.region || '—'}</dd></div>
                            <div><dt>Freight</dt><dd>{quotation.freight || quotation.freightTerms || '—'}</dd></div>
                            <div><dt>Delivery terms</dt><dd>{getQuotationTerm(quotation, 'deliveryTerms', 'Delivery') || '—'}</dd></div>
                            <div><dt>Payment terms</dt><dd>{getQuotationTerm(quotation, 'paymentTerms', 'Payment') || '—'}</dd></div>
                            <div><dt>Validity terms</dt><dd>{getQuotationTerm(quotation, 'validityTerms', 'Validity') || '—'}</dd></div>
                          </dl>
                          <div className="quotation-record-items-wrap">
                            <table className="quotation-record-items">
                              <thead>
                                <tr>
                                  <th>Description</th>
                                  <th>HSN</th>
                                  <th>Make</th>
                                  <th>Qty</th>
                                  <th>Unit price</th>
                                  <th>Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(quotation.items || []).map((item, index) => (
                                  <tr key={`${quotation.id}-item-${index}`}>
                                    <td>{item.description}</td>
                                    <td>{item.hsnCode || '—'}</td>
                                    <td>{item.make || '—'}</td>
                                    <td>{item.quantity}</td>
                                    <td>{formatCurrency(item.unitPrice)}</td>
                                    <td>{formatCurrency(item.amount ?? item.quantity * item.unitPrice)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div className="quotation-record-totals">
                            <p>Subtotal <strong>{formatCurrency(quotation.subtotal ?? quotation.total)}</strong></p>
                            <p>P&amp;F ({quotation.packingChargeRate ?? 0}%) <strong>{formatCurrency(quotation.packingCharge ?? 0)}</strong></p>
                            <p>GST ({quotation.gstRate ?? 0}%) <strong>{formatCurrency(quotation.gstAmount ?? 0)}</strong></p>
                            <p className="quotation-grand-total">Grand total <strong>{formatCurrency(quotation.total)}</strong></p>
                            <p className="quotation-record-amount-words">
                              Total in words: {numberToWords(quotation.total)}
                            </p>
                          </div>
                          {quotation.notes && <p className="quotation-record-notes">{quotation.notes}</p>}
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
          <section className="quotation-modal" role="dialog" aria-modal="true" aria-labelledby="quotation-modal-title">
            <header className="quotation-modal-header">
              <div>
                <p className="dashboard-eyebrow">NEW DOCUMENT</p>
                <h2 id="quotation-modal-title">{editingQuotation ? 'Edit quotation' : 'Create quotation'}</h2>
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
                <legend>Quotation and customer details</legend>
                <div className="quotation-form-grid">
                  <label className="quotation-field">
                    <span>{editingQuotation ? 'Quotation number' : 'Source quotation number'}</span>
                    <input type="text" value={editingQuotation?.id || formDefaults.id || 'Generated when saved'} readOnly />
                  </label>
                  <label className="quotation-field">
                    <span>Customer name <b>*</b></span>
                    <input name="customerName" type="text" autoComplete="name" defaultValue={formDefaults.customerName || ''} required />
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
                    <span>Quotation date <b>*</b></span>
                    <input name="quotationDate" type="date" defaultValue={formDefaults.quotationDate || getLocalDateString()} required />
                  </label>
                  <label className="quotation-field">
                    <span>Valid until</span>
                    <input name="validUntil" type="date" defaultValue={formDefaults.validUntil || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>Kind attention</span>
                    <input name="attention" type="text" defaultValue={formDefaults.attention || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>Region / area</span>
                    <input name="region" type="text" defaultValue={formDefaults.region || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>Freight</span>
                    <input name="freight" type="text" placeholder="e.g. To-Pay" defaultValue={formDefaults.freight || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>Enquiry reference</span>
                    <input name="enquiryReference" type="text" defaultValue={formDefaults.enquiryReference || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>Enquiry date</span>
                    <input name="enquiryDate" type="date" defaultValue={formDefaults.enquiryDate || ''} />
                  </label>
                  <label className="quotation-field quotation-field-full">
                    <span>Billing address</span>
                    <textarea name="address" rows="2" autoComplete="street-address" defaultValue={formDefaults.address || ''} />
                  </label>
                </div>
              </fieldset>

              <fieldset className="quotation-fieldset quotation-items-fieldset" disabled={isSaving}>
                <legend>Quoted items</legend>
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
                      <label className="quotation-field quotation-item-hsn">
                        <span>HSN code</span>
                        <input
                          type="text"
                          value={item.hsnCode}
                          onChange={(event) => updateItem(index, 'hsnCode', event.target.value)}
                        />
                      </label>
                      <label className="quotation-field quotation-item-make">
                        <span>Make</span>
                        <input
                          type="text"
                          value={item.make}
                          onChange={(event) => updateItem(index, 'make', event.target.value)}
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
                      <span className="quotation-item-amount">
                        <span>Amount</span>
                        <strong>{formatCurrency((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0))}</strong>
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

              <fieldset className="quotation-fieldset quotation-terms-fieldset" disabled={isSaving}>
                <legend>Terms and charges</legend>
                <div className="quotation-form-grid">
                  <label className="quotation-field">
                    <span>Delivery</span>
                    <input name="deliveryTerms" type="text" placeholder="e.g. 8-10 Weeks" defaultValue={getQuotationTerm(formDefaults, 'deliveryTerms', 'Delivery')} />
                  </label>
                  <label className="quotation-field">
                    <span>Payment</span>
                    <input name="paymentTerms" type="text" placeholder="e.g. 50% Advance, balance against delivery" defaultValue={getQuotationTerm(formDefaults, 'paymentTerms', 'Payment')} />
                  </label>
                  <label className="quotation-field">
                    <span>Validity terms</span>
                    <input name="validityTerms" type="text" defaultValue={getQuotationTerm(formDefaults, 'validityTerms', 'Validity') || '30 Days from date of offer'} />
                  </label>
                  <label className="quotation-field">
                    <span>Freight terms</span>
                    <input name="freightTerms" type="text" placeholder="e.g. To-Pay" defaultValue={formDefaults.freightTerms || ''} />
                  </label>
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
                    <span>GST (%)</span>
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
                </div>
              </fieldset>

              <label className="quotation-field quotation-notes-field">
                <span>Notes</span>
                <textarea name="notes" rows="2" placeholder="Additional terms or details" defaultValue={formDefaults.notes || ''} disabled={isSaving} />
              </label>

              <div className="quotation-total-breakdown">
                <p>Sub total <strong>{formatCurrency(subtotal)}</strong></p>
                <p>P&amp;F charges <strong>{formatCurrency(packingCharge)}</strong></p>
                <p>GST ({Number(gstRate) || 0}%) <strong>{formatCurrency(gstAmount)}</strong></p>
                <p className="quotation-grand-total">Grand total <strong>{formatCurrency(grandTotal)}</strong></p>
                <label className="quotation-field quotation-total-words">
                  <span>Total in words</span>
                  <input type="text" value={numberToWords(grandTotal)} readOnly />
                </label>
              </div>

              {formError && <p className="quotation-alert quotation-alert-error" role="alert">{formError}</p>}

              <footer className="quotation-form-actions">
                <button className="quotation-cancel-button" type="button" onClick={() => setIsModalOpen(false)} disabled={isSaving}>
                  Cancel
                </button>
                <button className="quotation-create-button" type="submit" disabled={isSaving}>
                  {isSaving ? (editingQuotation ? 'Updating…' : 'Saving…') : (editingQuotation ? 'Update quotation' : 'Save quotation')}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {printQuotation && (
        <article className="quotation-print-document" id="quotation-print-document">
          <header className="quotation-print-company">
            <div className="quotation-print-brand-mark">TE</div>
            <div>
              <h1>TOLETI ENTERPRISES</h1>
              <p>1-1-287/20, Bapunagar, Street No. 4, Chikkadpally, Hyderabad-500020, Telangana</p>
              <p>Cell No.: 9885480036 / 8121494837 | Mail: toletienterprises@gmail.com</p>
              <p>GSTN No.: 36AKUPG7555J1ZG | IEC &amp; PAN No.: AKUPG7555J</p>
            </div>
          </header>

          <h2 className="quotation-print-title">QUOTATION</h2>

          <section className="quotation-print-parties">
            <div className="quotation-print-bill-to">
              <strong>To:</strong>
              <strong>{printQuotation.customerName}</strong>
              {printQuotation.address && <p>{printQuotation.address}</p>}
              {printQuotation.email && <p>Email: {printQuotation.email}</p>}
              {printQuotation.phone && <p>Contact: {printQuotation.phone}</p>}
            </div>
            <dl>
              <div><dt>Quotation No.</dt><dd>{printQuotation.id}</dd></div>
              <div><dt>Date</dt><dd>{printQuotation.quotationDate || '—'}</dd></div>
              <div><dt>Valid until</dt><dd>{printQuotation.validUntil || '—'}</dd></div>
              <div><dt>Kind attention</dt><dd>{printQuotation.attention || '—'}</dd></div>
              <div><dt>Region / area</dt><dd>{printQuotation.region || '—'}</dd></div>
              <div><dt>Contact number</dt><dd>{printQuotation.phone || '—'}</dd></div>
              <div><dt>Freight</dt><dd>{printQuotation.freight || printQuotation.freightTerms || '—'}</dd></div>
            </dl>
          </section>

          {printQuotation.enquiryDate && (
            <p className="quotation-print-reference">
              This quotation refers to enquiry dated {printQuotation.enquiryDate}
              {printQuotation.enquiryReference ? ` (${printQuotation.enquiryReference})` : ''}.
            </p>
          )}

          <table className="quotation-print-items">
            <thead>
              <tr>
                <th>Sl. No.</th>
                <th>Description</th>
                <th>HSN Code</th>
                <th>Make</th>
                <th>Qty</th>
                <th>Unit Price</th>
                <th>Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {(printQuotation.items || []).map((item, index) => (
                <tr key={`${printQuotation.id}-print-item-${index}`}>
                  <td>{String(index + 1).padStart(2, '0')}</td>
                  <td>{item.description}</td>
                  <td>{item.hsnCode || '—'}</td>
                  <td>{item.make || '—'}</td>
                  <td>{item.quantity}</td>
                  <td>{formatCurrency(item.unitPrice)}</td>
                  <td>{formatCurrency(item.amount ?? item.quantity * item.unitPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <section className="quotation-print-bottom">
            <div className="quotation-print-terms">
              <strong>Terms and Conditions:</strong>
              <p>Delivery: {getQuotationTerm(printQuotation, 'deliveryTerms', 'Delivery') || '—'}</p>
              <p>Payment: {getQuotationTerm(printQuotation, 'paymentTerms', 'Payment') || '—'}</p>
              <p>Validity: {getQuotationTerm(printQuotation, 'validityTerms', 'Validity') || '—'}</p>
              <p>Freight: {printQuotation.freight || printQuotation.freightTerms || '—'}</p>
              {printQuotation.notes && <p className="quotation-print-notes">{printQuotation.notes}</p>}
            </div>
            <table className="quotation-print-totals">
              <tbody>
                <tr><th>Sub Total</th><td>{formatCurrency(printQuotation.subtotal ?? printQuotation.total)}</td></tr>
                <tr><th>P&amp;F Charges @ {printQuotation.packingChargeRate ?? 0}%</th><td>{formatCurrency(printQuotation.packingCharge ?? 0)}</td></tr>
                <tr><th>Taxable Total</th><td>{formatCurrency((printQuotation.subtotal ?? printQuotation.total) + (printQuotation.packingCharge ?? 0))}</td></tr>
                <tr><th>GST @ {printQuotation.gstRate ?? 0}%</th><td>{formatCurrency(printQuotation.gstAmount ?? 0)}</td></tr>
                <tr className="quotation-print-grand-total"><th>Grand Total</th><td>{formatCurrency(printQuotation.total)}</td></tr>
              </tbody>
            </table>
          </section>

          <p className="quotation-print-words">
            <strong>Total in words:</strong> {numberToWords(printQuotation.total)}
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

export default Quotation
