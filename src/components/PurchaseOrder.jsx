import { useEffect, useState } from 'react'

const createEmptyItem = () => ({ description: '', quantity: '1', unitPrice: '' })

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

function PurchaseOrder({ onBack }) {
  const [purchaseOrders, setPurchaseOrders] = useState([])
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
      notes: String(formData.get('notes') || '').trim(),
      items: orderItems,
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
                <legend>Supplier details</legend>
                <div className="quotation-form-grid">
                  <label className="quotation-field">
                    <span>Supplier name <b>*</b></span>
                    <input name="supplierName" type="text" autoComplete="organization" required />
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
                    <span>Order date <b>*</b></span>
                    <input name="orderDate" type="date" defaultValue={getLocalDateString()} required />
                  </label>
                  <label className="quotation-field">
                    <span>Expected delivery</span>
                    <input name="expectedDelivery" type="date" />
                  </label>
                  <label className="quotation-field quotation-field-full">
                    <span>Supplier address</span>
                    <textarea name="address" rows="2" autoComplete="street-address" />
                  </label>
                </div>
              </fieldset>

              <fieldset className="quotation-fieldset quotation-items-fieldset" disabled={isSaving}>
                <legend>Order items</legend>
                <div className="quotation-items">
                  {items.map((item, index) => (
                    <div className="quotation-item-row" key={index}>
                      <label className="quotation-field quotation-item-description">
                        <span>Item description <b>*</b></span>
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
                <textarea name="notes" rows="2" placeholder="Additional order details" disabled={isSaving} />
              </label>

              <p className="quotation-form-total">
                Estimated total <strong>{formatCurrency(items.reduce((sum, item) => (
                  sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)
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
