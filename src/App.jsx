import { useState } from 'react'
import './App.css'

function App() {
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('')

  function handleSubmit(event) {
    event.preventDefault()
    setMessage('This sign-in form is a preview and is not connected to an account yet.')
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
              <button className="text-button" type="button" onClick={() => setMessage('Password reset is not available in this preview.')}>
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
            <p className="form-message" role="status">{message}</p>
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
