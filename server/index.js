import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const quotationFilePath = fileURLToPath(new URL('../quotation.json', import.meta.url))
const purchaseOrderFilePath = fileURLToPath(new URL('../purchase order.json', import.meta.url))
const invoiceFilePath = fileURLToPath(new URL('../Invoice.json', import.meta.url))
const debitNoteFilePath = fileURLToPath(new URL('../Debit note.json', import.meta.url))
const creditNoteFilePath = fileURLToPath(new URL('../Credit note.json', import.meta.url))
const deliveryChallanFilePath = fileURLToPath(new URL('../delivery challance.json', import.meta.url))
const legacyDataDirectory = fileURLToPath(new URL('../data/quotations/', import.meta.url))
const maximumRequestSize = 1024 * 1024
let writeQueue = Promise.resolve()

function sendJson(response, status, data) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(JSON.stringify(data))
}

async function readRequestBody(request) {
  let body = ''

  for await (const chunk of request) {
    body += chunk
    if (Buffer.byteLength(body) > maximumRequestSize) {
      const error = new Error('Request body exceeds the 1 MB limit.')
      error.status = 413
      throw error
    }
  }

  try {
    return JSON.parse(body)
  } catch {
    const error = new Error('Request body must contain valid JSON.')
    error.status = 400
    throw error
  }
}

function validateQuotation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return 'Quotation details must be a JSON object.'
  }

  if (typeof value.customerName !== 'string' || !value.customerName.trim()) {
    return 'Customer name is required.'
  }
  if (typeof value.email !== 'string' || (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email))) {
    return 'Enter a valid email address.'
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.quotationDate || '')) {
    return 'A valid quotation date is required.'
  }
  if (value.validUntil && !/^\d{4}-\d{2}-\d{2}$/.test(value.validUntil)) {
    return 'Enter a valid quotation expiry date.'
  }
  if (value.validUntil && value.validUntil < value.quotationDate) {
    return 'The valid-until date cannot be earlier than the quotation date.'
  }
  if (!Array.isArray(value.items) || value.items.length === 0) {
    return 'At least one quotation item is required.'
  }

  for (const item of value.items) {
    if (
      !item
      || typeof item.description !== 'string'
      || !item.description.trim()
      || !Number.isFinite(item.quantity)
      || item.quantity <= 0
      || !Number.isFinite(item.unitPrice)
      || item.unitPrice < 0
    ) {
      return 'Each item must have a description, positive quantity, and valid unit price.'
    }
  }

  return ''
}

function validatePurchaseOrder(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return 'Purchase order details must be a JSON object.'
  }

  if (typeof value.supplierName !== 'string' || !value.supplierName.trim()) {
    return 'Supplier name is required.'
  }
  if (typeof value.email !== 'string' || (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email))) {
    return 'Enter a valid supplier email address.'
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.orderDate || '')) {
    return 'A valid order date is required.'
  }
  if (value.expectedDelivery && !/^\d{4}-\d{2}-\d{2}$/.test(value.expectedDelivery)) {
    return 'Enter a valid expected delivery date.'
  }
  if (value.expectedDelivery && value.expectedDelivery < value.orderDate) {
    return 'The expected delivery date cannot be earlier than the order date.'
  }
  if (!Array.isArray(value.items) || value.items.length === 0) {
    return 'At least one purchase order item is required.'
  }

  for (const item of value.items) {
    if (
      !item
      || typeof item.description !== 'string'
      || !item.description.trim()
      || !Number.isFinite(item.quantity)
      || item.quantity <= 0
      || !Number.isFinite(item.unitPrice)
      || item.unitPrice < 0
    ) {
      return 'Each item must have a description, positive quantity, and valid unit price.'
    }
  }

  return ''
}

function validateInvoice(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return 'Invoice details must be a JSON object.'
  }

  if (typeof value.customerName !== 'string' || !value.customerName.trim()) {
    return 'Customer name is required.'
  }
  if (typeof value.email !== 'string' || (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email))) {
    return 'Enter a valid customer email address.'
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.invoiceDate || '')) {
    return 'A valid invoice date is required.'
  }
  if (value.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(value.dueDate)) {
    return 'Enter a valid due date.'
  }
  if (value.dueDate && value.dueDate < value.invoiceDate) {
    return 'The due date cannot be earlier than the invoice date.'
  }
  if (!Array.isArray(value.items) || value.items.length === 0) {
    return 'At least one invoice item is required.'
  }

  for (const item of value.items) {
    if (
      !item
      || typeof item.description !== 'string'
      || !item.description.trim()
      || !Number.isFinite(item.quantity)
      || item.quantity <= 0
      || !Number.isFinite(item.unitPrice)
      || item.unitPrice < 0
    ) {
      return 'Each item must have a description, positive quantity, and valid unit price.'
    }
  }

  return ''
}

