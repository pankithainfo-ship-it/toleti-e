import { Fragment, useEffect, useState } from 'react'

const createEmptyItem = () => ({
  description: '',
  hsnCode: '',
  productCode: '',
  make: '',
  quantity: '1',
  rate: '0',
})

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount)
}

async function readApiResponse(response) {
  const responseBody = await response.text()
  let data

  try {
    data = JSON.parse(responseBody)
  } catch {
    throw new Error(
      `The delivery challan API returned an invalid response (HTTP ${response.status}). `
      + 'Stop the old development server and restart with npm run dev.',
    )
  }

  if (!response.ok) {
    throw new Error(data.error || `The delivery challan API returned HTTP ${response.status}.`)
  }

  return data
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
  return `${rupeeWords} Rupees${paise ? ` and ${underThousand(paise)} Paise` : ''} Only`
}

function DeliveryChallan({ onBack }) {
  const [challans, setChallans] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editingChallan, setEditingChallan] = useState(null)
  const [deletingChallanId, setDeletingChallanId] = useState('')
  const [items, setItems] = useState([createEmptyItem()])
  const [formDefaults, setFormDefaults] = useState({})
  const [expandedChallanId, setExpandedChallanId] = useState('')
  const [printChallan, setPrintChallan] = useState(null)
  const [formError, setFormError] = useState('')
  const [actionError, setActionError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    if (!printChallan) return undefined

    const handleAfterPrint = () => setPrintChallan(null)
    window.addEventListener('afterprint', handleAfterPrint)
    const printFrame = window.requestAnimationFrame(() => window.print())

    return () => {
      window.cancelAnimationFrame(printFrame)
      window.removeEventListener('afterprint', handleAfterPrint)
    }
  }, [printChallan])

  useEffect(() => {
    let isCurrent = true

    async function loadChallans() {
      setIsLoading(true)
      setLoadError('')

      try {
        const response = await fetch('/api/delivery-challans')
        const result = await readApiResponse(response)
        if (!Array.isArray(result)) {
          throw new Error('The delivery challan server returned invalid data.')
        }
        if (isCurrent) setChallans(result)
      } catch (error) {
        if (isCurrent) {
          setLoadError(error instanceof Error ? error.message : 'Could not load delivery challans.')
        }
      } finally {
        if (isCurrent) setIsLoading(false)
      }
    }

    loadChallans()
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
    const challanItems = items.map((item) => ({
      description: item.description.trim(),
      quantity: Number(item.quantity),
    }))

    if (challanItems.some((item) => (
      !item.description || !Number.isFinite(item.quantity) || item.quantity <= 0
    ))) {
      setFormError('Enter a description and positive quantity for each item.')
      return
    }

    const challan = {
      customerName: String(formData.get('customerName') || '').trim(),
      email: String(formData.get('email') || '').trim(),
      phone: String(formData.get('phone') || '').trim(),
      customerGstNumber: String(formData.get('customerGstNumber') || '').trim(),
      customerPanNumber: String(formData.get('customerPanNumber') || '').trim(),
      billingAddress: String(formData.get('billingAddress') || '').trim(),
      deliveryAddress: String(formData.get('deliveryAddress') || '').trim(),
      dispatchDate: String(formData.get('dispatchDate') || ''),
      invoiceNumber: String(formData.get('invoiceNumber') || '').trim(),
      purchaseOrderNumber: String(formData.get('purchaseOrderNumber') || '').trim(),
      purchaseOrderDate: String(formData.get('purchaseOrderDate') || ''),
      paymentTerms: String(formData.get('paymentTerms') || '').trim(),
      regionCode: String(formData.get('regionCode') || '').trim(),
      numberOfPackages: String(formData.get('numberOfPackages') || '').trim(),
      contactPerson: String(formData.get('contactPerson') || '').trim(),
      transporter: String(formData.get('transporter') || '').trim(),
      dispatchThrough: String(formData.get('dispatchThrough') || '').trim(),
      vehicleNumber: String(formData.get('vehicleNumber') || '').trim(),
      reference: String(formData.get('reference') || '').trim(),
      notes: String(formData.get('notes') || '').trim(),
      items: items.map((item, index) => ({
        ...challanItems[index],
        hsnCode: item.hsnCode.trim(),
        productCode: item.productCode.trim(),
        make: item.make.trim(),
        rate: Number(item.rate),
      })),
    }

    if (challan.items.some((item) => !Number.isFinite(item.rate) || item.rate < 0)) {
      setFormError('Enter a valid non-negative rate for each item.')
      return
    }

    setIsSaving(true)

    try {
      const response = await fetch(
        editingChallan
          ? `/api/delivery-challans/${encodeURIComponent(editingChallan.id)}`
          : '/api/delivery-challans',
        {
          method: editingChallan ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(challan),
        },
      )
      const savedChallan = await readApiResponse(response)

      setChallans((current) => editingChallan
        ? current.map((entry) => (entry.id === savedChallan.id ? savedChallan : entry))
        : [savedChallan, ...current])
      setIsModalOpen(false)
      setEditingChallan(null)
      setItems([createEmptyItem()])
      setSuccessMessage(editingChallan
        ? `Delivery challan ${savedChallan.id} was updated.`
        : `Delivery challan ${savedChallan.id} was saved to delivery challance.json.`)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not save the delivery challan.')
    } finally {
      setIsSaving(false)
    }
  }

  function openChallanForm(challan) {
    setEditingChallan(challan)
    setFormDefaults(challan)
    setItems(Array.isArray(challan.items) && challan.items.length > 0
      ? challan.items.map((item) => ({
        description: item.description || '',
        hsnCode: item.hsnCode || '',
        productCode: item.productCode || '',
        make: item.make || '',
        quantity: String(item.quantity ?? '1'),
        rate: String(item.rate ?? '0'),
      }))
      : [createEmptyItem()])
    setFormError('')
    setActionError('')
    setSuccessMessage('')
    setIsModalOpen(true)
  }

  async function handleDelete(challan) {
    if (!window.confirm(`Delete delivery challan ${challan.id} for ${challan.customerName}? This cannot be undone.`)) {
      return
    }

    setDeletingChallanId(challan.id)
    setActionError('')
    setSuccessMessage('')

    try {
      const response = await fetch(`/api/delivery-challans/${encodeURIComponent(challan.id)}`, {
        method: 'DELETE',
      })
      await readApiResponse(response)
      setChallans((current) => current.filter((entry) => entry.id !== challan.id))
      setExpandedChallanId((current) => (current === challan.id ? '' : current))
      setSuccessMessage(`Delivery challan ${challan.id} was deleted.`)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not delete the delivery challan.')
    } finally {
      setDeletingChallanId('')
    }
  }

  const totalAmount = Math.round(items.reduce((sum, item) => (
    sum + (Number(item.quantity) || 0) * (Number(item.rate) || 0)
  ), 0) * 100) / 100

  return (
    <section className="quotation-page delivery-challan-page">
      <div className="quotation-heading">
        <div>
          <p className="dashboard-eyebrow">DOCUMENTS</p>
          <h1>Delivery Challan</h1>
          <p className="dashboard-description">Create and manage goods dispatched to your customers.</p>
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
              setEditingChallan(null)
              setFormDefaults({})
              setItems([createEmptyItem()])
              setFormError('')
              setActionError('')
              setSuccessMessage('')
              setIsModalOpen(true)
            }}
          >
            <span aria-hidden="true">+</span> New delivery challan
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
        <span className="quotation-summary-icon" aria-hidden="true">DC</span>
        <div>
          <p className="quotation-summary-label">Saved delivery challans</p>
          <p className="quotation-summary-number">{isLoading ? '…' : challans.length}</p>
        </div>
      </div>

      <div className="quotation-list-heading">
        <h2>Recent delivery challans</h2>
        {!isLoading && challans.length > 0 && (
          <span>{challans.length} {challans.length === 1 ? 'challan' : 'challans'}</span>
        )}
      </div>

      {isLoading ? (
        <div className="quotation-empty-state" role="status">
          <p>Loading delivery challans…</p>
        </div>
      ) : challans.length === 0 ? (
        <div className="quotation-empty-state">
          <span className="empty-state-icon" aria-hidden="true">DC</span>
          <h2>No delivery challans yet</h2>
          <p>Create a delivery challan to see it listed here.</p>
        </div>
      ) : (
        <div className="quotation-table-wrap">
          <table className="quotation-table">
            <thead>
              <tr>
                <th scope="col">Challan</th>
                <th scope="col">Customer</th>
                <th scope="col">Dispatch date</th>
                <th scope="col">Reference</th>
                <th scope="col">Items</th>
                <th scope="col">Quantity</th>
                <th scope="col">Details</th>
              </tr>
            </thead>
            <tbody>
              {challans.map((challan) => (
                <Fragment key={challan.id}>
                  <tr>
                    <td className="quotation-number">{challan.id}</td>
                    <td>
                      <span className="quotation-customer">{challan.customerName}</span>
                      {challan.email && <span className="quotation-customer-email">{challan.email}</span>}
                    </td>
                    <td>{challan.dispatchDate}</td>
                    <td>{challan.reference || '—'}</td>
                    <td>{challan.items?.length ?? 0}</td>
                    <td>{challan.totalQuantity ?? (challan.items || []).reduce((sum, item) => sum + item.quantity, 0)}</td>
                    <td>
                      <button
                        className="quotation-details-toggle"
                        type="button"
                        aria-expanded={expandedChallanId === challan.id}
                        aria-controls={`delivery-challan-details-${challan.id}`}
                        onClick={() => setExpandedChallanId((current) => (
                          current === challan.id ? '' : challan.id
                        ))}
                      >
                        {expandedChallanId === challan.id ? 'Hide' : 'View'}
                      </button>
                    </td>
                  </tr>
                  {expandedChallanId === challan.id && (
                    <tr key={`${challan.id}-details`}>
                      <td colSpan="7">
                        <section
                          className="quotation-record-details"
                          id={`delivery-challan-details-${challan.id}`}
                        >
                          <div className="quotation-record-toolbar">
                            <span>Delivery challan details</span>
                            <div className="quotation-record-actions">
                              <button
                                className="quotation-print-button"
                                type="button"
                                onClick={() => setPrintChallan(challan)}
                              >
                                Print delivery challan
                              </button>
                              <button
                                className="quotation-edit-button"
                                type="button"
                                onClick={() => openChallanForm(challan)}
                                disabled={Boolean(deletingChallanId)}
                              >
                                Edit delivery challan
                              </button>
                              <button
                                className="quotation-delete-button"
                                type="button"
                                onClick={() => handleDelete(challan)}
                                disabled={Boolean(deletingChallanId)}
                              >
                                {deletingChallanId === challan.id ? 'Deleting…' : 'Delete delivery challan'}
                              </button>
                            </div>
                          </div>
                          <dl className="quotation-record-grid">
                            <div><dt>Email</dt><dd>{challan.email || '—'}</dd></div>
                            <div><dt>Phone</dt><dd>{challan.phone || '—'}</dd></div>
                            <div><dt>Customer GST number</dt><dd>{challan.customerGstNumber || '—'}</dd></div>
                            <div><dt>Customer PAN number</dt><dd>{challan.customerPanNumber || '—'}</dd></div>
                            <div><dt>Billing address</dt><dd>{challan.billingAddress || '—'}</dd></div>
                            <div><dt>Delivery address</dt><dd>{challan.deliveryAddress || '—'}</dd></div>
                            <div><dt>Invoice number</dt><dd>{challan.invoiceNumber || '—'}</dd></div>
                            <div><dt>Purchase order number</dt><dd>{challan.purchaseOrderNumber || '—'}</dd></div>
                            <div><dt>Purchase order date</dt><dd>{challan.purchaseOrderDate || '—'}</dd></div>
                            <div><dt>Payment terms</dt><dd>{challan.paymentTerms || '—'}</dd></div>
                            <div><dt>Region / area code</dt><dd>{challan.regionCode || '—'}</dd></div>
                            <div><dt>Number of packages</dt><dd>{challan.numberOfPackages || '—'}</dd></div>
                            <div><dt>Contact person</dt><dd>{challan.contactPerson || '—'}</dd></div>
                            <div><dt>Dispatch through</dt><dd>{challan.dispatchThrough || '—'}</dd></div>
                            <div><dt>Transporter</dt><dd>{challan.transporter || '—'}</dd></div>
                            <div><dt>Vehicle number</dt><dd>{challan.vehicleNumber || '—'}</dd></div>
                            <div><dt>Reference</dt><dd>{challan.reference || '—'}</dd></div>
                          </dl>
                          <div className="quotation-record-items-wrap">
                            <table className="quotation-record-items">
                              <thead>
                                <tr>
                                  <th>Description</th>
                                  <th>Product code</th>
                                  <th>HSN</th>
                                  <th>Make</th>
                                  <th>Qty</th>
                                  <th>Rate</th>
                                  <th>Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(challan.items || []).map((item, index) => (
                                  <tr key={`${challan.id}-item-${index}`}>
                                    <td>{item.description}</td>
                                    <td>{item.productCode || '—'}</td>
                                    <td>{item.hsnCode || '—'}</td>
                                    <td>{item.make || '—'}</td>
                                    <td>{item.quantity}</td>
                                    <td>{formatCurrency(item.rate ?? 0)}</td>
                                    <td>{formatCurrency(item.amount ?? item.quantity * (item.rate ?? 0))}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div className="quotation-record-totals">
                            <p>Total quantity <strong>{challan.totalQuantity ?? (challan.items || []).reduce((sum, item) => sum + item.quantity, 0)}</strong></p>
                            <p className="quotation-grand-total">Total goods value <strong>{formatCurrency(challan.totalAmount ?? 0)}</strong></p>
                          </div>
                          {challan.notes && <p className="quotation-record-notes">{challan.notes}</p>}
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
            aria-labelledby="delivery-challan-modal-title"
          >
            <header className="quotation-modal-header">
              <div>
                <p className="dashboard-eyebrow">NEW DOCUMENT</p>
                <h2 id="delivery-challan-modal-title">
                  {editingChallan ? 'Edit delivery challan' : 'Create delivery challan'}
                </h2>
              </div>
              <button
                className="quotation-close-button"
                type="button"
                aria-label="Close delivery challan form"
                onClick={() => setIsModalOpen(false)}
                disabled={isSaving}
              >
                ×
              </button>
            </header>

            <form className="quotation-form" onSubmit={handleSubmit}>
              <fieldset className="quotation-fieldset" disabled={isSaving}>
                <legend>Challan, buyer, and delivery details</legend>
                <div className="quotation-form-grid">
                  <label className="quotation-field">
                    <span>Delivery challan number</span>
                    <input type="text" value={editingChallan?.id || 'Generated when saved'} readOnly />
                  </label>
                  <label className="quotation-field">
                    <span>Customer name <b>*</b></span>
                    <input name="customerName" type="text" autoComplete="name" defaultValue={formDefaults.customerName || ''} required />
                  </label>
                  <label className="quotation-field">
                    <span>Invoice number</span>
                    <input name="invoiceNumber" type="text" defaultValue={formDefaults.invoiceNumber || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>Dispatch date <b>*</b></span>
                    <input name="dispatchDate" type="date" defaultValue={formDefaults.dispatchDate || getLocalDateString()} required />
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
                    <span>Terms of payment</span>
                    <input name="paymentTerms" type="text" defaultValue={formDefaults.paymentTerms || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>Region / area code</span>
                    <input name="regionCode" type="text" defaultValue={formDefaults.regionCode || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>Number of packages</span>
                    <input name="numberOfPackages" type="text" defaultValue={formDefaults.numberOfPackages || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>Email address</span>
                    <input name="email" type="email" autoComplete="email" defaultValue={formDefaults.email || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>Customer GST number</span>
                    <input name="customerGstNumber" type="text" defaultValue={formDefaults.customerGstNumber || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>Customer PAN number</span>
                    <input name="customerPanNumber" type="text" defaultValue={formDefaults.customerPanNumber || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>Phone number</span>
                    <input name="phone" type="tel" autoComplete="tel" defaultValue={formDefaults.phone || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>Contact person</span>
                    <input name="contactPerson" type="text" defaultValue={formDefaults.contactPerson || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>Dispatch through</span>
                    <input name="dispatchThrough" type="text" defaultValue={formDefaults.dispatchThrough || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>Transporter</span>
                    <input name="transporter" type="text" defaultValue={formDefaults.transporter || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>Vehicle number</span>
                    <input name="vehicleNumber" type="text" defaultValue={formDefaults.vehicleNumber || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>Reference</span>
                    <input name="reference" type="text" defaultValue={formDefaults.reference || ''} />
                  </label>
                  <label className="quotation-field quotation-field-full">
                    <span>Bill to address</span>
                    <textarea name="billingAddress" rows="2" autoComplete="street-address" defaultValue={formDefaults.billingAddress || ''} />
                  </label>
                  <label className="quotation-field quotation-field-full">
                    <span>Delivery address <b>*</b></span>
                    <textarea name="deliveryAddress" rows="2" autoComplete="street-address" defaultValue={formDefaults.deliveryAddress || ''} required />
                  </label>
                </div>
              </fieldset>

              <fieldset className="quotation-fieldset quotation-items-fieldset" disabled={isSaving}>
                <legend>Goods dispatched</legend>
                <div className="quotation-items">
                  {items.map((item, index) => (
                    <div className="quotation-item-row delivery-challan-goods-row" key={index}>
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
                      <label className="quotation-field">
                        <span>Make</span>
                        <input
                          type="text"
                          value={item.make}
                          onChange={(event) => updateItem(index, 'make', event.target.value)}
                        />
                      </label>
                      <label className="quotation-field">
                        <span>Quantity <b>*</b></span>
                        <input
                          type="number"
                          min="0.01"
                          step="any"
                          value={item.quantity}
                          onChange={(event) => updateItem(index, 'quantity', event.target.value)}
                          required
                        />
                      </label>
                      <label className="quotation-field">
                        <span>Rate (₹)</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.rate}
                          onChange={(event) => updateItem(index, 'rate', event.target.value)}
                        />
                      </label>
                      <span className="quotation-item-amount">
                        <span>Amount</span>
                        <strong>{formatCurrency((Number(item.quantity) || 0) * (Number(item.rate) || 0))}</strong>
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

              <label className="quotation-field quotation-notes-field">
                <span>Notes</span>
                <textarea name="notes" rows="2" placeholder="Additional delivery details" defaultValue={formDefaults.notes || ''} disabled={isSaving} />
              </label>

              <div className="quotation-total-breakdown">
                <p className="quotation-grand-total">
                  Total goods value <strong>{formatCurrency(totalAmount)}</strong>
                </p>
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
                    ? (editingChallan ? 'Updating…' : 'Saving…')
                    : (editingChallan ? 'Update delivery challan' : 'Save delivery challan')}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {printChallan && (
        <article className="quotation-print-document delivery-challan-print-document" id="delivery-challan-print-document">
          <header className="quotation-print-company">
            <div className="quotation-print-brand-mark">TE</div>
            <div>
              <h1>TOLETI ENTERPRISES</h1>
              <p>1-1-287/20, Bapunagar, Street No. 4, Chikkadpally, Hyderabad-500020, Telangana</p>
              <p>Cell No.: 9885480036 / 8121494837 | Mail: toletienterprises@gmail.com</p>
              <p>GSTN No.: 36AKUPG7555J1ZG | IEC &amp; PAN No.: AKUPG7555J</p>
            </div>
          </header>

          <h2 className="quotation-print-title">DELIVERY CHALLAN</h2>

          <section className="quotation-print-parties">
            <div className="quotation-print-bill-to">
              <strong>Bill to:</strong>
              <strong>{printChallan.customerName}</strong>
              {printChallan.billingAddress && <p>{printChallan.billingAddress}</p>}
              {printChallan.customerGstNumber && <p>GSTIN: {printChallan.customerGstNumber}</p>}
              {printChallan.customerPanNumber && <p>PAN: {printChallan.customerPanNumber}</p>}
              {printChallan.email && <p>Email: {printChallan.email}</p>}
              {printChallan.phone && <p>Contact: {printChallan.phone}</p>}
            </div>
            <dl>
              <div><dt>Challan No.</dt><dd>{printChallan.id}</dd></div>
              <div><dt>Dispatch date</dt><dd>{printChallan.dispatchDate || '—'}</dd></div>
              <div><dt>Invoice No.</dt><dd>{printChallan.invoiceNumber || '—'}</dd></div>
              <div><dt>Purchase order No.</dt><dd>{printChallan.purchaseOrderNumber || '—'}</dd></div>
              <div><dt>Purchase order date</dt><dd>{printChallan.purchaseOrderDate || '—'}</dd></div>
              <div><dt>Reference</dt><dd>{printChallan.reference || '—'}</dd></div>
            </dl>
          </section>

          <section className="delivery-challan-print-delivery">
            <strong>Ship to:</strong>
            <p>{printChallan.deliveryAddress}</p>
            {printChallan.customerGstNumber && <p>GSTIN: {printChallan.customerGstNumber}</p>}
          </section>

          <table className="quotation-print-items delivery-challan-print-items">
            <thead>
              <tr>
                <th>Sl. No.</th>
                <th>Description</th>
                <th>Product Code</th>
                <th>HSN Code</th>
                <th>Make</th>
                <th>Qty</th>
                <th>Rate (₹)</th>
                <th>Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {(printChallan.items || []).map((item, index) => (
                <tr key={`${printChallan.id}-print-item-${index}`}>
                  <td>{String(index + 1).padStart(2, '0')}</td>
                  <td>{item.description}</td>
                  <td>{item.productCode || '—'}</td>
                  <td>{item.hsnCode || '—'}</td>
                  <td>{item.make || '—'}</td>
                  <td>{item.quantity}</td>
                  <td>{formatCurrency(item.rate ?? 0)}</td>
                  <td>{formatCurrency(item.amount ?? item.quantity * (item.rate ?? 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <section className="quotation-print-bottom delivery-challan-print-bottom">
            <div className="quotation-print-terms">
              <strong>Dispatch details:</strong>
              <p>Payment terms: {printChallan.paymentTerms || '—'}</p>
              <p>Region / area code: {printChallan.regionCode || '—'}</p>
              <p>Number of packages: {printChallan.numberOfPackages || '—'}</p>
              <p>Contact person: {printChallan.contactPerson || '—'}</p>
              <p>Dispatch through: {printChallan.dispatchThrough || '—'}</p>
              <p>Transporter: {printChallan.transporter || '—'}</p>
              <p>Vehicle number: {printChallan.vehicleNumber || '—'}</p>
              {printChallan.notes && <p className="quotation-print-notes">{printChallan.notes}</p>}
            </div>
            <table className="quotation-print-totals">
              <tbody>
                <tr>
                  <th>Total quantity</th>
                  <td>{printChallan.totalQuantity ?? (printChallan.items || []).reduce((sum, item) => sum + item.quantity, 0)}</td>
                </tr>
                <tr className="quotation-print-grand-total">
                  <th>Total goods value</th>
                  <td>{formatCurrency(printChallan.totalAmount ?? 0)}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <p className="quotation-print-words">
            <strong>Goods value in words:</strong> {numberToWords(printChallan.totalAmount ?? 0)}
          </p>

          <footer className="quotation-print-signature">
            <strong>Received the above goods in good condition</strong>
            <div className="quotation-print-signature-space" />
            <strong>Customer signature / For Toleti Enterprises</strong>
          </footer>
        </article>
      )}
    </section>
  )
}

export default DeliveryChallan
