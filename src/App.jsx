import { useState } from 'react'
import './App.css'
import credentials from './credentials.json'
import Quotation from './components/Quotation.jsx'
import PurchaseOrder from './components/PurchaseOrder.jsx'
import Invoice from './components/Invoice.jsx'
import DebitNote from './components/DebitNote.jsx'
import CreditNote from './components/CreditNote.jsx'
import DeliveryChallan from './components/DeliveryChallan.jsx'

const AUTH_SESSION_KEY = 'toleti-authenticated'

const searchableDocumentTypes = [
  { name: 'Quotations', endpoint: '/api/quotations' },
  { name: 'Purchase Order', endpoint: '/api/purchase-orders' },
  { name: 'Invoice', endpoint: '/api/invoices' },
  { name: 'Debit Note', endpoint: '/api/debit-notes' },
  { name: 'Credit Note', endpoint: '/api/credit-notes' },
  { name: 'Delivery Challan', endpoint: '/api/delivery-challans' },
]

const services = [
  {
    name: 'Quotations',
    icon: 'Q',
    description: 'Prepare and keep track of customer quotations.',
  },
  {
    name: 'Purchase Order',
    icon: 'PO',
    description: 'Organize purchase orders and supplier details.',
  },
  {
    name: 'Invoice',
    icon: 'IN',
    description: 'Create and manage customer invoices.',
  },
  {
    name: 'Debit Note',
    icon: 'DN',
    description: 'Record adjustments with debit notes.',
  },
  {
    name: 'Credit Note',
    icon: 'CN',
    description: 'Record adjustments with credit notes.',
  },
  {
    name: 'Delivery Challan',
    icon: 'DC',
    description: 'Track goods dispatched to your customers.',
  },
]

function getDocumentSearchValues(document) {
  const dateValues = Object.entries(document)
    .filter(([key, value]) => /date/i.test(key) && typeof value === 'string')
    .flatMap(([, value]) => {
      if (!value) return []
      const values = [value]
      const isoDate = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      const localDate = value.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/)
      if (isoDate) values.push(`${isoDate[3]}-${isoDate[2]}-${isoDate[1]}`)
      if (localDate) values.push(`${localDate[3]}-${localDate[2]}-${localDate[1]}`)
      return values
    })

  return [
    document.id,
    document.customerName,
    document.supplierName,
    document.phone,
    ...dateValues,
  ].filter((value) => typeof value === 'string' && value.trim())
}

function matchesDocumentSearch(document, query) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return false
  const queryValues = [normalizedQuery]
  const localDate = normalizedQuery.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (localDate) {
    const [, day, month, year] = localDate
    queryValues.push(
      `${day.padStart(2, '0')}-${month.padStart(2, '0')}-${year}`,
      `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`,
    )
  }

  if (getDocumentSearchValues(document).some((value) => (
    queryValues.some((queryValue) => value.toLowerCase().includes(queryValue))
  ))) {
    return true
  }

  const compactPhoneQuery = normalizedQuery.replace(/\D/g, '')
  return /^[+\d().\s-]+$/.test(query.trim())
    && compactPhoneQuery.length >= 4
    && typeof document.phone === 'string'
    && document.phone.replace(/\D/g, '').includes(compactPhoneQuery)
}