function validateDebitNote(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return 'Debit note details must be a JSON object.'
  }

  if (typeof value.customerName !== 'string' || !value.customerName.trim()) {
    return 'Customer name is required.'
  }
  if (typeof value.email !== 'string' || (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email))) {
    return 'Enter a valid customer email address.'
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.noteDate || '')) {
    return 'A valid debit note date is required.'
  }
  if (!Array.isArray(value.items) || value.items.length === 0) {
    return 'At least one debit note item is required.'
  }

  for (const item of value.items) {
    if (
      !item
      || typeof item.description !== 'string'
      || !item.description.trim()
      || !Number.isFinite(item.quantity)
      || item.quantity <= 0
      || !Number.isFinite(item.amount)
      || item.amount < 0
    ) {
      return 'Each item must have a description, positive quantity, and valid amount.'
    }
  }

  return ''
}

function validateCreditNote(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return 'Credit note details must be a JSON object.'
  }

  if (typeof value.customerName !== 'string' || !value.customerName.trim()) {
    return 'Customer name is required.'
  }
  if (typeof value.email !== 'string' || (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email))) {
    return 'Enter a valid customer email address.'
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.noteDate || '')) {
    return 'A valid credit note date is required.'
  }
  if (!Array.isArray(value.items) || value.items.length === 0) {
    return 'At least one credit note item is required.'
  }

  for (const item of value.items) {
    if (
      !item
      || typeof item.description !== 'string'
      || !item.description.trim()
      || !Number.isFinite(item.quantity)
      || item.quantity <= 0
      || !Number.isFinite(item.amount)
      || item.amount < 0
    ) {
      return 'Each item must have a description, positive quantity, and valid amount.'
    }
  }

  return ''
}

async function readCreditNoteFile() {
  try {
    const contents = await readFile(creditNoteFilePath, 'utf8')
    const creditNotes = JSON.parse(contents)

    if (!Array.isArray(creditNotes)) {
      throw new Error('Credit note.json must contain a JSON array.')
    }

    return creditNotes
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  try {
    await writeFile(creditNoteFilePath, '[]\n', { encoding: 'utf8', flag: 'wx' })
    return []
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    return readCreditNoteFile()
  }
}

function validateDeliveryChallan(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return 'Delivery challan details must be a JSON object.'
  }

  if (typeof value.customerName !== 'string' || !value.customerName.trim()) {
    return 'Customer name is required.'
  }
  if (typeof value.email !== 'string' || (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email))) {
    return 'Enter a valid customer email address.'
  }
  if (typeof value.deliveryAddress !== 'string' || !value.deliveryAddress.trim()) {
    return 'Delivery address is required.'
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.dispatchDate || '')) {
    return 'A valid dispatch date is required.'
  }
  if (!Array.isArray(value.items) || value.items.length === 0) {
    return 'At least one delivery challan item is required.'
  }

  for (const item of value.items) {
    if (
      !item
      || typeof item.description !== 'string'
      || !item.description.trim()
      || !Number.isFinite(item.quantity)
      || item.quantity <= 0
    ) {
      return 'Each item must have a description and positive quantity.'
    }
  }

  return ''
}

