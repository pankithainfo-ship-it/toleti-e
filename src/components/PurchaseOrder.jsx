import { Fragment, useEffect, useState } from 'react'

const createEmptyItem = () => ({
  description: '',
  hsnCode: '',
  productCode: '',
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
      `The purchase order API returned an invalid response (HTTP ${response.status}). `
      + 'Stop the old development server and restart with npm run dev.',
    )
  }

  if (!response.ok) {
    throw new Error(data.error || `The purchase order API returned HTTP ${response.status}.`)
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

function PurchaseOrder({ onBack }) {
  const [purchaseOrders, setPurchaseOrders] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editingPurchaseOrder, setEditingPurchaseOrder] = useState(null)
  const [deletingPurchaseOrderId, setDeletingPurchaseOrderId] = useState('')
  const [items, setItems] = useState([createEmptyItem()])
  const [packingChargeRate, setPackingChargeRate] = useState('1')
  const [gstRate, setGstRate] = useState('18')
  const [formDefaults, setFormDefaults] = useState({})
  const [expandedPurchaseOrderId, setExpandedPurchaseOrderId] = useState('')
  const [printPurchaseOrder, setPrintPurchaseOrder] = useState(null)
  const [formError, setFormError] = useState('')
  const [actionError, setActionError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    if (!printPurchaseOrder) return undefined

    const handleAfterPrint = () => setPrintPurchaseOrder(null)
    window.addEventListener('afterprint', handleAfterPrint)
    const printFrame = window.requestAnimationFrame(() => window.print())

    return () => {
      window.cancelAnimationFrame(printFrame)
      window.removeEventListener('afterprint', handleAfterPrint)
    }
  }, [printPurchaseOrder])

  useEffect(() => {
    let isCurrent = true

    async function loadPurchaseOrders() {
      setIsLoading(true)
      setLoadError('')

      try {
        const response = await fetch('/api/purchase-orders')
        const result = await readApiResponse(response)
        if (!Array.isArray(result)) {
          throw new Error('The purchase order server returned invalid data.')
        }
        if (isCurrent) setPurchaseOrders(result)
      } catch (error) {
        if (isCurrent) {
          setLoadError(error instanceof Error ? error.message : 'Could not load purchase orders.')
        }
      } finally {
        if (isCurrent) setIsLoading(false)
      }
    }

    loadPurchaseOrders()
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
    const orderDate = String(formData.get('orderDate') || '')
    const expectedDelivery = String(formData.get('expectedDelivery') || '')
    const orderItems = items.map((item) => ({
      description: item.description.trim(),
      hsnCode: item.hsnCode.trim(),
      productCode: item.productCode.trim(),
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
    }))

    if (orderItems.some((item) => (
      !item.description || !Number.isFinite(item.quantity) || item.quantity <= 0
      || !Number.isFinite(item.unitPrice) || item.unitPrice < 0
    ))) {
      setFormError('Enter a description, positive quantity, and valid unit price for each item.')
      return
    }

    if (expectedDelivery && expectedDelivery < orderDate) {
      setFormError('The expected delivery date cannot be earlier than the order date.')
      return
    }

    const purchaseOrder = {
      supplierName: String(formData.get('supplierName') || '').trim(),
      email: String(formData.get('email') || '').trim(),
      phone: String(formData.get('phone') || '').trim(),
      address: String(formData.get('address') || '').trim(),
      orderDate,
      expectedDelivery,
      offerNumber: String(formData.get('offerNumber') || '').trim(),
      offerDate: String(formData.get('offerDate') || ''),
      dispatchMode: String(formData.get('dispatchMode') || '').trim(),
      freightTerms: String(formData.get('freightTerms') || '').trim(),
      paymentTerms: String(formData.get('paymentTerms') || '').trim(),
      discountTerms: String(formData.get('discountTerms') || '').trim(),
      gstNumber: String(formData.get('gstNumber') || '').trim(),
      panNumber: String(formData.get('panNumber') || '').trim(),
      packingChargeRate: Number(formData.get('packingChargeRate')),
      gstRate: Number(formData.get('gstRate')),
      notes: String(formData.get('notes') || '').trim(),
      items: orderItems,
    }

    if (
      !Number.isFinite(purchaseOrder.packingChargeRate) || purchaseOrder.packingChargeRate < 0
      || !Number.isFinite(purchaseOrder.gstRate) || purchaseOrder.gstRate < 0
    ) {
      setFormError('Enter valid non-negative P&F and GST rates.')
      return
    }

    setIsSaving(true)

    try {
      const response = await fetch(
        editingPurchaseOrder
          ? `/api/purchase-orders/${encodeURIComponent(editingPurchaseOrder.id)}`
          : '/api/purchase-orders',
        {
          method: editingPurchaseOrder ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(purchaseOrder),
        },
      )
      const savedOrder = await readApiResponse(response)

      setPurchaseOrders((current) => editingPurchaseOrder
        ? current.map((entry) => (entry.id === savedOrder.id ? savedOrder : entry))
        : [savedOrder, ...current])
      setIsModalOpen(false)
      setEditingPurchaseOrder(null)
      setItems([createEmptyItem()])
      setSuccessMessage(editingPurchaseOrder
        ? `Purchase order ${savedOrder.id} was updated.`
        : `Purchase order ${savedOrder.id} was saved to purchase order.json.`)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not save the purchase order.')
    } finally {
      setIsSaving(false)
    }
  }

  function openPurchaseOrderForm(order) {
    setEditingPurchaseOrder(order)
    setFormDefaults(order)
    setItems(Array.isArray(order.items) && order.items.length > 0
      ? order.items.map((item) => ({
        description: item.description || '',
        hsnCode: item.hsnCode || '',
        productCode: item.productCode || '',
        quantity: String(item.quantity ?? '1'),
        unitPrice: String(item.unitPrice ?? ''),
      }))
      : [createEmptyItem()])
    setPackingChargeRate(String(order.packingChargeRate ?? 1))
    setGstRate(String(order.gstRate ?? 18))
    setFormError('')
    setActionError('')
    setSuccessMessage('')
    setIsModalOpen(true)
  }

  async function handleDelete(order) {
    if (!window.confirm(`Delete purchase order ${order.id} for ${order.supplierName}? This cannot be undone.`)) {
      return
    }

    setDeletingPurchaseOrderId(order.id)
    setActionError('')
    setSuccessMessage('')

    try {
      const response = await fetch(`/api/purchase-orders/${encodeURIComponent(order.id)}`, {
        method: 'DELETE',
      })
      await readApiResponse(response)
      setPurchaseOrders((current) => current.filter((entry) => entry.id !== order.id))
      setExpandedPurchaseOrderId((current) => (current === order.id ? '' : current))
      setSuccessMessage(`Purchase order ${order.id} was deleted.`)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not delete the purchase order.')
    } finally {
      setDeletingPurchaseOrderId('')
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
    <section className="quotation-page purchase-order-page">
      <div className="quotation-heading">
        <div>
          <p className="dashboard-eyebrow">DOCUMENTS</p>
          <h1>Purchase Order</h1>
          <p className="dashboard-description">Create and manage supplier purchase orders.</p>
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
              setEditingPurchaseOrder(null)
              setFormDefaults({})
              setItems([createEmptyItem()])
              setPackingChargeRate('1')
              setGstRate('18')
              setFormError('')
              setActionError('')
              setSuccessMessage('')
              setIsModalOpen(true)
            }}
          >
            <span aria-hidden="true">+</span> New purchase order
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
        <span className="quotation-summary-icon" aria-hidden="true">PO</span>
        <div>
          <p className="quotation-summary-label">Saved purchase orders</p>
          <p className="quotation-summary-number">{isLoading ? '…' : purchaseOrders.length}</p>
        </div>
      </div>

      <div className="quotation-list-heading">
        <h2>Recent purchase orders</h2>
        {!isLoading && purchaseOrders.length > 0 && (
          <span>{purchaseOrders.length} {purchaseOrders.length === 1 ? 'purchase order' : 'purchase orders'}</span>
        )}
      </div>

      {isLoading ? (
        <div className="quotation-empty-state" role="status">
          <p>Loading purchase orders…</p>
        </div>
      ) : purchaseOrders.length === 0 ? (
        <div className="quotation-empty-state">
          <span className="empty-state-icon" aria-hidden="true">PO</span>
          <h2>No purchase orders yet</h2>
          <p>Create a purchase order to see it listed here.</p>
        </div>
      ) : (
        <div className="quotation-table-wrap">
          <table className="quotation-table">
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">Supplier</th>
                <th scope="col">Order date</th>
                <th scope="col">Expected delivery</th>
                <th scope="col">Total</th>
                <th scope="col">Details</th>
              </tr>
            </thead>
            <tbody>
              {purchaseOrders.map((order) => (
                <Fragment key={order.id}>
                  <tr>
                    <td className="quotation-number">{order.id}</td>
                    <td>
                      <span className="quotation-customer">{order.supplierName}</span>
                      {order.email && <span className="quotation-customer-email">{order.email}</span>}
                    </td>
                    <td>{order.orderDate}</td>
                    <td>{order.expectedDelivery || '—'}</td>
                    <td className="quotation-total">{formatCurrency(order.total)}</td>
                    <td>
                      <button
                        className="quotation-details-toggle"
                        type="button"
                        aria-expanded={expandedPurchaseOrderId === order.id}
                        aria-controls={`purchase-order-details-${order.id}`}
                        onClick={() => setExpandedPurchaseOrderId((current) => (
                          current === order.id ? '' : order.id
                        ))}
                      >
                        {expandedPurchaseOrderId === order.id ? 'Hide' : 'View'}
                      </button>
                    </td>
                  </tr>
                  {expandedPurchaseOrderId === order.id && (
                    <tr key={`${order.id}-details`}>
                      <td colSpan="6">
                        <section
                          className="quotation-record-details"
                          id={`purchase-order-details-${order.id}`}
                        >
                          <div className="quotation-record-toolbar">
                            <span>Purchase order details</span>
                            <div className="quotation-record-actions">
                              <button
                                className="quotation-print-button"
                                type="button"
                                onClick={() => setPrintPurchaseOrder(order)}
                              >
                                Print purchase order
                              </button>
                              <button
                                className="quotation-edit-button"
                                type="button"
                                onClick={() => openPurchaseOrderForm(order)}
                                disabled={Boolean(deletingPurchaseOrderId)}
                              >
                                Edit purchase order
                              </button>
                              <button
                                className="quotation-delete-button"
                                type="button"
                                onClick={() => handleDelete(order)}
                                disabled={Boolean(deletingPurchaseOrderId)}
                              >
                                {deletingPurchaseOrderId === order.id ? 'Deleting…' : 'Delete purchase order'}
                              </button>
                            </div>
                          </div>
                          <dl className="quotation-record-grid">
                            <div><dt>Supplier email</dt><dd>{order.email || '—'}</dd></div>
                            <div><dt>Phone</dt><dd>{order.phone || '—'}</dd></div>
                            <div><dt>Supplier address</dt><dd>{order.address || '—'}</dd></div>
                            <div><dt>GST number</dt><dd>{order.gstNumber || '—'}</dd></div>
                            <div><dt>PAN number</dt><dd>{order.panNumber || '—'}</dd></div>
                            <div><dt>Offer number</dt><dd>{order.offerNumber || '—'}</dd></div>
                            <div><dt>Offer date</dt><dd>{order.offerDate || '—'}</dd></div>
                            <div><dt>Dispatch mode</dt><dd>{order.dispatchMode || '—'}</dd></div>
                            <div><dt>Freight terms</dt><dd>{order.freightTerms || '—'}</dd></div>
                            <div><dt>Payment terms</dt><dd>{order.paymentTerms || '—'}</dd></div>
                            <div><dt>Discount terms</dt><dd>{order.discountTerms || '—'}</dd></div>
                          </dl>
                          <div className="quotation-record-items-wrap">
                            <table className="quotation-record-items">
                              <thead>
                                <tr>
                                  <th>Description</th>
                                  <th>HSN</th>
                                  <th>Product code</th>
                                  <th>Qty</th>
                                  <th>Unit cost</th>
                                  <th>Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(order.items || []).map((item, index) => (
                                  <tr key={`${order.id}-item-${index}`}>
                                    <td>{item.description}</td>
                                    <td>{item.hsnCode || '—'}</td>
                                    <td>{item.productCode || '—'}</td>
                                    <td>{item.quantity}</td>
                                    <td>{formatCurrency(item.unitPrice)}</td>
                                    <td>{formatCurrency(item.amount ?? item.quantity * item.unitPrice)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div className="quotation-record-totals">
                            <p>Subtotal <strong>{formatCurrency(order.subtotal ?? order.total)}</strong></p>
                            <p>P&amp;F ({order.packingChargeRate ?? 0}%) <strong>{formatCurrency(order.packingCharge ?? 0)}</strong></p>
                            <p>IGST ({order.gstRate ?? 0}%) <strong>{formatCurrency(order.gstAmount ?? 0)}</strong></p>
                            <p className="quotation-grand-total">Grand total <strong>{formatCurrency(order.total)}</strong></p>
                            <p className="quotation-record-amount-words">Total in words: {numberToWords(order.total)}</p>
                          </div>
                          {order.notes && <p className="quotation-record-notes">{order.notes}</p>}
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
            aria-labelledby="purchase-order-modal-title"
          >
            <header className="quotation-modal-header">
              <div>
                <p className="dashboard-eyebrow">NEW DOCUMENT</p>
                <h2 id="purchase-order-modal-title">
                  {editingPurchaseOrder ? 'Edit purchase order' : 'Create purchase order'}
                </h2>
              </div>
              <button
                className="quotation-close-button"
                type="button"
                aria-label="Close purchase order form"
                onClick={() => setIsModalOpen(false)}
                disabled={isSaving}
              >
                ×
              </button>
            </header>

            <form className="quotation-form" onSubmit={handleSubmit}>
              <fieldset className="quotation-fieldset" disabled={isSaving}>
                <legend>Purchase order and supplier details</legend>
                <div className="quotation-form-grid">
                  <label className="quotation-field">
                    <span>Purchase order number</span>
                    <input type="text" value={editingPurchaseOrder?.id || 'Generated when saved'} readOnly />
                  </label>
                  <label className="quotation-field">
                    <span>Supplier name <b>*</b></span>
                    <input name="supplierName" type="text" autoComplete="organization" defaultValue={formDefaults.supplierName || ''} required />
                  </label>
                  <label className="quotation-field">
                    <span>PO date <b>*</b></span>
                    <input name="orderDate" type="date" defaultValue={formDefaults.orderDate || getLocalDateString()} required />
                  </label>
                  <label className="quotation-field">
                    <span>Your offer number</span>
                    <input name="offerNumber" type="text" defaultValue={formDefaults.offerNumber || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>Offer date</span>
                    <input name="offerDate" type="date" defaultValue={formDefaults.offerDate || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>Expected delivery</span>
                    <input name="expectedDelivery" type="date" defaultValue={formDefaults.expectedDelivery || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>Dispatch mode</span>
                    <input name="dispatchMode" type="text" placeholder="e.g. By Road" defaultValue={formDefaults.dispatchMode || ''} />
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
                    <span>GST number</span>
                    <input name="gstNumber" type="text" defaultValue={formDefaults.gstNumber || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>PAN number</span>
                    <input name="panNumber" type="text" defaultValue={formDefaults.panNumber || ''} />
                  </label>
                  <label className="quotation-field quotation-field-full">
                    <span>Supplier address</span>
                    <textarea name="address" rows="2" autoComplete="street-address" defaultValue={formDefaults.address || ''} />
                  </label>
                </div>
              </fieldset>

              <fieldset className="quotation-fieldset quotation-items-fieldset" disabled={isSaving}>
                <legend>Goods / services</legend>
                <div className="quotation-items">
                  {items.map((item, index) => (
                    <div className="quotation-item-row purchase-order-item-row" key={index}>
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
                        <span>Unit cost (₹) <b>*</b></span>
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

              <fieldset className="quotation-fieldset purchase-order-terms-fieldset" disabled={isSaving}>
                <legend>Terms and charges</legend>
                <div className="quotation-form-grid">
                  <label className="quotation-field">
                    <span>Freight terms</span>
                    <input name="freightTerms" type="text" placeholder="e.g. Paid" defaultValue={formDefaults.freightTerms || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>Payment terms</span>
                    <input name="paymentTerms" type="text" placeholder="e.g. PDC" defaultValue={formDefaults.paymentTerms || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>Discount terms</span>
                    <input name="discountTerms" type="text" defaultValue={formDefaults.discountTerms || ''} />
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
                </div>
              </fieldset>

              <label className="quotation-field quotation-notes-field">
                <span>Notes</span>
                <textarea name="notes" rows="2" placeholder="Additional order details" defaultValue={formDefaults.notes || ''} disabled={isSaving} />
              </label>

              <div className="quotation-total-breakdown">
                <p>Sub total <strong>{formatCurrency(subtotal)}</strong></p>
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
                  {isSaving
                    ? (editingPurchaseOrder ? 'Updating…' : 'Saving…')
                    : (editingPurchaseOrder ? 'Update purchase order' : 'Save purchase order')}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {printPurchaseOrder && (
        <article className="quotation-print-document purchase-order-print-document" id="purchase-order-print-document">
          <header className="quotation-print-company">
            <div className="quotation-print-brand-mark">TE</div>
            <div>
              <h1>TOLETI ENTERPRISES</h1>
              <p>1-1-287/20, Bapunagar, Street No. 4, Chikkadpally, Hyderabad-500020, Telangana</p>
              <p>Cell No.: 9885480036 / 8121494837 | Mail: toletienterprises@gmail.com</p>
              <p>GSTN No.: 36AKUPG7555J1ZG | IEC &amp; PAN No.: AKUPG7555J</p>
            </div>
          </header>

          <h2 className="quotation-print-title">PURCHASE ORDER</h2>

          <section className="quotation-print-parties">
            <div className="quotation-print-bill-to">
              <strong>To supplier:</strong>
              <strong>{printPurchaseOrder.supplierName}</strong>
              {printPurchaseOrder.address && <p>{printPurchaseOrder.address}</p>}
              {printPurchaseOrder.gstNumber && <p>GSTIN: {printPurchaseOrder.gstNumber}</p>}
              {printPurchaseOrder.panNumber && <p>PAN: {printPurchaseOrder.panNumber}</p>}
              {printPurchaseOrder.email && <p>Email: {printPurchaseOrder.email}</p>}
              {printPurchaseOrder.phone && <p>Contact: {printPurchaseOrder.phone}</p>}
            </div>
            <dl>
              <div><dt>PO No.</dt><dd>{printPurchaseOrder.id}</dd></div>
              <div><dt>PO date</dt><dd>{printPurchaseOrder.orderDate || '—'}</dd></div>
              <div><dt>Expected delivery</dt><dd>{printPurchaseOrder.expectedDelivery || '—'}</dd></div>
              <div><dt>Offer number</dt><dd>{printPurchaseOrder.offerNumber || '—'}</dd></div>
              <div><dt>Offer date</dt><dd>{printPurchaseOrder.offerDate || '—'}</dd></div>
              <div><dt>Dispatch mode</dt><dd>{printPurchaseOrder.dispatchMode || '—'}</dd></div>
              <div><dt>Freight terms</dt><dd>{printPurchaseOrder.freightTerms || '—'}</dd></div>
            </dl>
          </section>

          <table className="quotation-print-items purchase-order-print-items">
            <thead>
              <tr>
                <th>Sl. No.</th>
                <th>Description</th>
                <th>HSN Code</th>
                <th>Product Code</th>
                <th>Qty</th>
                <th>Unit Cost</th>
                <th>Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {(printPurchaseOrder.items || []).map((item, index) => (
                <tr key={`${printPurchaseOrder.id}-print-item-${index}`}>
                  <td>{String(index + 1).padStart(2, '0')}</td>
                  <td>{item.description}</td>
                  <td>{item.hsnCode || '—'}</td>
                  <td>{item.productCode || '—'}</td>
                  <td>{item.quantity}</td>
                  <td>{formatCurrency(item.unitPrice)}</td>
                  <td>{formatCurrency(item.amount ?? item.quantity * item.unitPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <section className="quotation-print-bottom purchase-order-print-bottom">
            <div className="quotation-print-terms">
              <strong>Terms and Conditions:</strong>
              <p>Payment: {printPurchaseOrder.paymentTerms || '—'}</p>
              <p>Freight: {printPurchaseOrder.freightTerms || '—'}</p>
              <p>Discount: {printPurchaseOrder.discountTerms || '—'}</p>
              {printPurchaseOrder.notes && <p className="quotation-print-notes">{printPurchaseOrder.notes}</p>}
            </div>
            <table className="quotation-print-totals">
              <tbody>
                <tr><th>Sub Total</th><td>{formatCurrency(printPurchaseOrder.subtotal ?? printPurchaseOrder.total)}</td></tr>
                <tr><th>P&amp;F Charges @ {printPurchaseOrder.packingChargeRate ?? 0}%</th><td>{formatCurrency(printPurchaseOrder.packingCharge ?? 0)}</td></tr>
                <tr><th>Taxable Total</th><td>{formatCurrency((printPurchaseOrder.subtotal ?? printPurchaseOrder.total) + (printPurchaseOrder.packingCharge ?? 0))}</td></tr>
                <tr><th>IGST @ {printPurchaseOrder.gstRate ?? 0}%</th><td>{formatCurrency(printPurchaseOrder.gstAmount ?? 0)}</td></tr>
                <tr className="quotation-print-grand-total"><th>Grand Total</th><td>{formatCurrency(printPurchaseOrder.total)}</td></tr>
              </tbody>
            </table>
          </section>

          <p className="quotation-print-words">
            <strong>Total in words:</strong> {numberToWords(printPurchaseOrder.total)}
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

export default PurchaseOrder
