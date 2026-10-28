import { Fragment, useEffect, useState } from 'react'

const createEmptyItem = () => ({
  description: '',
  hsnCode: '',
  productCode: '',
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
      `The invoice API returned an invalid response (HTTP ${response.status}). `
      + 'Stop the old development server and restart with npm run dev.',
    )
  }

  if (!response.ok) {
    throw new Error(data.error || `The invoice API returned HTTP ${response.status}.`)
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

function Invoice({ onBack }) {
  const [invoices, setInvoices] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState(null)
  const [deletingInvoiceId, setDeletingInvoiceId] = useState('')
  const [items, setItems] = useState([createEmptyItem()])
  const [packingChargeRate, setPackingChargeRate] = useState('2')
  const [cgstRate, setCgstRate] = useState('9')
  const [sgstRate, setSgstRate] = useState('9')
  const [courierCharges, setCourierCharges] = useState('')
  const [formDefaults, setFormDefaults] = useState({})
  const [expandedInvoiceId, setExpandedInvoiceId] = useState('')
  const [printInvoice, setPrintInvoice] = useState(null)
  const [formError, setFormError] = useState('')
  const [actionError, setActionError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    if (!printInvoice) return undefined

    const handleAfterPrint = () => setPrintInvoice(null)
    window.addEventListener('afterprint', handleAfterPrint)
    const printFrame = window.requestAnimationFrame(() => window.print())

    return () => {
      window.cancelAnimationFrame(printFrame)
      window.removeEventListener('afterprint', handleAfterPrint)
    }
  }, [printInvoice])

  useEffect(() => {
    let isCurrent = true

    async function loadInvoices() {
      setIsLoading(true)
      setLoadError('')

      try {
        const response = await fetch('/api/invoices')
        const result = await readApiResponse(response)
        if (!Array.isArray(result)) {
          throw new Error('The invoice server returned invalid data.')
        }
        if (isCurrent) setInvoices(result)
      } catch (error) {
        if (isCurrent) {
          setLoadError(error instanceof Error ? error.message : 'Could not load invoices.')
        }
      } finally {
        if (isCurrent) setIsLoading(false)
      }
    }

    loadInvoices()
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
    const invoiceDate = String(formData.get('invoiceDate') || '')
    const dueDate = String(formData.get('dueDate') || '')
    const invoiceItems = items.map((item) => ({
      description: item.description.trim(),
      hsnCode: item.hsnCode.trim(),
      productCode: item.productCode.trim(),
      make: item.make.trim(),
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
    }))

    if (invoiceItems.some((item) => (
      !item.description || !Number.isFinite(item.quantity) || item.quantity <= 0
      || !Number.isFinite(item.unitPrice) || item.unitPrice < 0
    ))) {
      setFormError('Enter a description, positive quantity, and valid unit price for each item.')
      return
    }

    if (dueDate && dueDate < invoiceDate) {
      setFormError('The due date cannot be earlier than the invoice date.')
      return
    }

    const invoice = {
      customerName: String(formData.get('customerName') || '').trim(),
      email: String(formData.get('email') || '').trim(),
      phone: String(formData.get('phone') || '').trim(),
      contactNumber: String(formData.get('contactNumber') || '').trim(),
      address: String(formData.get('address') || '').trim(),
      deliveryAddress: String(formData.get('deliveryAddress') || '').trim(),
      invoiceDate,
      dueDate,
      purchaseOrderNumber: String(formData.get('purchaseOrderNumber') || '').trim(),
      purchaseOrderDate: String(formData.get('purchaseOrderDate') || ''),
      purchaseOrderReceivedDate: String(formData.get('purchaseOrderReceivedDate') || ''),
      freight: String(formData.get('freight') || '').trim(),
      paymentTerms: String(formData.get('paymentTerms') || '').trim(),
      modeOfDocuments: String(formData.get('modeOfDocuments') || '').trim(),
      region: String(formData.get('region') || '').trim(),
      numberOfPackages: String(formData.get('numberOfPackages') || '').trim(),
      placeOfSupply: String(formData.get('placeOfSupply') || '').trim(),
      wayBillNumber: String(formData.get('wayBillNumber') || '').trim(),
      contactPerson: String(formData.get('contactPerson') || '').trim(),
      dispatchThrough: String(formData.get('dispatchThrough') || '').trim(),
      courierDwbNumber: String(formData.get('courierDwbNumber') || '').trim(),
      gstNumber: String(formData.get('gstNumber') || '').trim(),
      deliveryGstNumber: String(formData.get('deliveryGstNumber') || '').trim(),
      packingChargeRate: Number(formData.get('packingChargeRate')),
      cgstRate: Number(formData.get('cgstRate')),
      sgstRate: Number(formData.get('sgstRate')),
      courierCharges: Number(formData.get('courierCharges') || 0),
      notes: String(formData.get('notes') || '').trim(),
      items: invoiceItems,
    }

    if (
      !Number.isFinite(invoice.packingChargeRate) || invoice.packingChargeRate < 0
      || !Number.isFinite(invoice.cgstRate) || invoice.cgstRate < 0
      || !Number.isFinite(invoice.sgstRate) || invoice.sgstRate < 0
      || !Number.isFinite(invoice.courierCharges) || invoice.courierCharges < 0
    ) {
      setFormError('Enter valid non-negative P&F, tax rates, and courier charges.')
      return
    }

    setIsSaving(true)

    try {
      const response = await fetch(
        editingInvoice
          ? `/api/invoices/${encodeURIComponent(editingInvoice.id)}`
          : '/api/invoices',
        {
          method: editingInvoice ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(invoice),
        },
      )
      const savedInvoice = await readApiResponse(response)

      setInvoices((current) => editingInvoice
        ? current.map((entry) => (entry.id === savedInvoice.id ? savedInvoice : entry))
        : [savedInvoice, ...current])
      setIsModalOpen(false)
      setEditingInvoice(null)
      setItems([createEmptyItem()])
      setSuccessMessage(editingInvoice
        ? `Invoice ${savedInvoice.id} was updated.`
        : `Invoice ${savedInvoice.id} was saved to Invoice.json.`)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not save the invoice.')
    } finally {
      setIsSaving(false)
    }
  }

  function openInvoiceForm(invoice) {
    setEditingInvoice(invoice)
    setFormDefaults(invoice)
    setItems(Array.isArray(invoice.items) && invoice.items.length > 0
      ? invoice.items.map((item) => ({
        description: item.description || '',
        hsnCode: item.hsnCode || '',
        productCode: item.productCode || '',
        make: item.make || '',
        quantity: String(item.quantity ?? '1'),
        unitPrice: String(item.unitPrice ?? ''),
      }))
      : [createEmptyItem()])
    setPackingChargeRate(String(invoice.packingChargeRate ?? 2))
    setCgstRate(String(invoice.cgstRate ?? 9))
    setSgstRate(String(invoice.sgstRate ?? 9))
    setCourierCharges(String(invoice.courierCharges ?? ''))
    setFormError('')
    setActionError('')
    setSuccessMessage('')
    setIsModalOpen(true)
  }

  async function handleDelete(invoice) {
    if (!window.confirm(`Delete invoice ${invoice.id} for ${invoice.customerName}? This cannot be undone.`)) {
      return
    }

    setDeletingInvoiceId(invoice.id)
    setActionError('')
    setSuccessMessage('')

    try {
      const response = await fetch(`/api/invoices/${encodeURIComponent(invoice.id)}`, {
        method: 'DELETE',
      })
      await readApiResponse(response)
      setInvoices((current) => current.filter((entry) => entry.id !== invoice.id))
      setExpandedInvoiceId((current) => (current === invoice.id ? '' : current))
      setSuccessMessage(`Invoice ${invoice.id} was deleted.`)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not delete the invoice.')
    } finally {
      setDeletingInvoiceId('')
    }
  }

  const itemSubtotal = Math.round(items.reduce((sum, item) => (
    sum + Math.round((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0) * 100) / 100
  ), 0) * 100) / 100
  const packingCharge = Math.round(itemSubtotal * (Number(packingChargeRate) || 0)) / 100
  const subtotal = itemSubtotal + packingCharge + (Number(courierCharges) || 0)
  const cgstAmount = Math.round(subtotal * (Number(cgstRate) || 0)) / 100
  const sgstAmount = Math.round(subtotal * (Number(sgstRate) || 0)) / 100
  const grandTotal = Math.round((subtotal + cgstAmount + sgstAmount) * 100) / 100

  return (
    <section className="quotation-page invoice-page">
      <div className="quotation-heading">
        <div>
          <p className="dashboard-eyebrow">DOCUMENTS</p>
          <h1>Invoice</h1>
          <p className="dashboard-description">Create and manage customer invoices.</p>
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
              setEditingInvoice(null)
              setFormDefaults({})
              setItems([createEmptyItem()])
              setPackingChargeRate('2')
              setCgstRate('9')
              setSgstRate('9')
              setCourierCharges('')
              setFormError('')
              setActionError('')
              setSuccessMessage('')
              setIsModalOpen(true)
            }}
          >
            <span aria-hidden="true">+</span> New invoice
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
        <span className="quotation-summary-icon" aria-hidden="true">IN</span>
        <div>
          <p className="quotation-summary-label">Saved invoices</p>
          <p className="quotation-summary-number">{isLoading ? '…' : invoices.length}</p>
        </div>
      </div>

      <div className="quotation-list-heading">
        <h2>Recent invoices</h2>
        {!isLoading && invoices.length > 0 && (
          <span>{invoices.length} {invoices.length === 1 ? 'invoice' : 'invoices'}</span>
        )}
      </div>

      {isLoading ? (
        <div className="quotation-empty-state" role="status">
          <p>Loading invoices…</p>
        </div>
      ) : invoices.length === 0 ? (
        <div className="quotation-empty-state">
          <span className="empty-state-icon" aria-hidden="true">IN</span>
          <h2>No invoices yet</h2>
          <p>Create an invoice to see it listed here.</p>
        </div>
      ) : (
        <div className="quotation-table-wrap">
          <table className="quotation-table">
            <thead>
              <tr>
                <th scope="col">Invoice</th>
                <th scope="col">Customer</th>
                <th scope="col">Invoice date</th>
                <th scope="col">Due date</th>
                <th scope="col">Total</th>
                <th scope="col">Details</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((savedInvoice) => (
                <Fragment key={savedInvoice.id}>
                  <tr>
                    <td className="quotation-number">{savedInvoice.id}</td>
                    <td>
                      <span className="quotation-customer">{savedInvoice.customerName}</span>
                      {savedInvoice.email && (
                        <span className="quotation-customer-email">{savedInvoice.email}</span>
                      )}
                    </td>
                    <td>{savedInvoice.invoiceDate}</td>
                    <td>{savedInvoice.dueDate || '—'}</td>
                    <td className="quotation-total">{formatCurrency(savedInvoice.total)}</td>
                    <td>
                      <button
                        className="quotation-details-toggle"
                        type="button"
                        aria-expanded={expandedInvoiceId === savedInvoice.id}
                        aria-controls={`invoice-details-${savedInvoice.id}`}
                        onClick={() => setExpandedInvoiceId((current) => (
                          current === savedInvoice.id ? '' : savedInvoice.id
                        ))}
                      >
                        {expandedInvoiceId === savedInvoice.id ? 'Hide' : 'View'}
                      </button>
                    </td>
                  </tr>
                  {expandedInvoiceId === savedInvoice.id && (
                    <tr key={`${savedInvoice.id}-details`}>
                      <td colSpan="6">
                        <section className="quotation-record-details" id={`invoice-details-${savedInvoice.id}`}>
                          <div className="quotation-record-toolbar">
                            <span>Invoice details</span>
                            <div className="quotation-record-actions">
                              <button
                                className="quotation-print-button"
                                type="button"
                                onClick={() => setPrintInvoice(savedInvoice)}
                              >
                                Print invoice
                              </button>
                              <button
                                className="quotation-edit-button"
                                type="button"
                                onClick={() => openInvoiceForm(savedInvoice)}
                                disabled={Boolean(deletingInvoiceId)}
                              >
                                Edit invoice
                              </button>
                              <button
                                className="quotation-delete-button"
                                type="button"
                                onClick={() => handleDelete(savedInvoice)}
                                disabled={Boolean(deletingInvoiceId)}
                              >
                                {deletingInvoiceId === savedInvoice.id ? 'Deleting…' : 'Delete invoice'}
                              </button>
                            </div>
                          </div>
                          <dl className="quotation-record-grid">
                            <div><dt>Email</dt><dd>{savedInvoice.email || '—'}</dd></div>
                            <div><dt>Phone</dt><dd>{savedInvoice.phone || '—'}</dd></div>
                            <div><dt>Contact person</dt><dd>{savedInvoice.contactPerson || '—'}</dd></div>
                            <div><dt>Contact number</dt><dd>{savedInvoice.contactNumber || '—'}</dd></div>
                            <div><dt>Billing address</dt><dd>{savedInvoice.address || '—'}</dd></div>
                            <div><dt>Delivery address</dt><dd>{savedInvoice.deliveryAddress || '—'}</dd></div>
                            <div><dt>Customer GST number</dt><dd>{savedInvoice.gstNumber || '—'}</dd></div>
                            <div><dt>Delivery GST number</dt><dd>{savedInvoice.deliveryGstNumber || '—'}</dd></div>
                            <div><dt>Purchase order</dt><dd>{savedInvoice.purchaseOrderNumber || '—'}</dd></div>
                            <div><dt>Purchase order date</dt><dd>{savedInvoice.purchaseOrderDate || '—'}</dd></div>
                            <div><dt>PO received date</dt><dd>{savedInvoice.purchaseOrderReceivedDate || '—'}</dd></div>
                            <div><dt>Payment terms</dt><dd>{savedInvoice.paymentTerms || '—'}</dd></div>
                            <div><dt>Freight</dt><dd>{savedInvoice.freight || '—'}</dd></div>
                            <div><dt>Dispatch through</dt><dd>{savedInvoice.dispatchThrough || '—'}</dd></div>
                            <div><dt>Courier DWB number</dt><dd>{savedInvoice.courierDwbNumber || '—'}</dd></div>
                            <div><dt>Way bill number</dt><dd>{savedInvoice.wayBillNumber || '—'}</dd></div>
                            <div><dt>Place of supply</dt><dd>{savedInvoice.placeOfSupply || '—'}</dd></div>
                            <div><dt>Region / area</dt><dd>{savedInvoice.region || '—'}</dd></div>
                            <div><dt>Mode of documents</dt><dd>{savedInvoice.modeOfDocuments || '—'}</dd></div>
                            <div><dt>Number of packages</dt><dd>{savedInvoice.numberOfPackages || '—'}</dd></div>
                          </dl>
                          <div className="quotation-record-items-wrap">
                            <table className="quotation-record-items">
                              <thead>
                                <tr>
                                  <th>Description</th>
                                  <th>HSN</th>
                                  <th>Product code</th>
                                  <th>Make</th>
                                  <th>Qty</th>
                                  <th>Unit price</th>
                                  <th>Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(savedInvoice.items || []).map((item, index) => (
                                  <tr key={`${savedInvoice.id}-item-${index}`}>
                                    <td>{item.description}</td>
                                    <td>{item.hsnCode || '—'}</td>
                                    <td>{item.productCode || '—'}</td>
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
                            <p>Item subtotal <strong>{formatCurrency(savedInvoice.itemSubtotal ?? savedInvoice.subtotal ?? savedInvoice.total)}</strong></p>
                            <p>P&amp;F ({savedInvoice.packingChargeRate ?? 0}%) <strong>{formatCurrency(savedInvoice.packingCharge ?? 0)}</strong></p>
                            <p>Courier charges <strong>{formatCurrency(savedInvoice.courierCharges ?? 0)}</strong></p>
                            <p>Subtotal <strong>{formatCurrency(savedInvoice.subtotal ?? savedInvoice.total)}</strong></p>
                            <p>CGST ({savedInvoice.cgstRate ?? 0}%) <strong>{formatCurrency(savedInvoice.cgstAmount ?? 0)}</strong></p>
                            <p>SGST ({savedInvoice.sgstRate ?? 0}%) <strong>{formatCurrency(savedInvoice.sgstAmount ?? 0)}</strong></p>
                            <p className="quotation-grand-total">Grand total <strong>{formatCurrency(savedInvoice.total)}</strong></p>
                            <p className="quotation-record-amount-words">Total in words: {numberToWords(savedInvoice.total)}</p>
                          </div>
                          {savedInvoice.notes && <p className="quotation-record-notes">{savedInvoice.notes}</p>}
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
            aria-labelledby="invoice-modal-title"
          >
            <header className="quotation-modal-header">
              <div>
                <p className="dashboard-eyebrow">NEW DOCUMENT</p>
                <h2 id="invoice-modal-title">{editingInvoice ? 'Edit invoice' : 'Create invoice'}</h2>
              </div>
              <button
                className="quotation-close-button"
                type="button"
                aria-label="Close invoice form"
                onClick={() => setIsModalOpen(false)}
                disabled={isSaving}
              >
                ×
              </button>
            </header>

            <form className="quotation-form" onSubmit={handleSubmit}>
              <fieldset className="quotation-fieldset" disabled={isSaving}>
                <legend>Invoice and customer details</legend>
                <div className="quotation-form-grid">
                  <label className="quotation-field">
                    <span>Invoice number</span>
                    <input type="text" value={editingInvoice?.id || 'Generated when saved'} readOnly />
                  </label>
                  <label className="quotation-field">
                    <span>Customer name <b>*</b></span>
                    <input name="customerName" type="text" autoComplete="name" defaultValue={formDefaults.customerName || ''} required />
                  </label>
                  <label className="quotation-field">
                    <span>Invoice date <b>*</b></span>
                    <input name="invoiceDate" type="date" defaultValue={formDefaults.invoiceDate || getLocalDateString()} required />
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
                    <span>PO received date</span>
                    <input name="purchaseOrderReceivedDate" type="date" defaultValue={formDefaults.purchaseOrderReceivedDate || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>Due date</span>
                    <input name="dueDate" type="date" defaultValue={formDefaults.dueDate || ''} />
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
                    <span>Customer GST number</span>
                    <input name="gstNumber" type="text" defaultValue={formDefaults.gstNumber || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>Freight</span>
                    <input name="freight" type="text" defaultValue={formDefaults.freight || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>Terms of payment</span>
                    <input name="paymentTerms" type="text" defaultValue={formDefaults.paymentTerms || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>Mode of documents</span>
                    <input name="modeOfDocuments" type="text" defaultValue={formDefaults.modeOfDocuments || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>Region / area</span>
                    <input name="region" type="text" defaultValue={formDefaults.region || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>Number of packages</span>
                    <input name="numberOfPackages" type="text" defaultValue={formDefaults.numberOfPackages || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>Place of supply</span>
                    <input name="placeOfSupply" type="text" defaultValue={formDefaults.placeOfSupply || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>Way bill number</span>
                    <input name="wayBillNumber" type="text" defaultValue={formDefaults.wayBillNumber || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>Contact person</span>
                    <input name="contactPerson" type="text" defaultValue={formDefaults.contactPerson || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>Contact number</span>
                    <input name="contactNumber" type="tel" defaultValue={formDefaults.contactNumber || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>Dispatch through</span>
                    <input name="dispatchThrough" type="text" defaultValue={formDefaults.dispatchThrough || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>Courier DWB number</span>
                    <input name="courierDwbNumber" type="text" defaultValue={formDefaults.courierDwbNumber || ''} />
                  </label>
                  <label className="quotation-field quotation-field-full">
                    <span>Bill to address</span>
                    <textarea name="address" rows="2" autoComplete="street-address" defaultValue={formDefaults.address || ''} />
                  </label>
                  <label className="quotation-field">
                    <span>Delivery GST number</span>
                    <input name="deliveryGstNumber" type="text" defaultValue={formDefaults.deliveryGstNumber || ''} />
                  </label>
                  <label className="quotation-field quotation-field-full">
                    <span>Delivery to address</span>
                    <textarea name="deliveryAddress" rows="2" defaultValue={formDefaults.deliveryAddress || ''} />
                  </label>
                </div>
              </fieldset>

              <fieldset className="quotation-fieldset quotation-items-fieldset" disabled={isSaving}>
                <legend>Goods and services</legend>
                <div className="quotation-items">
                  {items.map((item, index) => (
                    <div className="quotation-item-row invoice-item-row" key={index}>
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
                      <label className="quotation-field">
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

              <fieldset className="quotation-fieldset invoice-terms-fieldset" disabled={isSaving}>
                <legend>Charges and taxes</legend>
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
                    <span>Courier charges (₹)</span>
                    <input
                      name="courierCharges"
                      type="number"
                      min="0"
                      step="0.01"
                      value={courierCharges}
                      onChange={(event) => setCourierCharges(event.target.value)}
                    />
                  </label>
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
                </div>
              </fieldset>

              <label className="quotation-field quotation-notes-field">
                <span>Terms and conditions</span>
                <textarea name="notes" rows="3" placeholder="Add invoice terms and conditions" defaultValue={formDefaults.notes || ''} disabled={isSaving} />
              </label>

              <div className="quotation-total-breakdown">
                <p>Item total <strong>{formatCurrency(itemSubtotal)}</strong></p>
                <p>P&amp;F charges <strong>{formatCurrency(packingCharge)}</strong></p>
                <p>Courier charges <strong>{formatCurrency(Number(courierCharges) || 0)}</strong></p>
                <p>Sub total <strong>{formatCurrency(subtotal)}</strong></p>
                <p>CGST ({Number(cgstRate) || 0}%) <strong>{formatCurrency(cgstAmount)}</strong></p>
                <p>SGST ({Number(sgstRate) || 0}%) <strong>{formatCurrency(sgstAmount)}</strong></p>
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
                  {isSaving ? (editingInvoice ? 'Updating…' : 'Saving…') : (editingInvoice ? 'Update invoice' : 'Save invoice')}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {printInvoice && (
        <article className="quotation-print-document invoice-print-document" id="invoice-print-document">
          <header className="quotation-print-company">
            <div className="quotation-print-brand-mark">TE</div>
            <div>
              <h1>TOLETI ENTERPRISES</h1>
              <p>1-1-287/20, Bapunagar, Street No. 4, Chikkadpally, Hyderabad-500020, Telangana</p>
              <p>Cell No.: 9885480036 / 8121494837 | Mail: toletienterprises@gmail.com</p>
              <p>GSTN No.: 36AKUPG7555J1ZG | IEC &amp; PAN No.: AKUPG7555J</p>
            </div>
          </header>

          <h2 className="quotation-print-title">TAX INVOICE</h2>

          <section className="quotation-print-parties">
            <div className="quotation-print-bill-to">
              <strong>Bill to:</strong>
              <strong>{printInvoice.customerName}</strong>
              {printInvoice.address && <p>{printInvoice.address}</p>}
              {printInvoice.gstNumber && <p>GSTIN: {printInvoice.gstNumber}</p>}
              {printInvoice.email && <p>Email: {printInvoice.email}</p>}
              {printInvoice.phone && <p>Contact: {printInvoice.phone}</p>}
            </div>
            <dl>
              <div><dt>Invoice No.</dt><dd>{printInvoice.id}</dd></div>
              <div><dt>Invoice date</dt><dd>{printInvoice.invoiceDate || '—'}</dd></div>
              <div><dt>Due date</dt><dd>{printInvoice.dueDate || '—'}</dd></div>
              <div><dt>PO number</dt><dd>{printInvoice.purchaseOrderNumber || '—'}</dd></div>
              <div><dt>PO date</dt><dd>{printInvoice.purchaseOrderDate || '—'}</dd></div>
              <div><dt>PO received</dt><dd>{printInvoice.purchaseOrderReceivedDate || '—'}</dd></div>
              <div><dt>Place of supply</dt><dd>{printInvoice.placeOfSupply || '—'}</dd></div>
              <div><dt>Way bill number</dt><dd>{printInvoice.wayBillNumber || '—'}</dd></div>
            </dl>
          </section>

          {(printInvoice.deliveryAddress || printInvoice.deliveryGstNumber) && (
            <section className="invoice-print-delivery">
              <strong>Ship to:</strong>
              {printInvoice.deliveryAddress && <p>{printInvoice.deliveryAddress}</p>}
              {printInvoice.deliveryGstNumber && <p>GSTIN: {printInvoice.deliveryGstNumber}</p>}
            </section>
          )}

          <table className="quotation-print-items invoice-print-items">
            <thead>
              <tr>
                <th>Sl. No.</th>
                <th>Description</th>
                <th>HSN Code</th>
                <th>Product Code</th>
                <th>Make</th>
                <th>Qty</th>
                <th>Unit Price</th>
                <th>Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {(printInvoice.items || []).map((item, index) => (
                <tr key={`${printInvoice.id}-print-item-${index}`}>
                  <td>{String(index + 1).padStart(2, '0')}</td>
                  <td>{item.description}</td>
                  <td>{item.hsnCode || '—'}</td>
                  <td>{item.productCode || '—'}</td>
                  <td>{item.make || '—'}</td>
                  <td>{item.quantity}</td>
                  <td>{formatCurrency(item.unitPrice)}</td>
                  <td>{formatCurrency(item.amount ?? item.quantity * item.unitPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <section className="quotation-print-bottom invoice-print-bottom">
            <div className="quotation-print-terms">
              <strong>Invoice details:</strong>
              <p>Payment terms: {printInvoice.paymentTerms || '—'}</p>
              <p>Freight: {printInvoice.freight || '—'}</p>
              <p>Dispatch through: {printInvoice.dispatchThrough || '—'}</p>
              <p>Courier DWB number: {printInvoice.courierDwbNumber || '—'}</p>
              <p>Mode of documents: {printInvoice.modeOfDocuments || '—'}</p>
              <p>Region / area: {printInvoice.region || '—'}</p>
              <p>Number of packages: {printInvoice.numberOfPackages || '—'}</p>
              <p>Contact person: {printInvoice.contactPerson || '—'}</p>
              <p>Contact number: {printInvoice.contactNumber || '—'}</p>
              {printInvoice.notes && <p className="quotation-print-notes">{printInvoice.notes}</p>}
            </div>
            <table className="quotation-print-totals">
              <tbody>
                <tr><th>Item subtotal</th><td>{formatCurrency(printInvoice.itemSubtotal ?? printInvoice.subtotal ?? printInvoice.total)}</td></tr>
                <tr><th>P&amp;F charges @ {printInvoice.packingChargeRate ?? 0}%</th><td>{formatCurrency(printInvoice.packingCharge ?? 0)}</td></tr>
                <tr><th>Courier charges</th><td>{formatCurrency(printInvoice.courierCharges ?? 0)}</td></tr>
                <tr><th>Subtotal</th><td>{formatCurrency(printInvoice.subtotal ?? printInvoice.total)}</td></tr>
                <tr><th>CGST @ {printInvoice.cgstRate ?? 0}%</th><td>{formatCurrency(printInvoice.cgstAmount ?? 0)}</td></tr>
                <tr><th>SGST @ {printInvoice.sgstRate ?? 0}%</th><td>{formatCurrency(printInvoice.sgstAmount ?? 0)}</td></tr>
                <tr className="quotation-print-grand-total"><th>Grand total</th><td>{formatCurrency(printInvoice.total)}</td></tr>
              </tbody>
            </table>
          </section>

          <p className="quotation-print-words">
            <strong>Total in words:</strong> {numberToWords(printInvoice.total)}
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

export default Invoice
