import { useState } from 'react'
import './App.css'
import credentials from './credentials.json'
import Quotation from './components/Quotation.jsx'
import PurchaseOrder from './components/PurchaseOrder.jsx'
import Invoice from './components/Invoice.jsx'
import DebitNote from './components/DebitNote.jsx'
import CreditNote from './components/CreditNote.jsx'
import DeliveryChallan from './components/DeliveryChallan.jsx'

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

function App() {
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [activeService, setActiveService] = useState('Overview')

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
  }

  if (isAuthenticated) {
    const selectedService = services.find((service) => service.name === activeService)

    return (
      <main className="dashboard-page">
        <header className="dashboard-header">
          <a className="dashboard-brand" href="/" aria-label="Toleti dashboard">
            <span className="dashboard-brand-mark" aria-hidden="true">T</span>
            <span>toleti<span className="dashboard-brand-dot">.</span></span>
          </a>
          <div className="dashboard-account">
            <div className="account-details">
              <span className="account-name">Administrator</span>
              <span className="account-email">{credentials.email}</span>
            </div>
            <button className="sign-out-button" type="button" onClick={() => setIsAuthenticated(false)}>
              Sign out
            </button>
          </div>
        </header>

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
