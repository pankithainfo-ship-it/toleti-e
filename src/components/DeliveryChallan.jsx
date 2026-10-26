import { useEffect, useState } from 'react'

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

function DeliveryChallan({ onBack }) {
  const [challans, setChallans] = useState([])
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
      const response = await fetch('/api/delivery-challans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(challan),
      })
      const savedChallan = await readApiResponse(response)

      setChallans((current) => [savedChallan, ...current])
      setIsModalOpen(false)
      setItems([createEmptyItem()])
      setSuccessMessage(`Delivery challan ${savedChallan.id} was saved to delivery challance.json.`)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not save the delivery challan.')
    } finally {
      setIsSaving(false)
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
              setFormError('')
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
              </tr>
            </thead>
            <tbody>
              {challans.map((challan) => (
                <tr key={challan.id}>
                  <td className="quotation-number">{challan.id}</td>
                  <td>
                    <span className="quotation-customer">{challan.customerName}</span>
                    {challan.email && <span className="quotation-customer-email">{challan.email}</span>}
                  </td>
                  <td>{challan.dispatchDate}</td>
                  <td>{challan.reference || '—'}</td>
                  <td>{challan.items.length}</td>
                  <td>{challan.totalQuantity}</td>
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
            aria-labelledby="delivery-challan-modal-title"
          >
            <header className="quotation-modal-header">
              <div>
                <p className="dashboard-eyebrow">NEW DOCUMENT</p>
                <h2 id="delivery-challan-modal-title">Create delivery challan</h2>
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
                    <input type="text" value="Generated when saved" readOnly />
                  </label>
                  <label className="quotation-field">
                    <span>Customer name <b>*</b></span>
                    <input name="customerName" type="text" autoComplete="name" required />
                  </label>
                  <label className="quotation-field">
                    <span>Invoice number</span>
                    <input name="invoiceNumber" type="text" />
                  </label>
                  <label className="quotation-field">
                    <span>Dispatch date <b>*</b></span>
                    <input name="dispatchDate" type="date" defaultValue={getLocalDateString()} required />
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
                    <span>Terms of payment</span>
                    <input name="paymentTerms" type="text" />
                  </label>
                  <label className="quotation-field">
                    <span>Region / area code</span>
                    <input name="regionCode" type="text" />
                  </label>
                  <label className="quotation-field">
                    <span>Number of packages</span>
                    <input name="numberOfPackages" type="text" />
                  </label>
                  <label className="quotation-field">
                    <span>Email address</span>
                    <input name="email" type="email" autoComplete="email" />
                  </label>
                  <label className="quotation-field">
                    <span>Customer GST number</span>
                    <input name="customerGstNumber" type="text" />
                  </label>
                  <label className="quotation-field">
                    <span>Customer PAN number</span>
                    <input name="customerPanNumber" type="text" />
                  </label>
                  <label className="quotation-field">
                    <span>Phone number</span>
                    <input name="phone" type="tel" autoComplete="tel" />
                  </label>
                  <label className="quotation-field">
                    <span>Contact person</span>
                    <input name="contactPerson" type="text" />
                  </label>
                  <label className="quotation-field">
                    <span>Dispatch through</span>
                    <input name="dispatchThrough" type="text" />
                  </label>
                  <label className="quotation-field">
                    <span>Transporter</span>
                    <input name="transporter" type="text" />
                  </label>
                  <label className="quotation-field">
                    <span>Vehicle number</span>
                    <input name="vehicleNumber" type="text" />
                  </label>
                  <label className="quotation-field">
                    <span>Reference</span>
                    <input name="reference" type="text" />
                  </label>
                  <label className="quotation-field quotation-field-full">
                    <span>Bill to address</span>
                    <textarea name="billingAddress" rows="2" autoComplete="street-address" />
                  </label>
                  <label className="quotation-field quotation-field-full">
                    <span>Delivery address <b>*</b></span>
                    <textarea name="deliveryAddress" rows="2" autoComplete="street-address" required />
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
                <textarea name="notes" rows="2" placeholder="Additional delivery details" disabled={isSaving} />
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
                  {isSaving ? 'Saving…' : 'Save delivery challan'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </section>
  )
}

export default DeliveryChallan
