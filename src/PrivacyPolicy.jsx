import { useEffect } from 'react'

import './PrivacyPolicy.css'

function PrivacyPolicy() {
  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Privacy Policy · Avijit Sinha'
    return () => { document.title = previousTitle }
  }, [])

  return (
    <main className='policy-shell'>
      <a className='back-link' href='/' aria-label='Back to avijitsinha.com'>
        <span aria-hidden='true'>←</span> avijitsinha.com
      </a>

      <article className='policy-card'>
        <header className='policy-header'>
          <p className='eyebrow'>Privacy</p>
          <h1>Privacy Policy</h1>
          <p className='policy-date'>Effective October 2, 2026</p>
          <p className='policy-intro'>
            This policy explains how Avijit Sinha (“I”) handles information for avijitsinha.com and
            the services described below. Routine Dashboard is currently a limited-access service. Features
            that are not available do not collect data.
          </p>
        </header>

        <section>
          <h2>Who operates these services</h2>
          <p>
            These are personal applications operated by Avijit Sinha. Privacy questions and data
            requests can be sent to{' '}
            <a href='mailto:theavijitsinha@gmail.com'>theavijitsinha@gmail.com</a>.
          </p>
        </section>

        <section>
          <h2>Information handled across the site</h2>
          <h3>Visits and operational records</h3>
          <p>
            The site and its hosting providers process ordinary request information needed to deliver
            and protect the services. This can include IP address, browser or device information,
            requested path, referring page, timestamps, response status, latency, and security or
            diagnostic events. There are no third-party advertising or behavioral-analytics trackers.
            Operational logs are normally retained for 30 days and are not intended to contain Google
            tokens, account identifiers, email addresses, or Calendar contents.
          </p>

          <h3>Google sign-in and the site account</h3>
          <p>
            Services that offer Google sign-in use Google Sign-In and Firebase Authentication. They
            may receive a stable Google/Firebase account identifier, email address, display name,
            profile picture, and authentication metadata. This information is used only to verify
            identity, maintain the signed-in experience, show the account profile, protect user data,
            and respond to support or security issues. I do not receive your Google password.
          </p>
          <p>
            Common sign-in requests basic identity only. It does not grant access to Google Calendar
            or Google Tasks. Depending on the service release, authentication state is maintained by
            Firebase in the browser or by random secure session cookies; server-side session values
            are stored only as cryptographic hashes. Site sessions expire after 30 consecutive days
            without authenticated use and may rotate while actively used.
          </p>
        </section>

        <section>
          <h2>Music Training</h2>
          <p>
            Music Training uses browser storage for practice settings such as interval choices,
            direction, and timing. Those settings remain on the device unless you clear browser data.
            The exercises and audio are generated in the browser. If you use Google sign-in, Music
            Training uses only the basic identity information described above. It does not request,
            receive, store, or use Google Calendar or Google Tasks data.
          </p>
        </section>

        <section>
          <h2>Routine Dashboard</h2>
          <p>
            Routine Dashboard is limited to specifically admitted accounts. Signing in does not
            connect Calendar. An admitted user must separately select <strong>Connect Google Calendar</strong>
            {' '}before the Dashboard requests read-only Calendar access. The requested Calendar scope
            cannot create, edit, or delete Google Calendar events. The Dashboard also verifies that
            the connected Calendar account belongs to the signed-in Google identity.
          </p>
          <p>
            When connected, Routine Dashboard reads the event fields needed to display and synchronize
            a schedule, including title, start and end, all-day state, status, event type, availability,
            recurrence relationships, and the signed-in user’s own response status. Event descriptions
            may be read transiently to interpret Dashboard display directives, but the descriptions,
            attendee identities, conference details, and raw Google responses are not retained.
          </p>
          <p>
            The Dashboard stores encrypted authorization credentials, user preferences, connection and
            synchronization state, and a normalized cache of the event fields needed by the interface.
            Google Calendar remains the authoritative source. Calendar data is used only to provide the
            signed-in user’s Dashboard and is isolated from every other user. Google Tasks integration
            is not currently available, so no Google Tasks data is requested or collected.
          </p>
        </section>

        <section>
          <h2>Cookies and browser storage</h2>
          <p>
            Essential cookies may be used for secure sessions, cross-site-request-forgery protection,
            and short-lived Google authorization state. They are not used for advertising. Participating
            applications may use browser storage for local preferences and temporary sign-in state.
            Blocking essential storage can prevent sign-in or saved settings from working.
          </p>
        </section>

        <section>
          <h2>How information is used and shared</h2>
          <p>
            Information is used to provide the requested service, authenticate users, synchronize and
            display authorized data, maintain security, diagnose failures, and respond to user requests.
            It is not sold, used for advertising, provided to data brokers, or used to train advertising
            or artificial-intelligence models.
          </p>
          <p>
            Google and Google Cloud process information as providers of authentication, APIs, hosting,
            databases, encryption, and related infrastructure. Information may also be disclosed when
            required by law or when reasonably necessary to investigate abuse or protect users and the
            services. No other sharing is permitted except with the user’s direction or consent.
          </p>
          <p className='limited-use'>
            The use and transfer to any other app of information received from Google APIs will adhere
            to the Google API Services User Data Policy, including the Limited Use requirements.
          </p>
        </section>

        <section>
          <h2>Retention and deletion</h2>
          <ul>
            <li>Browser-local preferences remain until you clear them or the application replaces them.</li>
            <li>Account profile data remains while the account is active or until deletion is requested.</li>
            <li>
              Routine Dashboard keeps current normalized Calendar data while Calendar is connected.
              Disconnecting Calendar removes its local authorization credentials, synchronization jobs,
              and active Calendar cache, even if Google revocation is temporarily unavailable.
            </li>
            <li>Operational logs are normally retained for 30 days.</li>
            <li>
              When hosted database backups are active, deleted records may remain in encrypted
              backups for up to seven days before those backups expire.
            </li>
          </ul>
          <p>
            To request access to or deletion of account and service data, email{' '}
            <a href='mailto:theavijitsinha@gmail.com?subject=Data%20deletion%20request'>
              theavijitsinha@gmail.com
            </a>{' '}
            with the subject “Data deletion request.” I may ask you to verify control of the relevant
            Google account before acting. Active data will be removed after verification, subject to
            the backup window above and any limited retention required for security or law.
          </p>
          <p>
            You can also revoke this site’s Google access from your{' '}
            <a href='https://myaccount.google.com/connections' target='_blank' rel='noreferrer'>
              Google Account connections
            </a>. Revoking at Google stops future access but does not by itself clear browser-local
            preferences or data already cached by a service; use the service’s disconnect control or
            contact me for deletion.
          </p>
        </section>

        <section>
          <h2>Security</h2>
          <p>
            Safeguards include HTTPS, secure cookies where applicable, least-privilege service identities,
            per-user authorization controls, encrypted Google credentials, and separation of each user’s
            data. No security measure can guarantee absolute protection, but access is limited to what
            is needed to operate, support, secure, or legally comply with the services.
          </p>
        </section>

        <section>
          <h2>Children</h2>
          <p>
            These services are not directed to children under 13 and are not intended to knowingly
            collect their personal information. Contact me if you believe a child has provided personal
            information so it can be reviewed and deleted.
          </p>
        </section>

        <section>
          <h2>Changes to this policy</h2>
          <p>
            This policy may be updated as services change. The effective date above will be revised,
            and material changes to the handling of Google user data will be disclosed before that data
            is used in a new way. Additional Google permissions will not be requested merely for possible
            future features.
          </p>
        </section>
      </article>
    </main>
  )
}

export default PrivacyPolicy
