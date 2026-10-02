import githubLogo from '/github-logo.svg'
import instagramLogo from '/instagram-logo.svg'
import linkedinLogo from '/linkedin-logo.svg'
import PrivacyPolicy from './PrivacyPolicy.jsx'
import './App.css'

const privacyPaths = new Set(['/privacy', '/privacy/'])

function Home() {
  return (
    <main className='site-shell'>
      <section className='hero' aria-labelledby='home-title'>
        <div className='hero-copy'>
          <p className='eyebrow'>avijitsinha.com</p>
          <h1 id='home-title'>Small tools for practice and planning.</h1>
          <p className='lede'>
            Personal web applications built by Avijit Sinha. Google sign-in provides identity;
            additional permissions are requested only when a service feature needs them.
          </p>
        </div>
        <div className='hero-art' aria-hidden='true'>
          <div className='art-heading'>
            <span>Today</span>
            <span className='art-status'>In rhythm</span>
          </div>
          <div className='art-row'>
            <span>09:00</span>
            <span className='art-block art-block-practice'>Interval practice</span>
          </div>
          <div className='art-row'>
            <span>13:30</span>
            <span className='art-block art-block-focus'>Focus time</span>
          </div>
          <div className='art-row'>
            <span>18:00</span>
            <span className='art-block art-block-plan'>Plan tomorrow</span>
          </div>
        </div>
      </section>

      <section className='services' aria-labelledby='services-title'>
        <div className='section-heading'>
          <p className='eyebrow'>Applications</p>
          <h2 id='services-title'>What lives here</h2>
        </div>
        <div className='service-grid'>
          <article className='service-card'>
            <p className='service-state'>Available</p>
            <h3>Music Training</h3>
            <p>
              A focused interval-training tool. Practice settings stay in your browser, and sign-in
              never requests access to Google Calendar or Tasks.
            </p>
            <a className='text-link' href='/music/training/intervals'>Open Music Training</a>
          </article>
          <article className='service-card'>
            <p className='service-state'>Limited access</p>
            <h3>Routine Dashboard</h3>
            <p>
              A private schedule dashboard that can display an admitted user’s Google Calendar after
              a separate, explicit read-only authorization. Calendar access is not part of sign-in.
            </p>
          </article>
        </div>
      </section>

      <footer className='site-footer'>
        <nav className='footer-links' aria-label='Site information'>
          <a href='/privacy/'>Privacy</a>
          <a href='mailto:theavijitsinha@gmail.com'>Contact</a>
        </nav>
        <nav className='social-links' aria-label='Social links'>
          <a href='https://www.instagram.com/theavijitsinha/' target='_blank' rel='noreferrer'>
            <img src={instagramLogo} className='contact-logo' alt='Instagram' />
          </a>
          <a href='https://github.com/theavijitsinha' target='_blank' rel='noreferrer'>
            <img src={githubLogo} className='contact-logo' alt='GitHub' />
          </a>
          <a href='https://www.linkedin.com/in/theavijitsinha/' target='_blank' rel='noreferrer'>
            <img src={linkedinLogo} className='contact-logo' alt='LinkedIn' />
          </a>
        </nav>
        <p className='copyright-message'>&copy; 2026 Avijit Sinha</p>
      </footer>
    </main>
  )
}

function App() {
  return privacyPaths.has(window.location.pathname) ? <PrivacyPolicy /> : <Home />
}

export default App