async function readDeliveryChallanFile() {
  try {
    const contents = await readFile(deliveryChallanFilePath, 'utf8')
    const challans = JSON.parse(contents)

    if (!Array.isArray(challans)) {
      throw new Error('delivery challance.json must contain a JSON array.')
    }

    return challans
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  try {
    await writeFile(deliveryChallanFilePath, '[]\n', { encoding: 'utf8', flag: 'wx' })
    return []
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    return readDeliveryChallanFile()
  }
}

async function readDebitNoteFile() {
  try {
    const contents = await readFile(debitNoteFilePath, 'utf8')
    const debitNotes = JSON.parse(contents)

    if (!Array.isArray(debitNotes)) {
      throw new Error('Debit note.json must contain a JSON array.')
    }

    return debitNotes
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  try {
    await writeFile(debitNoteFilePath, '[]\n', { encoding: 'utf8', flag: 'wx' })
    return []
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    return readDebitNoteFile()
  }
}

async function readInvoiceFile() {
  try {
    const contents = await readFile(invoiceFilePath, 'utf8')
    const invoices = JSON.parse(contents)

    if (!Array.isArray(invoices)) {
      throw new Error('Invoice.json must contain a JSON array.')
    }

    return invoices
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  try {
    await writeFile(invoiceFilePath, '[]\n', { encoding: 'utf8', flag: 'wx' })
    return []
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    return readInvoiceFile()
  }
}

async function readPurchaseOrderFile() {
  try {
    const contents = await readFile(purchaseOrderFilePath, 'utf8')
    const purchaseOrders = JSON.parse(contents)

    if (!Array.isArray(purchaseOrders)) {
      throw new Error('purchase order.json must contain a JSON array.')
    }

    return purchaseOrders
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  try {
    await writeFile(purchaseOrderFilePath, '[]\n', { encoding: 'utf8', flag: 'wx' })
    return []
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    return readPurchaseOrderFile()
  }
}

async function readQuotationFile() {
  try {
    const contents = await readFile(quotationFilePath, 'utf8')
    const quotations = JSON.parse(contents)

    if (!Array.isArray(quotations)) {
      throw new Error('quotation.json must contain a JSON array.')
    }

    return quotations
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  const legacyQuotations = []
  try {
    const files = (await readdir(legacyDataDirectory)).filter((file) => file.endsWith('.json'))
    const storedQuotations = await Promise.all(files.map(async (file) => {
      const contents = await readFile(join(legacyDataDirectory, file), 'utf8')
      return JSON.parse(contents)
    }))
    legacyQuotations.push(...storedQuotations)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  try {
    await writeFile(quotationFilePath, `${JSON.stringify(legacyQuotations, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    })
    return legacyQuotations
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    return readQuotationFile()
  }
}

async function saveQuotation(value) {
  const id = `QT-${Date.now()}-${randomUUID().slice(0, 8)}`
  const items = value.items.map((item) => ({
    description: item.description.trim(),
    quantity: item.quantity,
    unitPrice: item.unitPrice,
  }))
  const quotation = {
    id,
    customerName: value.customerName.trim(),
    email: typeof value.email === 'string' ? value.email.trim() : '',
    phone: typeof value.phone === 'string' ? value.phone.trim() : '',
    address: typeof value.address === 'string' ? value.address.trim() : '',
    quotationDate: value.quotationDate,
    validUntil: value.validUntil || '',
    notes: typeof value.notes === 'string' ? value.notes.trim() : '',
    items,
    total: items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
    createdAt: new Date().toISOString(),
  }

  const saveOperation = writeQueue.then(async () => {
    const quotations = await readQuotationFile()
    const updatedQuotations = [quotation, ...quotations]
    const temporaryPath = `${quotationFilePath}.${randomUUID()}.tmp`

    await writeFile(temporaryPath, `${JSON.stringify(updatedQuotations, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    })
    await rename(temporaryPath, quotationFilePath)
    return quotation
  })

  writeQueue = saveOperation.then(() => undefined, () => undefined)
  return saveOperation
}

async function savePurchaseOrder(value) {
  const id = `PO-${Date.now()}-${randomUUID().slice(0, 8)}`
  const items = value.items.map((item) => ({
    description: item.description.trim(),
    quantity: item.quantity,
    unitPrice: item.unitPrice,
  }))
  const purchaseOrder = {
    id,
    supplierName: value.supplierName.trim(),
    email: typeof value.email === 'string' ? value.email.trim() : '',
    phone: typeof value.phone === 'string' ? value.phone.trim() : '',
    address: typeof value.address === 'string' ? value.address.trim() : '',
    orderDate: value.orderDate,
    expectedDelivery: value.expectedDelivery || '',
    notes: typeof value.notes === 'string' ? value.notes.trim() : '',
    items,
    total: items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
    createdAt: new Date().toISOString(),
  }

  const saveOperation = writeQueue.then(async () => {
    const purchaseOrders = await readPurchaseOrderFile()
    const updatedPurchaseOrders = [purchaseOrder, ...purchaseOrders]
    const temporaryPath = `${purchaseOrderFilePath}.${randomUUID()}.tmp`

    await writeFile(temporaryPath, `${JSON.stringify(updatedPurchaseOrders, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    })
    await rename(temporaryPath, purchaseOrderFilePath)
    return purchaseOrder
  })

  writeQueue = saveOperation.then(() => undefined, () => undefined)
  return saveOperation
}

async function listQuotations() {
  await writeQueue
  return readQuotationFile()
}

async function saveInvoice(value) {
  const id = `INV-${Date.now()}-${randomUUID().slice(0, 8)}`
  const items = value.items.map((item) => ({
    description: item.description.trim(),
    quantity: item.quantity,
    unitPrice: item.unitPrice,
  }))
  const invoice = {
    id,
    customerName: value.customerName.trim(),
    email: typeof value.email === 'string' ? value.email.trim() : '',
    phone: typeof value.phone === 'string' ? value.phone.trim() : '',
    address: typeof value.address === 'string' ? value.address.trim() : '',
    invoiceDate: value.invoiceDate,
    dueDate: value.dueDate || '',
    notes: typeof value.notes === 'string' ? value.notes.trim() : '',
    items,
    total: items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
    createdAt: new Date().toISOString(),
  }

  const saveOperation = writeQueue.then(async () => {
    const invoices = await readInvoiceFile()
    const updatedInvoices = [invoice, ...invoices]
    const temporaryPath = `${invoiceFilePath}.${randomUUID()}.tmp`

    await writeFile(temporaryPath, `${JSON.stringify(updatedInvoices, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    })
    await rename(temporaryPath, invoiceFilePath)
    return invoice
  })

  writeQueue = saveOperation.then(() => undefined, () => undefined)
  return saveOperation
}

async function listPurchaseOrders() {
  await writeQueue
  return readPurchaseOrderFile()
}

async function saveDebitNote(value) {
  const id = `DN-${Date.now()}-${randomUUID().slice(0, 8)}`
  const items = value.items.map((item) => ({
    description: item.description.trim(),
    quantity: item.quantity,
    amount: item.amount,
  }))
  const debitNote = {
    id,
    customerName: value.customerName.trim(),
    email: typeof value.email === 'string' ? value.email.trim() : '',
    phone: typeof value.phone === 'string' ? value.phone.trim() : '',
    address: typeof value.address === 'string' ? value.address.trim() : '',
    noteDate: value.noteDate,
    reference: typeof value.reference === 'string' ? value.reference.trim() : '',
    reason: typeof value.reason === 'string' ? value.reason.trim() : '',
    notes: typeof value.notes === 'string' ? value.notes.trim() : '',
    items,
    total: items.reduce((sum, item) => sum + item.quantity * item.amount, 0),
    createdAt: new Date().toISOString(),
  }

  const saveOperation = writeQueue.then(async () => {
    const debitNotes = await readDebitNoteFile()
    const updatedDebitNotes = [debitNote, ...debitNotes]
    const temporaryPath = `${debitNoteFilePath}.${randomUUID()}.tmp`

    await writeFile(temporaryPath, `${JSON.stringify(updatedDebitNotes, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    })
    await rename(temporaryPath, debitNoteFilePath)
    return debitNote
  })

  writeQueue = saveOperation.then(() => undefined, () => undefined)
  return saveOperation
}

async function saveCreditNote(value) {
  const id = `CN-${Date.now()}-${randomUUID().slice(0, 8)}`
  const items = value.items.map((item) => ({
    description: item.description.trim(),
    quantity: item.quantity,
    amount: item.amount,
  }))
  const creditNote = {
    id,
    customerName: value.customerName.trim(),
    email: typeof value.email === 'string' ? value.email.trim() : '',
    phone: typeof value.phone === 'string' ? value.phone.trim() : '',
    address: typeof value.address === 'string' ? value.address.trim() : '',
    noteDate: value.noteDate,
    reference: typeof value.reference === 'string' ? value.reference.trim() : '',
    reason: typeof value.reason === 'string' ? value.reason.trim() : '',
    notes: typeof value.notes === 'string' ? value.notes.trim() : '',
    items,
    total: items.reduce((sum, item) => sum + item.quantity * item.amount, 0),
    createdAt: new Date().toISOString(),
  }

  const saveOperation = writeQueue.then(async () => {
    const creditNotes = await readCreditNoteFile()
    const updatedCreditNotes = [creditNote, ...creditNotes]
    const temporaryPath = `${creditNoteFilePath}.${randomUUID()}.tmp`

    await writeFile(temporaryPath, `${JSON.stringify(updatedCreditNotes, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    })
    await rename(temporaryPath, creditNoteFilePath)
    return creditNote
  })

  writeQueue = saveOperation.then(() => undefined, () => undefined)
  return saveOperation
}

async function saveDeliveryChallan(value) {
  const id = `DC-${Date.now()}-${randomUUID().slice(0, 8)}`
  const items = value.items.map((item) => ({
    description: item.description.trim(),
    quantity: item.quantity,
  }))
  const challan = {
    id,
    customerName: value.customerName.trim(),
    email: typeof value.email === 'string' ? value.email.trim() : '',
    phone: typeof value.phone === 'string' ? value.phone.trim() : '',
    deliveryAddress: value.deliveryAddress.trim(),
    dispatchDate: value.dispatchDate,
    reference: typeof value.reference === 'string' ? value.reference.trim() : '',
    transporter: typeof value.transporter === 'string' ? value.transporter.trim() : '',
    vehicleNumber: typeof value.vehicleNumber === 'string' ? value.vehicleNumber.trim() : '',
    notes: typeof value.notes === 'string' ? value.notes.trim() : '',
    items,
    totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
    createdAt: new Date().toISOString(),
  }

  const saveOperation = writeQueue.then(async () => {
    const challans = await readDeliveryChallanFile()
    const updatedChallans = [challan, ...challans]
    const temporaryPath = `${deliveryChallanFilePath}.${randomUUID()}.tmp`

    await writeFile(temporaryPath, `${JSON.stringify(updatedChallans, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    })
    await rename(temporaryPath, deliveryChallanFilePath)
    return challan
  })

  writeQueue = saveOperation.then(() => undefined, () => undefined)
  return saveOperation
}

async function listInvoices() {
  await writeQueue
  return readInvoiceFile()
}

async function listDebitNotes() {
  await writeQueue
  return readDebitNoteFile()
}

async function listCreditNotes() {
  await writeQueue
  return readCreditNoteFile()
}

async function listDeliveryChallans() {
  await writeQueue
  return readDeliveryChallanFile()
}

export function createApiServer() {
  return createServer(async (request, response) => {
    const pathname = new URL(request.url || '/', 'http://localhost').pathname

    if (
      pathname !== '/api/quotations'
      && pathname !== '/api/purchase-orders'
      && pathname !== '/api/invoices'
      && pathname !== '/api/debit-notes'
      && pathname !== '/api/credit-notes'
      && pathname !== '/api/delivery-challans'
    ) {
      sendJson(response, 404, { error: 'API route not found.' })
      return
    }

    try {
      if (request.method === 'GET') {
        const records = pathname === '/api/quotations'
          ? await listQuotations()
          : pathname === '/api/purchase-orders'
            ? await listPurchaseOrders()
            : pathname === '/api/invoices'
              ? await listInvoices()
              : pathname === '/api/debit-notes'
                ? await listDebitNotes()
                : pathname === '/api/credit-notes'
                  ? await listCreditNotes()
                  : await listDeliveryChallans()
        sendJson(response, 200, records)
        return
      }

      if (request.method === 'POST') {
        const recordData = await readRequestBody(request)
        const isQuotation = pathname === '/api/quotations'
        const isPurchaseOrder = pathname === '/api/purchase-orders'
        const isInvoice = pathname === '/api/invoices'
        const isDebitNote = pathname === '/api/debit-notes'
        const isCreditNote = pathname === '/api/credit-notes'
        const validationError = isQuotation
          ? validateQuotation(recordData)
          : isPurchaseOrder
            ? validatePurchaseOrder(recordData)
            : isInvoice
              ? validateInvoice(recordData)
              : isDebitNote
                ? validateDebitNote(recordData)
                : isCreditNote
                  ? validateCreditNote(recordData)
                  : validateDeliveryChallan(recordData)

        if (validationError) {
          sendJson(response, 400, { error: validationError })
          return
        }

        const savedRecord = isQuotation
          ? await saveQuotation(recordData)
          : isPurchaseOrder
            ? await savePurchaseOrder(recordData)
            : isInvoice
              ? await saveInvoice(recordData)
              : isDebitNote
                ? await saveDebitNote(recordData)
                : isCreditNote
                  ? await saveCreditNote(recordData)
                  : await saveDeliveryChallan(recordData)
        sendJson(response, 201, savedRecord)
        return
      }

      response.setHeader('Allow', 'GET, POST')
      sendJson(response, 405, { error: 'Method not allowed.' })
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : 500
      if (status === 500) console.error('Quotation API error:', error)
      sendJson(response, status, {
        error: status === 500 ? 'The quotation could not be processed. Check the server logs.' : error.message,
      })
    }
  })
}

async function start() {
  const port = Number(process.env.API_PORT || 3001)
  const server = createApiServer()

  server.listen(port, '127.0.0.1', () => {
    console.log(`Document API listening on http://127.0.0.1:${port}`)
    console.log(`Quotation JSON file: ${quotationFilePath}`)
    console.log(`Purchase order JSON file: ${purchaseOrderFilePath}`)
    console.log(`Invoice JSON file: ${invoiceFilePath}`)
    console.log(`Debit note JSON file: ${debitNoteFilePath}`)
    console.log(`Credit note JSON file: ${creditNoteFilePath}`)
    console.log(`Delivery challan JSON file: ${deliveryChallanFilePath}`)
  })

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.close(() => process.exit(0)))
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  start().catch((error) => {
    console.error('Could not start the quotation API:', error)
    process.exitCode = 1
  })
}
