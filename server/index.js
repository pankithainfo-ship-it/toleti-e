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
  if (value.enquiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(value.enquiryDate)) {
    return 'Enter a valid enquiry date.'
  }
  if (
    (value.packingChargeRate !== undefined
      && (!Number.isFinite(value.packingChargeRate) || value.packingChargeRate < 0))
    || (value.gstRate !== undefined
      && (!Number.isFinite(value.gstRate) || value.gstRate < 0))
  ) {
    return 'P&F and GST rates must be valid non-negative numbers.'
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
  if (value.offerDate && !/^\d{4}-\d{2}-\d{2}$/.test(value.offerDate)) {
    return 'Enter a valid offer date.'
  }
  if (
    (value.packingChargeRate !== undefined
      && (!Number.isFinite(value.packingChargeRate) || value.packingChargeRate < 0))
    || (value.gstRate !== undefined
      && (!Number.isFinite(value.gstRate) || value.gstRate < 0))
  ) {
    return 'P&F and IGST rates must be valid non-negative numbers.'
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
  if (
    (value.purchaseOrderDate && !/^\d{4}-\d{2}-\d{2}$/.test(value.purchaseOrderDate))
    || (value.purchaseOrderReceivedDate && !/^\d{4}-\d{2}-\d{2}$/.test(value.purchaseOrderReceivedDate))
  ) {
    return 'Enter valid purchase order dates.'
  }
  if (
    ['packingChargeRate', 'cgstRate', 'sgstRate', 'courierCharges'].some((field) => (
      value[field] !== undefined && (!Number.isFinite(value[field]) || value[field] < 0)
    ))
  ) {
    return 'P&F, tax rates, and courier charges must be valid non-negative numbers.'
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
  if (
    ['purchaseOrderDate', 'invoiceDate', 'creditNoteDate', 'deliveryChallanDate'].some((field) => (
      value[field] && !/^\d{4}-\d{2}-\d{2}$/.test(value[field])
    ))
  ) {
    return 'Enter valid reference document dates.'
  }
  if (
    ['packingChargeRate', 'gstRate'].some((field) => (
      value[field] !== undefined && (!Number.isFinite(value[field]) || value[field] < 0)
    ))
  ) {
    return 'P&F and IGST rates must be valid non-negative numbers.'
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
  if (
    ['purchaseOrderDate', 'invoiceDate', 'deliveryChallanDate'].some((field) => (
      value[field] && !/^\d{4}-\d{2}-\d{2}$/.test(value[field])
    ))
  ) {
    return 'Enter valid reference document dates.'
  }
  if (
    ['cgstRate', 'sgstRate'].some((field) => (
      value[field] !== undefined && (!Number.isFinite(value[field]) || value[field] < 0)
    ))
  ) {
    return 'CGST and SGST rates must be valid non-negative numbers.'
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
  if (value.purchaseOrderDate && !/^\d{4}-\d{2}-\d{2}$/.test(value.purchaseOrderDate)) {
    return 'Enter a valid purchase order date.'
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
      || (item.rate !== undefined && (!Number.isFinite(item.rate) || item.rate < 0))
    ) {
      return 'Each item must have a description, positive quantity, and valid rate.'
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

function createQuotationRecord(value, id, createdAt) {
  const items = value.items.map((item) => ({
    description: item.description.trim(),
    hsnCode: typeof item.hsnCode === 'string' ? item.hsnCode.trim() : '',
    make: typeof item.make === 'string' ? item.make.trim() : '',
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    amount: Math.round(item.quantity * item.unitPrice * 100) / 100,
  }))
  const subtotal = Math.round(items.reduce((sum, item) => sum + item.amount, 0) * 100) / 100
  const packingChargeRate = value.packingChargeRate ?? 0
  const gstRate = value.gstRate ?? 0
  const packingCharge = Math.round(subtotal * packingChargeRate) / 100
  const gstAmount = Math.round((subtotal + packingCharge) * gstRate) / 100
  const quotation = {
    id,
    customerName: value.customerName.trim(),
    email: typeof value.email === 'string' ? value.email.trim() : '',
    phone: typeof value.phone === 'string' ? value.phone.trim() : '',
    address: typeof value.address === 'string' ? value.address.trim() : '',
    quotationDate: value.quotationDate,
    validUntil: value.validUntil || '',
    enquiryDate: value.enquiryDate || '',
    enquiryReference: typeof value.enquiryReference === 'string' ? value.enquiryReference.trim() : '',
    attention: typeof value.attention === 'string' ? value.attention.trim() : '',
    region: typeof value.region === 'string' ? value.region.trim() : '',
    freight: typeof value.freight === 'string' ? value.freight.trim() : '',
    deliveryTerms: typeof value.deliveryTerms === 'string' ? value.deliveryTerms.trim() : '',
    paymentTerms: typeof value.paymentTerms === 'string' ? value.paymentTerms.trim() : '',
    validityTerms: typeof value.validityTerms === 'string' ? value.validityTerms.trim() : '',
    freightTerms: typeof value.freightTerms === 'string' ? value.freightTerms.trim() : '',
    packingChargeRate,
    packingCharge,
    gstRate,
    gstAmount,
    subtotal,
    notes: typeof value.notes === 'string' ? value.notes.trim() : '',
    items,
    total: Math.round((subtotal + packingCharge + gstAmount) * 100) / 100,
    createdAt,
  }
  return quotation
}

async function writeQuotations(quotations) {
  const temporaryPath = `${quotationFilePath}.${randomUUID()}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(quotations, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  })
  await rename(temporaryPath, quotationFilePath)
}

async function saveQuotation(value) {
  const id = `QT-${Date.now()}-${randomUUID().slice(0, 8)}`
  const quotation = createQuotationRecord(value, id, new Date().toISOString())
  const saveOperation = writeQueue.then(async () => {
    const quotations = await readQuotationFile()
    await writeQuotations([quotation, ...quotations])
    return quotation
  })

  writeQueue = saveOperation.then(() => undefined, () => undefined)
  return saveOperation
}

async function updateQuotation(id, value) {
  const saveOperation = writeQueue.then(async () => {
    const quotations = await readQuotationFile()
    const quotationIndex = quotations.findIndex((quotation) => quotation.id === id)
    if (quotationIndex === -1) {
      const error = new Error('Quotation not found.')
      error.status = 404
      throw error
    }

    const existingQuotation = quotations[quotationIndex]
    const updatedQuotation = createQuotationRecord(
      value,
      existingQuotation.id,
      existingQuotation.createdAt || new Date().toISOString(),
    )
    const updatedQuotations = [...quotations]
    updatedQuotations[quotationIndex] = updatedQuotation
    await writeQuotations(updatedQuotations)
    return updatedQuotation
  })

  writeQueue = saveOperation.then(() => undefined, () => undefined)
  return saveOperation
}

async function deleteQuotation(id) {
  const saveOperation = writeQueue.then(async () => {
    const quotations = await readQuotationFile()
    const quotationIndex = quotations.findIndex((quotation) => quotation.id === id)
    if (quotationIndex === -1) {
      const error = new Error('Quotation not found.')
      error.status = 404
      throw error
    }

    const [deletedQuotation] = quotations.splice(quotationIndex, 1)
    await writeQuotations(quotations)
    return deletedQuotation
  })

  writeQueue = saveOperation.then(() => undefined, () => undefined)
  return saveOperation
}

function createPurchaseOrderRecord(value, id, createdAt) {
  const items = value.items.map((item) => ({
    description: item.description.trim(),
    hsnCode: typeof item.hsnCode === 'string' ? item.hsnCode.trim() : '',
    productCode: typeof item.productCode === 'string' ? item.productCode.trim() : '',
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    amount: Math.round(item.quantity * item.unitPrice * 100) / 100,
  }))
  const subtotal = Math.round(items.reduce((sum, item) => sum + item.amount, 0) * 100) / 100
  const packingChargeRate = value.packingChargeRate ?? 0
  const gstRate = value.gstRate ?? 0
  const packingCharge = Math.round(subtotal * packingChargeRate) / 100
  const gstAmount = Math.round((subtotal + packingCharge) * gstRate) / 100
  const purchaseOrder = {
    id,
    supplierName: value.supplierName.trim(),
    email: typeof value.email === 'string' ? value.email.trim() : '',
    phone: typeof value.phone === 'string' ? value.phone.trim() : '',
    address: typeof value.address === 'string' ? value.address.trim() : '',
    orderDate: value.orderDate,
    expectedDelivery: value.expectedDelivery || '',
    offerNumber: typeof value.offerNumber === 'string' ? value.offerNumber.trim() : '',
    offerDate: value.offerDate || '',
    dispatchMode: typeof value.dispatchMode === 'string' ? value.dispatchMode.trim() : '',
    gstNumber: typeof value.gstNumber === 'string' ? value.gstNumber.trim() : '',
    panNumber: typeof value.panNumber === 'string' ? value.panNumber.trim() : '',
    freightTerms: typeof value.freightTerms === 'string' ? value.freightTerms.trim() : '',
    paymentTerms: typeof value.paymentTerms === 'string' ? value.paymentTerms.trim() : '',
    discountTerms: typeof value.discountTerms === 'string' ? value.discountTerms.trim() : '',
    packingChargeRate,
    packingCharge,
    gstRate,
    gstAmount,
    subtotal,
    notes: typeof value.notes === 'string' ? value.notes.trim() : '',
    items,
    total: Math.round((subtotal + packingCharge + gstAmount) * 100) / 100,
    createdAt,
  }
  return purchaseOrder
}

async function writePurchaseOrders(purchaseOrders) {
  const temporaryPath = `${purchaseOrderFilePath}.${randomUUID()}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(purchaseOrders, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  })
  await rename(temporaryPath, purchaseOrderFilePath)
}

async function savePurchaseOrder(value) {
  const id = `PO-${Date.now()}-${randomUUID().slice(0, 8)}`
  const purchaseOrder = createPurchaseOrderRecord(value, id, new Date().toISOString())
  const saveOperation = writeQueue.then(async () => {
    const purchaseOrders = await readPurchaseOrderFile()
    await writePurchaseOrders([purchaseOrder, ...purchaseOrders])
    return purchaseOrder
  })

  writeQueue = saveOperation.then(() => undefined, () => undefined)
  return saveOperation
}

async function updatePurchaseOrder(id, value) {
  const saveOperation = writeQueue.then(async () => {
    const purchaseOrders = await readPurchaseOrderFile()
    const purchaseOrderIndex = purchaseOrders.findIndex((order) => order.id === id)
    if (purchaseOrderIndex === -1) {
      const error = new Error('Purchase order not found.')
      error.status = 404
      throw error
    }

    const existingPurchaseOrder = purchaseOrders[purchaseOrderIndex]
    const updatedPurchaseOrder = createPurchaseOrderRecord(
      value,
      existingPurchaseOrder.id,
      existingPurchaseOrder.createdAt || new Date().toISOString(),
    )
    const updatedPurchaseOrders = [...purchaseOrders]
    updatedPurchaseOrders[purchaseOrderIndex] = updatedPurchaseOrder
    await writePurchaseOrders(updatedPurchaseOrders)
    return updatedPurchaseOrder
  })

  writeQueue = saveOperation.then(() => undefined, () => undefined)
  return saveOperation
}

async function deletePurchaseOrder(id) {
  const saveOperation = writeQueue.then(async () => {
    const purchaseOrders = await readPurchaseOrderFile()
    const purchaseOrderIndex = purchaseOrders.findIndex((order) => order.id === id)
    if (purchaseOrderIndex === -1) {
      const error = new Error('Purchase order not found.')
      error.status = 404
      throw error
    }

    const [deletedPurchaseOrder] = purchaseOrders.splice(purchaseOrderIndex, 1)
    await writePurchaseOrders(purchaseOrders)
    return deletedPurchaseOrder
  })

  writeQueue = saveOperation.then(() => undefined, () => undefined)
  return saveOperation
}

async function listQuotations() {
  await writeQueue
  return readQuotationFile()
}

function createInvoiceRecord(value, id, createdAt) {
  const items = value.items.map((item) => ({
    description: item.description.trim(),
    hsnCode: typeof item.hsnCode === 'string' ? item.hsnCode.trim() : '',
    productCode: typeof item.productCode === 'string' ? item.productCode.trim() : '',
    make: typeof item.make === 'string' ? item.make.trim() : '',
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    amount: Math.round(item.quantity * item.unitPrice * 100) / 100,
  }))
  const itemSubtotal = Math.round(items.reduce((sum, item) => sum + item.amount, 0) * 100) / 100
  const packingChargeRate = value.packingChargeRate ?? 0
  const packingCharge = Math.round(itemSubtotal * packingChargeRate) / 100
  const courierCharges = value.courierCharges ?? 0
  const subtotal = Math.round((itemSubtotal + packingCharge + courierCharges) * 100) / 100
  const cgstRate = value.cgstRate ?? 0
  const sgstRate = value.sgstRate ?? 0
  const cgstAmount = Math.round(subtotal * cgstRate) / 100
  const sgstAmount = Math.round(subtotal * sgstRate) / 100
  const invoice = {
    id,
    customerName: value.customerName.trim(),
    email: typeof value.email === 'string' ? value.email.trim() : '',
    phone: typeof value.phone === 'string' ? value.phone.trim() : '',
    contactNumber: typeof value.contactNumber === 'string' ? value.contactNumber.trim() : '',
    address: typeof value.address === 'string' ? value.address.trim() : '',
    deliveryAddress: typeof value.deliveryAddress === 'string' ? value.deliveryAddress.trim() : '',
    invoiceDate: value.invoiceDate,
    dueDate: value.dueDate || '',
    purchaseOrderNumber: typeof value.purchaseOrderNumber === 'string' ? value.purchaseOrderNumber.trim() : '',
    purchaseOrderDate: value.purchaseOrderDate || '',
    purchaseOrderReceivedDate: value.purchaseOrderReceivedDate || '',
    freight: typeof value.freight === 'string' ? value.freight.trim() : '',
    paymentTerms: typeof value.paymentTerms === 'string' ? value.paymentTerms.trim() : '',
    modeOfDocuments: typeof value.modeOfDocuments === 'string' ? value.modeOfDocuments.trim() : '',
    region: typeof value.region === 'string' ? value.region.trim() : '',
    numberOfPackages: typeof value.numberOfPackages === 'string' ? value.numberOfPackages.trim() : '',
    placeOfSupply: typeof value.placeOfSupply === 'string' ? value.placeOfSupply.trim() : '',
    wayBillNumber: typeof value.wayBillNumber === 'string' ? value.wayBillNumber.trim() : '',
    contactPerson: typeof value.contactPerson === 'string' ? value.contactPerson.trim() : '',
    dispatchThrough: typeof value.dispatchThrough === 'string' ? value.dispatchThrough.trim() : '',
    courierDwbNumber: typeof value.courierDwbNumber === 'string' ? value.courierDwbNumber.trim() : '',
    gstNumber: typeof value.gstNumber === 'string' ? value.gstNumber.trim() : '',
    deliveryGstNumber: typeof value.deliveryGstNumber === 'string' ? value.deliveryGstNumber.trim() : '',
    packingChargeRate,
    packingCharge,
    courierCharges,
    cgstRate,
    cgstAmount,
    sgstRate,
    sgstAmount,
    itemSubtotal,
    subtotal,
    notes: typeof value.notes === 'string' ? value.notes.trim() : '',
    items,
    total: Math.round((subtotal + cgstAmount + sgstAmount) * 100) / 100,
    createdAt,
  }
  return invoice
}

async function writeInvoices(invoices) {
  const temporaryPath = `${invoiceFilePath}.${randomUUID()}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(invoices, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  })
  await rename(temporaryPath, invoiceFilePath)
}

async function saveInvoice(value) {
  const id = `INV-${Date.now()}-${randomUUID().slice(0, 8)}`
  const invoice = createInvoiceRecord(value, id, new Date().toISOString())
  const saveOperation = writeQueue.then(async () => {
    const invoices = await readInvoiceFile()
    await writeInvoices([invoice, ...invoices])
    return invoice
  })

  writeQueue = saveOperation.then(() => undefined, () => undefined)
  return saveOperation
}

async function updateInvoice(id, value) {
  const saveOperation = writeQueue.then(async () => {
    const invoices = await readInvoiceFile()
    const invoiceIndex = invoices.findIndex((invoice) => invoice.id === id)
    if (invoiceIndex === -1) {
      const error = new Error('Invoice not found.')
      error.status = 404
      throw error
    }

    const existingInvoice = invoices[invoiceIndex]
    const updatedInvoice = createInvoiceRecord(
      value,
      existingInvoice.id,
      existingInvoice.createdAt || new Date().toISOString(),
    )
    const updatedInvoices = [...invoices]
    updatedInvoices[invoiceIndex] = updatedInvoice
    await writeInvoices(updatedInvoices)
    return updatedInvoice
  })

  writeQueue = saveOperation.then(() => undefined, () => undefined)
  return saveOperation
}

async function deleteInvoice(id) {
  const saveOperation = writeQueue.then(async () => {
    const invoices = await readInvoiceFile()
    const invoiceIndex = invoices.findIndex((invoice) => invoice.id === id)
    if (invoiceIndex === -1) {
      const error = new Error('Invoice not found.')
      error.status = 404
      throw error
    }

    const [deletedInvoice] = invoices.splice(invoiceIndex, 1)
    await writeInvoices(invoices)
    return deletedInvoice
  })

  writeQueue = saveOperation.then(() => undefined, () => undefined)
  return saveOperation
}

async function listPurchaseOrders() {
  await writeQueue
  return readPurchaseOrderFile()
}

function createDebitNoteRecord(value, id, createdAt) {
  const items = value.items.map((item) => ({
    description: item.description.trim(),
    hsnCode: typeof item.hsnCode === 'string' ? item.hsnCode.trim() : '',
    productCode: typeof item.productCode === 'string' ? item.productCode.trim() : '',
    quantity: item.quantity,
    amount: item.amount,
    total: Math.round(item.quantity * item.amount * 100) / 100,
  }))
  const itemSubtotal = Math.round(items.reduce((sum, item) => sum + item.total, 0) * 100) / 100
  const packingChargeRate = value.packingChargeRate ?? 0
  const packingCharge = Math.round(itemSubtotal * packingChargeRate) / 100
  const subtotal = Math.round((itemSubtotal + packingCharge) * 100) / 100
  const gstRate = value.gstRate ?? 0
  const gstAmount = Math.round(subtotal * gstRate) / 100
  const debitNote = {
    id,
    customerName: value.customerName.trim(),
    email: typeof value.email === 'string' ? value.email.trim() : '',
    phone: typeof value.phone === 'string' ? value.phone.trim() : '',
    customerGstNumber: typeof value.customerGstNumber === 'string' ? value.customerGstNumber.trim() : '',
    address: typeof value.address === 'string' ? value.address.trim() : '',
    noteDate: value.noteDate,
    purchaseOrderNumber: typeof value.purchaseOrderNumber === 'string' ? value.purchaseOrderNumber.trim() : '',
    purchaseOrderDate: value.purchaseOrderDate || '',
    invoiceNumber: typeof value.invoiceNumber === 'string' ? value.invoiceNumber.trim() : '',
    invoiceDate: value.invoiceDate || '',
    creditNoteType: typeof value.creditNoteType === 'string' ? value.creditNoteType.trim() : '',
    creditNoteNumber: typeof value.creditNoteNumber === 'string' ? value.creditNoteNumber.trim() : '',
    creditNoteDate: value.creditNoteDate || '',
    deliveryChallanNumber: typeof value.deliveryChallanNumber === 'string' ? value.deliveryChallanNumber.trim() : '',
    deliveryChallanDate: value.deliveryChallanDate || '',
    reference: typeof value.reference === 'string' ? value.reference.trim() : '',
    reason: typeof value.reason === 'string' ? value.reason.trim() : '',
    packingChargeRate,
    packingCharge,
    gstRate,
    gstAmount,
    itemSubtotal,
    subtotal,
    comments: typeof value.comments === 'string' ? value.comments.trim() : '',
    notes: typeof value.notes === 'string' ? value.notes.trim() : '',
    items,
    total: Math.round((subtotal + gstAmount) * 100) / 100,
    createdAt,
  }
  return debitNote
}

async function writeDebitNotes(debitNotes) {
  const temporaryPath = `${debitNoteFilePath}.${randomUUID()}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(debitNotes, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  })
  await rename(temporaryPath, debitNoteFilePath)
}

async function saveDebitNote(value) {
  const id = `DN-${Date.now()}-${randomUUID().slice(0, 8)}`
  const debitNote = createDebitNoteRecord(value, id, new Date().toISOString())
  const saveOperation = writeQueue.then(async () => {
    const debitNotes = await readDebitNoteFile()
    await writeDebitNotes([debitNote, ...debitNotes])
    return debitNote
  })

  writeQueue = saveOperation.then(() => undefined, () => undefined)
  return saveOperation
}

async function updateDebitNote(id, value) {
  const saveOperation = writeQueue.then(async () => {
    const debitNotes = await readDebitNoteFile()
    const debitNoteIndex = debitNotes.findIndex((note) => note.id === id)
    if (debitNoteIndex === -1) {
      const error = new Error('Debit note not found.')
      error.status = 404
      throw error
    }

    const existingDebitNote = debitNotes[debitNoteIndex]
    const updatedDebitNote = createDebitNoteRecord(
      value,
      existingDebitNote.id,
      existingDebitNote.createdAt || new Date().toISOString(),
    )
    const updatedDebitNotes = [...debitNotes]
    updatedDebitNotes[debitNoteIndex] = updatedDebitNote
    await writeDebitNotes(updatedDebitNotes)
    return updatedDebitNote
  })

  writeQueue = saveOperation.then(() => undefined, () => undefined)
  return saveOperation
}

async function deleteDebitNote(id) {
  const saveOperation = writeQueue.then(async () => {
    const debitNotes = await readDebitNoteFile()
    const debitNoteIndex = debitNotes.findIndex((note) => note.id === id)
    if (debitNoteIndex === -1) {
      const error = new Error('Debit note not found.')
      error.status = 404
      throw error
    }

    const [deletedDebitNote] = debitNotes.splice(debitNoteIndex, 1)
    await writeDebitNotes(debitNotes)
    return deletedDebitNote
  })

  writeQueue = saveOperation.then(() => undefined, () => undefined)
  return saveOperation
}

function createCreditNoteRecord(value, id, createdAt) {
  const items = value.items.map((item) => ({
    description: item.description.trim(),
    productCode: typeof item.productCode === 'string' ? item.productCode.trim() : '',
    hsnCode: typeof item.hsnCode === 'string' ? item.hsnCode.trim() : '',
    quantity: item.quantity,
    amount: item.amount,
    total: Math.round(item.quantity * item.amount * 100) / 100,
  }))
  const subtotal = Math.round(items.reduce((sum, item) => sum + item.total, 0) * 100) / 100
  const cgstRate = value.cgstRate ?? 0
  const sgstRate = value.sgstRate ?? 0
  const cgstAmount = Math.round(subtotal * cgstRate) / 100
  const sgstAmount = Math.round(subtotal * sgstRate) / 100
  const creditNote = {
    id,
    customerName: value.customerName.trim(),
    email: typeof value.email === 'string' ? value.email.trim() : '',
    phone: typeof value.phone === 'string' ? value.phone.trim() : '',
    customerGstNumber: typeof value.customerGstNumber === 'string' ? value.customerGstNumber.trim() : '',
    address: typeof value.address === 'string' ? value.address.trim() : '',
    noteDate: value.noteDate,
    purchaseOrderNumber: typeof value.purchaseOrderNumber === 'string' ? value.purchaseOrderNumber.trim() : '',
    purchaseOrderDate: value.purchaseOrderDate || '',
    invoiceNumber: typeof value.invoiceNumber === 'string' ? value.invoiceNumber.trim() : '',
    invoiceDate: value.invoiceDate || '',
    creditNoteType: typeof value.creditNoteType === 'string' ? value.creditNoteType.trim() : '',
    deliveryChallanNumber: typeof value.deliveryChallanNumber === 'string' ? value.deliveryChallanNumber.trim() : '',
    deliveryChallanDate: value.deliveryChallanDate || '',
    reference: typeof value.reference === 'string' ? value.reference.trim() : '',
    reason: typeof value.reason === 'string' ? value.reason.trim() : '',
    cgstRate,
    cgstAmount,
    sgstRate,
    sgstAmount,
    subtotal,
    comments: typeof value.comments === 'string' ? value.comments.trim() : '',
    notes: typeof value.notes === 'string' ? value.notes.trim() : '',
    items,
    total: Math.round((subtotal + cgstAmount + sgstAmount) * 100) / 100,
    createdAt,
  }
  return creditNote
}

async function writeCreditNotes(creditNotes) {
  const temporaryPath = `${creditNoteFilePath}.${randomUUID()}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(creditNotes, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  })
  await rename(temporaryPath, creditNoteFilePath)
}

async function saveCreditNote(value) {
  const id = `CN-${Date.now()}-${randomUUID().slice(0, 8)}`
  const creditNote = createCreditNoteRecord(value, id, new Date().toISOString())
  const saveOperation = writeQueue.then(async () => {
    const creditNotes = await readCreditNoteFile()
    await writeCreditNotes([creditNote, ...creditNotes])
    return creditNote
  })

  writeQueue = saveOperation.then(() => undefined, () => undefined)
  return saveOperation
}

async function updateCreditNote(id, value) {
  const saveOperation = writeQueue.then(async () => {
    const creditNotes = await readCreditNoteFile()
    const creditNoteIndex = creditNotes.findIndex((note) => note.id === id)
    if (creditNoteIndex === -1) {
      const error = new Error('Credit note not found.')
      error.status = 404
      throw error
    }

    const existingCreditNote = creditNotes[creditNoteIndex]
    const updatedCreditNote = createCreditNoteRecord(
      value,
      existingCreditNote.id,
      existingCreditNote.createdAt || new Date().toISOString(),
    )
    const updatedCreditNotes = [...creditNotes]
    updatedCreditNotes[creditNoteIndex] = updatedCreditNote
    await writeCreditNotes(updatedCreditNotes)
    return updatedCreditNote
  })

  writeQueue = saveOperation.then(() => undefined, () => undefined)
  return saveOperation
}

async function deleteCreditNote(id) {
  const saveOperation = writeQueue.then(async () => {
    const creditNotes = await readCreditNoteFile()
    const creditNoteIndex = creditNotes.findIndex((note) => note.id === id)
    if (creditNoteIndex === -1) {
      const error = new Error('Credit note not found.')
      error.status = 404
      throw error
    }

    const [deletedCreditNote] = creditNotes.splice(creditNoteIndex, 1)
    await writeCreditNotes(creditNotes)
    return deletedCreditNote
  })

  writeQueue = saveOperation.then(() => undefined, () => undefined)
  return saveOperation
}

function createDeliveryChallanRecord(value, id, createdAt) {
  const items = value.items.map((item) => ({
    description: item.description.trim(),
    hsnCode: typeof item.hsnCode === 'string' ? item.hsnCode.trim() : '',
    productCode: typeof item.productCode === 'string' ? item.productCode.trim() : '',
    make: typeof item.make === 'string' ? item.make.trim() : '',
    quantity: item.quantity,
    rate: item.rate ?? 0,
    amount: Math.round(item.quantity * (item.rate ?? 0) * 100) / 100,
  }))
  const challan = {
    id,
    customerName: value.customerName.trim(),
    email: typeof value.email === 'string' ? value.email.trim() : '',
    phone: typeof value.phone === 'string' ? value.phone.trim() : '',
    customerGstNumber: typeof value.customerGstNumber === 'string' ? value.customerGstNumber.trim() : '',
    customerPanNumber: typeof value.customerPanNumber === 'string' ? value.customerPanNumber.trim() : '',
    billingAddress: typeof value.billingAddress === 'string' ? value.billingAddress.trim() : '',
    deliveryAddress: value.deliveryAddress.trim(),
    dispatchDate: value.dispatchDate,
    invoiceNumber: typeof value.invoiceNumber === 'string' ? value.invoiceNumber.trim() : '',
    purchaseOrderNumber: typeof value.purchaseOrderNumber === 'string' ? value.purchaseOrderNumber.trim() : '',
    purchaseOrderDate: value.purchaseOrderDate || '',
    paymentTerms: typeof value.paymentTerms === 'string' ? value.paymentTerms.trim() : '',
    regionCode: typeof value.regionCode === 'string' ? value.regionCode.trim() : '',
    numberOfPackages: typeof value.numberOfPackages === 'string' ? value.numberOfPackages.trim() : '',
    contactPerson: typeof value.contactPerson === 'string' ? value.contactPerson.trim() : '',
    reference: typeof value.reference === 'string' ? value.reference.trim() : '',
    transporter: typeof value.transporter === 'string' ? value.transporter.trim() : '',
    dispatchThrough: typeof value.dispatchThrough === 'string' ? value.dispatchThrough.trim() : '',
    vehicleNumber: typeof value.vehicleNumber === 'string' ? value.vehicleNumber.trim() : '',
    notes: typeof value.notes === 'string' ? value.notes.trim() : '',
    items,
    totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
    totalAmount: Math.round(items.reduce((sum, item) => sum + item.amount, 0) * 100) / 100,
    createdAt,
  }
  return challan
}

async function writeDeliveryChallans(challans) {
  const temporaryPath = `${deliveryChallanFilePath}.${randomUUID()}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(challans, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  })
  await rename(temporaryPath, deliveryChallanFilePath)
}

async function saveDeliveryChallan(value) {
  const id = `DC-${Date.now()}-${randomUUID().slice(0, 8)}`
  const challan = createDeliveryChallanRecord(value, id, new Date().toISOString())
  const saveOperation = writeQueue.then(async () => {
    const challans = await readDeliveryChallanFile()
    await writeDeliveryChallans([challan, ...challans])
    return challan
  })

  writeQueue = saveOperation.then(() => undefined, () => undefined)
  return saveOperation
}

async function updateDeliveryChallan(id, value) {
  const saveOperation = writeQueue.then(async () => {
    const challans = await readDeliveryChallanFile()
    const challanIndex = challans.findIndex((entry) => entry.id === id)
    if (challanIndex === -1) {
      const error = new Error('Delivery challan not found.')
      error.status = 404
      throw error
    }

    const existingChallan = challans[challanIndex]
    const updatedChallan = createDeliveryChallanRecord(
      value,
      existingChallan.id,
      existingChallan.createdAt || new Date().toISOString(),
    )
    const updatedChallans = [...challans]
    updatedChallans[challanIndex] = updatedChallan
    await writeDeliveryChallans(updatedChallans)
    return updatedChallan
  })

  writeQueue = saveOperation.then(() => undefined, () => undefined)
  return saveOperation
}

async function deleteDeliveryChallan(id) {
  const saveOperation = writeQueue.then(async () => {
    const challans = await readDeliveryChallanFile()
    const challanIndex = challans.findIndex((entry) => entry.id === id)
    if (challanIndex === -1) {
      const error = new Error('Delivery challan not found.')
      error.status = 404
      throw error
    }

    const [deletedChallan] = challans.splice(challanIndex, 1)
    await writeDeliveryChallans(challans)
    return deletedChallan
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
    const isQuotationRoute = pathname === '/api/quotations' || pathname.startsWith('/api/quotations/')
    const quotationIdMatch = pathname.match(/^\/api\/quotations\/([^/]+)$/)
    const purchaseOrderIdMatch = pathname.match(/^\/api\/purchase-orders\/([^/]+)$/)
    const invoiceIdMatch = pathname.match(/^\/api\/invoices\/([^/]+)$/)
    const debitNoteIdMatch = pathname.match(/^\/api\/debit-notes\/([^/]+)$/)
    const creditNoteIdMatch = pathname.match(/^\/api\/credit-notes\/([^/]+)$/)
    const deliveryChallanIdMatch = pathname.match(/^\/api\/delivery-challans\/([^/]+)$/)

    if (
      !isQuotationRoute
      && pathname !== '/api/purchase-orders'
      && !purchaseOrderIdMatch
      && pathname !== '/api/invoices'
      && !invoiceIdMatch
      && pathname !== '/api/debit-notes'
      && !debitNoteIdMatch
      && pathname !== '/api/credit-notes'
      && !creditNoteIdMatch
      && pathname !== '/api/delivery-challans'
      && !deliveryChallanIdMatch
    ) {
      sendJson(response, 404, { error: 'API route not found.' })
      return
    }

    try {
      if (isQuotationRoute && pathname !== '/api/quotations') {
        if (!quotationIdMatch) {
          sendJson(response, 404, { error: 'Quotation route not found.' })
          return
        }

        let quotationId
        try {
          quotationId = decodeURIComponent(quotationIdMatch[1])
        } catch {
          sendJson(response, 400, { error: 'Quotation ID is invalid.' })
          return
        }

        if (request.method === 'DELETE') {
          const deletedQuotation = await deleteQuotation(quotationId)
          sendJson(response, 200, deletedQuotation)
          return
        }

        if (request.method === 'PUT') {
          const recordData = await readRequestBody(request)
          const validationError = validateQuotation(recordData)
          if (validationError) {
            sendJson(response, 400, { error: validationError })
            return
          }
          const updatedQuotation = await updateQuotation(quotationId, recordData)
          sendJson(response, 200, updatedQuotation)
          return
        }

        response.setHeader('Allow', 'PUT, DELETE')
        sendJson(response, 405, { error: 'Method not allowed.' })
        return
      }

      if (purchaseOrderIdMatch) {
        let purchaseOrderId
        try {
          purchaseOrderId = decodeURIComponent(purchaseOrderIdMatch[1])
        } catch {
          sendJson(response, 400, { error: 'Purchase order ID is invalid.' })
          return
        }

        if (request.method === 'DELETE') {
          const deletedPurchaseOrder = await deletePurchaseOrder(purchaseOrderId)
          sendJson(response, 200, deletedPurchaseOrder)
          return
        }

        if (request.method === 'PUT') {
          const recordData = await readRequestBody(request)
          const validationError = validatePurchaseOrder(recordData)
          if (validationError) {
            sendJson(response, 400, { error: validationError })
            return
          }
          const updatedPurchaseOrder = await updatePurchaseOrder(purchaseOrderId, recordData)
          sendJson(response, 200, updatedPurchaseOrder)
          return
        }

        response.setHeader('Allow', 'PUT, DELETE')
        sendJson(response, 405, { error: 'Method not allowed.' })
        return
      }

      if (invoiceIdMatch) {
        let invoiceId
        try {
          invoiceId = decodeURIComponent(invoiceIdMatch[1])
        } catch {
          sendJson(response, 400, { error: 'Invoice ID is invalid.' })
          return
        }

        if (request.method === 'DELETE') {
          const deletedInvoice = await deleteInvoice(invoiceId)
          sendJson(response, 200, deletedInvoice)
          return
        }

        if (request.method === 'PUT') {
          const recordData = await readRequestBody(request)
          const validationError = validateInvoice(recordData)
          if (validationError) {
            sendJson(response, 400, { error: validationError })
            return
          }
          const updatedInvoice = await updateInvoice(invoiceId, recordData)
          sendJson(response, 200, updatedInvoice)
          return
        }

        response.setHeader('Allow', 'PUT, DELETE')
        sendJson(response, 405, { error: 'Method not allowed.' })
        return
      }

      if (debitNoteIdMatch) {
        let debitNoteId
        try {
          debitNoteId = decodeURIComponent(debitNoteIdMatch[1])
        } catch {
          sendJson(response, 400, { error: 'Debit note ID is invalid.' })
          return
        }

        if (request.method === 'DELETE') {
          const deletedDebitNote = await deleteDebitNote(debitNoteId)
          sendJson(response, 200, deletedDebitNote)
          return
        }

        if (request.method === 'PUT') {
          const recordData = await readRequestBody(request)
          const validationError = validateDebitNote(recordData)
          if (validationError) {
            sendJson(response, 400, { error: validationError })
            return
          }
          const updatedDebitNote = await updateDebitNote(debitNoteId, recordData)
          sendJson(response, 200, updatedDebitNote)
          return
        }

        response.setHeader('Allow', 'PUT, DELETE')
        sendJson(response, 405, { error: 'Method not allowed.' })
        return
      }

      if (creditNoteIdMatch) {
        let creditNoteId
        try {
          creditNoteId = decodeURIComponent(creditNoteIdMatch[1])
        } catch {
          sendJson(response, 400, { error: 'Credit note ID is invalid.' })
          return
        }

        if (request.method === 'DELETE') {
          const deletedCreditNote = await deleteCreditNote(creditNoteId)
          sendJson(response, 200, deletedCreditNote)
          return
        }

        if (request.method === 'PUT') {
          const recordData = await readRequestBody(request)
          const validationError = validateCreditNote(recordData)
          if (validationError) {
            sendJson(response, 400, { error: validationError })
            return
          }
          const updatedCreditNote = await updateCreditNote(creditNoteId, recordData)
          sendJson(response, 200, updatedCreditNote)
          return
        }

        response.setHeader('Allow', 'PUT, DELETE')
        sendJson(response, 405, { error: 'Method not allowed.' })
        return
      }

      if (deliveryChallanIdMatch) {
        let deliveryChallanId
        try {
          deliveryChallanId = decodeURIComponent(deliveryChallanIdMatch[1])
        } catch {
          sendJson(response, 400, { error: 'Delivery challan ID is invalid.' })
          return
        }

        if (request.method === 'DELETE') {
          const deletedChallan = await deleteDeliveryChallan(deliveryChallanId)
          sendJson(response, 200, deletedChallan)
          return
        }

        if (request.method === 'PUT') {
          const recordData = await readRequestBody(request)
          const validationError = validateDeliveryChallan(recordData)
          if (validationError) {
            sendJson(response, 400, { error: validationError })
            return
          }
          const updatedChallan = await updateDeliveryChallan(deliveryChallanId, recordData)
          sendJson(response, 200, updatedChallan)
          return
        }

        response.setHeader('Allow', 'PUT, DELETE')
        sendJson(response, 405, { error: 'Method not allowed.' })
        return
      }

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