function App() {
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => sessionStorage.getItem(AUTH_SESSION_KEY) === 'true'
      || localStorage.getItem(AUTH_SESSION_KEY) === 'true',
  )
  const [activeService, setActiveService] = useState('Overview')
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchDocuments, setSearchDocuments] = useState([])
  const [isSearchLoading, setIsSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState('')

  function handleSubmit(event) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const email = String(formData.get('email') || '').trim().toLowerCase()
    const password = String(formData.get('password') || '')

    if (email !== credentials.email.toLowerCase() || password !== credentials.password) {
      setMessage('The email address or password is incorrect.')
      return
    }

    setMessage('')
    setActiveService('Overview')
    setIsAuthenticated(true)
    if (formData.get('remember')) {
      sessionStorage.removeItem(AUTH_SESSION_KEY)
      localStorage.setItem(AUTH_SESSION_KEY, 'true')
    } else {
      localStorage.removeItem(AUTH_SESSION_KEY)
      sessionStorage.setItem(AUTH_SESSION_KEY, 'true')
    }
  }

  function handleSignOut() {
    sessionStorage.removeItem(AUTH_SESSION_KEY)
    localStorage.removeItem(AUTH_SESSION_KEY)
    setIsAuthenticated(false)
  }

  async function handleSearchToggle() {
    if (isSearchOpen) {
      setIsSearchOpen(false)
      return
    }

    setIsSearchOpen(true)
    setIsSearchLoading(true)
    setSearchError('')

    try {
      const results = await Promise.all(searchableDocumentTypes.map(async (type) => {
        const response = await fetch(type.endpoint)
        const body = await response.text()
        let documents

        try {
          documents = JSON.parse(body)
        } catch {
          throw new Error(`${type.name} returned an invalid response (HTTP ${response.status}).`)
        }

        if (!response.ok) {
          throw new Error(documents.error || `${type.name} returned HTTP ${response.status}.`)
        }
        if (!Array.isArray(documents)) {
          throw new Error(`${type.name} returned invalid document data.`)
        }

        return documents.map((document) => ({ ...document, documentType: type.name }))
      }))
      setSearchDocuments(results.flat())
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'Could not load documents for search.')
    } finally {
      setIsSearchLoading(false)
    }
  }

  if (isAuthenticated) {
    const selectedService = services.find((service) => service.name === activeService)
    const searchResults = searchDocuments.filter((document) => (
      matchesDocumentSearch(document, searchQuery)
    ))

    return (
      <main className="dashboard-page">
        <header className="dashboard-header">
          <a className="dashboard-brand" href="/" aria-label="Toleti dashboard">
            <span className="dashboard-brand-mark" aria-hidden="true">T</span>
            <span>toleti<span className="dashboard-brand-dot">.</span></span>
          </a>
          <button
            className="dashboard-search-button"
            type="button"
            aria-expanded={isSearchOpen}
            aria-controls="dashboard-search-panel"
            onClick={handleSearchToggle}
          >
            <span aria-hidden="true">⌕</span>
            Search documents
          </button>
          <div className="dashboard-account">
            <div className="account-details">
              <span className="account-name">Administrator</span>
              <span className="account-email">{credentials.email}</span>
            </div>
            <button className="sign-out-button" type="button" onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        </header>

        {isSearchOpen && (
          <section className="dashboard-search-panel" id="dashboard-search-panel" aria-label="Search documents">
            <label htmlFor="dashboard-search-input">Search by name, phone, date, quotation or order number</label>
            <input
              id="dashboard-search-input"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Enter a name, phone number, date, or document number"
              autoFocus
            />
            {isSearchLoading ? (
              <p className="dashboard-search-status" role="status">Loading documents…</p>
            ) : searchError ? (
              <p className="dashboard-search-error" role="alert">{searchError}</p>
            ) : searchQuery.trim() ? (
              searchResults.length ? (
                <>
                  <p className="dashboard-search-status" role="status">
                    {searchResults.length} matching {searchResults.length === 1 ? 'document' : 'documents'}
                  </p>
                  <ul className="dashboard-search-results">
                    {searchResults.map((document) => (
                      <li key={`${document.documentType}-${document.id}`}>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveService(document.documentType)
                            setIsSearchOpen(false)
                          }}
                        >
                          <span>
                            <strong>{document.customerName || document.supplierName || 'Unnamed record'}</strong>
                            <small>{document.documentType} · {document.id}</small>
                          </span>
                          <span className="dashboard-search-result-meta">
                            {document.phone || Object.entries(document).find(([key, value]) => (
                              /date/i.test(key) && typeof value === 'string' && value
                            ))?.[1] || ''}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="dashboard-search-status" role="status">No matching documents found.</p>
              )
            ) : (
              <p className="dashboard-search-status">
                Search all document types by name, phone number, date, or document number.
              </p>
            )}
          </section>
        )}

        <div className="dashboard-layout">
          <aside className="dashboard-sidebar" aria-label="Dashboard navigation">
            <p className="sidebar-label">WORKSPACE</p>
            <nav className="service-navigation" aria-label="Services">
              <button
                className={`navigation-item${activeService === 'Overview' ? ' is-active' : ''}`}
                type="button"
                aria-current={activeService === 'Overview' ? 'page' : undefined}
                onClick={() => setActiveService('Overview')}
              >
                <span className="navigation-icon" aria-hidden="true">⌂</span>
                <span>Overview</span>
              </button>
              {services.map((service) => (
                <button
                  className={`navigation-item${activeService === service.name ? ' is-active' : ''}`}
                  key={service.name}
                  type="button"
                  aria-current={activeService === service.name ? 'page' : undefined}
                  onClick={() => setActiveService(service.name)}
                >
                  <span className="navigation-icon service-navigation-icon" aria-hidden="true">{service.icon}</span>
                  <span>{service.name}</span>
                </button>
              ))}
            </nav>
            <div className="sidebar-note">
              <span className="sidebar-note-mark" aria-hidden="true">✓</span>
              <p>Your business workspace, all in one place.</p>
            </div>
          </aside>

          <section className="dashboard-content" aria-live="polite">
            {activeService === 'Quotations' ? (
              <Quotation onBack={() => setActiveService('Overview')} />
            ) : activeService === 'Purchase Order' ? (
              <PurchaseOrder onBack={() => setActiveService('Overview')} />
            ) : activeService === 'Invoice' ? (
              <Invoice onBack={() => setActiveService('Overview')} />
            ) : activeService === 'Debit Note' ? (
              <DebitNote onBack={() => setActiveService('Overview')} />
            ) : activeService === 'Credit Note' ? (
              <CreditNote onBack={() => setActiveService('Overview')} />
            ) : activeService === 'Delivery Challan' ? (
              <DeliveryChallan onBack={() => setActiveService('Overview')} />
            ) : selectedService ? (
              <>
                <p className="dashboard-eyebrow">DOCUMENTS</p>
                <h1>{selectedService.name}</h1>
                <p className="dashboard-description">{selectedService.description}</p>
                <div className="empty-state">
                  <span className="empty-state-icon" aria-hidden="true">{selectedService.icon}</span>
                  <h2>Your {selectedService.name.toLowerCase()} will appear here</h2>
                  <p>There are no {selectedService.name.toLowerCase()} to show yet.</p>
                </div>
              </>
            ) : (
              <>
                <p className="dashboard-eyebrow">TOLETI ENTERPRISES</p>
                <h1>Good to see you, Administrator</h1>
                <p className="dashboard-description">
                  Manage your business documents from one convenient workspace.
                </p>
                <h2 className="services-heading">Your services</h2>
                <div className="service-cards">
                  {services.map((service) => (
                    <button
                      className="service-card"
                      key={service.name}
                      type="button"
                      onClick={() => setActiveService(service.name)}
                    >
                      <span className="service-card-icon" aria-hidden="true">{service.icon}</span>
                      <span className="service-card-title">{service.name}</span>
                      <span className="service-card-description">{service.description}</span>
                      <span className="service-card-link">Open service <span aria-hidden="true">→</span></span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    )
  }

  return (
    <main className="login-page">
      <section className="welcome-panel" aria-label="Toleti Enterprises">
        <a className="brand" href="/" aria-label="Toleti Enterprises home">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 40 40" fill="none">
              <path d="M5 18.5 20 6l15 12.5v15H5v-15Z" />
              <path d="M15 33.5V22h10v11.5M3 18.5 20 4l17 14.5" />
            </svg>
          </span>
          <span className="brand-name">toleti<span>.</span></span>
        </a>

        <div className="welcome-copy">
          <p className="eyebrow">TOLETI ENTERPRISES</p>
          <h1>Find your place in the world.</h1>
          <p className="welcome-description">
            A better way to manage your property journey starts here.
          </p>
        </div>

        <div className="building-art" aria-hidden="true">
          <div className="sun-disc" />
          <div className="building building-back">
            <i /><i /><i /><i /><i /><i />
          </div>
          <div className="building building-front">
            <div className="building-roof" />
            <div className="building-windows">
              <i /><i /><i /><i /><i /><i /><i /><i />
            </div>
            <div className="building-door" />
          </div>
          <div className="plant plant-left"><i /><i /><i /></div>
          <div className="plant plant-right"><i /><i /><i /></div>
          <div className="art-ground" />
        </div>

        <p className="panel-footer">A place to call your own.</p>
      </section>

      <section className="form-panel">
        <div className="mobile-brand">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 40 40" fill="none">
              <path d="M5 18.5 20 6l15 12.5v15H5v-15Z" />
              <path d="M15 33.5V22h10v11.5M3 18.5 20 4l17 14.5" />
            </svg>
          </span>
          <span className="brand-name">toleti<span>.</span></span>
        </div>

        <div className="login-card">
          <div className="form-heading">
            <p className="eyebrow">WELCOME BACK</p>
            <h2>Sign in to your account</h2>
            <p>Enter your details below to continue.</p>
          </div>

          <form onSubmit={handleSubmit}>
            <label htmlFor="email">Email address</label>
            <div className="input-wrap">
              <svg className="input-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
                <path d="m4.5 7 7.5 5.5L19.5 7" />
              </svg>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>

            <div className="password-label-row">
              <label htmlFor="password">Password</label>
              <button className="text-button" type="button" onClick={() => setMessage('Please contact your administrator to reset your password.')}>
                Forgot password?
              </button>
            </div>
            <div className="input-wrap">
              <svg className="input-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="4" y="10" width="16" height="11" rx="2.5" />
                <path d="M8 10V7a4 4 0 1 1 8 0v3m-4 5v2" />
              </svg>
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
              />
              <button
                className="password-toggle"
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>

            <label className="remember-option">
              <input type="checkbox" name="remember" />
              <span className="custom-checkbox" aria-hidden="true" />
              <span>Keep me signed in</span>
            </label>

            <button className="submit-button" type="submit">
              Sign in <span aria-hidden="true">→</span>
            </button>
            <p className="form-message" role="status" aria-live="polite">{message}</p>
          </form>

          <p className="signup-prompt">
            New to Toleti? <a href="mailto:hello@toleti.com">Get in touch</a>
          </p>
        </div>

        <p className="legal-copy">
          By continuing, you agree to our <a href="mailto:hello@toleti.com?subject=Terms%20of%20Service">Terms of Service</a> and <a href="mailto:hello@toleti.com?subject=Privacy%20Policy">Privacy Policy</a>.
        </p>
      </section>
    </main>
  )
}

export default App
