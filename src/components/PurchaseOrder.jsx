import { useEffect, useState } from 'react'

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
  const [items, setItems] = useState([createEmptyItem()])
  const [packingChargeRate, setPackingChargeRate] = useState('1')
  const [gstRate, setGstRate] = useState('18')
  const [formError, setFormError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

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
      const response = await fetch('/api/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(purchaseOrder),
      })
      const savedOrder = await readApiResponse(response)

      setPurchaseOrders((current) => [savedOrder, ...current])
      setIsModalOpen(false)
      setItems([createEmptyItem()])
      setSuccessMessage(`Purchase order ${savedOrder.id} was saved to purchase order.json.`)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not save the purchase order.')
    } finally {
      setIsSaving(false)
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
              setFormError('')
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
              </tr>
            </thead>
            <tbody>
              {purchaseOrders.map((order) => (
                <tr key={order.id}>
                  <td className="quotation-number">{order.id}</td>
                  <td>
                    <span className="quotation-customer">{order.supplierName}</span>
                    {order.email && <span className="quotation-customer-email">{order.email}</span>}
                  </td>
                  <td>{order.orderDate}</td>
                  <td>{order.expectedDelivery || '—'}</td>
                  <td className="quotation-total">{formatCurrency(order.total)}</td>
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
            aria-labelledby="purchase-order-modal-title"
          >
            <header className="quotation-modal-header">
              <div>
                <p className="dashboard-eyebrow">NEW DOCUMENT</p>
                <h2 id="purchase-order-modal-title">Create purchase order</h2>
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
                    <input type="text" value="Generated when saved" readOnly />
                  </label>
                  <label className="quotation-field">
                    <span>Supplier name <b>*</b></span>
                    <input name="supplierName" type="text" autoComplete="organization" required />
                  </label>
                  <label className="quotation-field">
                    <span>PO date <b>*</b></span>
                    <input name="orderDate" type="date" defaultValue={getLocalDateString()} required />
                  </label>
                  <label className="quotation-field">
                    <span>Your offer number</span>
                    <input name="offerNumber" type="text" />
                  </label>
                  <label className="quotation-field">
                    <span>Offer date</span>
                    <input name="offerDate" type="date" />
                  </label>
                  <label className="quotation-field">
                    <span>Expected delivery</span>
                    <input name="expectedDelivery" type="date" />
                  </label>
                  <label className="quotation-field">
                    <span>Dispatch mode</span>
                    <input name="dispatchMode" type="text" placeholder="e.g. By Road" />
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
                    <span>GST number</span>
                    <input name="gstNumber" type="text" />
                  </label>
                  <label className="quotation-field">
                    <span>PAN number</span>
                    <input name="panNumber" type="text" />
                  </label>
                  <label className="quotation-field quotation-field-full">
                    <span>Supplier address</span>
                    <textarea name="address" rows="2" autoComplete="street-address" />
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
                    <input name="freightTerms" type="text" placeholder="e.g. Paid" />
                  </label>
                  <label className="quotation-field">
                    <span>Payment terms</span>
                    <input name="paymentTerms" type="text" placeholder="e.g. PDC" />
                  </label>
                  <label className="quotation-field">
                    <span>Discount terms</span>
                    <input name="discountTerms" type="text" />
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
                <textarea name="notes" rows="2" placeholder="Additional order details" disabled={isSaving} />
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
                  {isSaving ? 'Saving…' : 'Save purchase order'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </section>
  )
}

export default PurchaseOrder
