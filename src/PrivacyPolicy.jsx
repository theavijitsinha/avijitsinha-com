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
            This policy explains how Avijit Sinha (“I”) handles information for avijitsinha.com
            and Music Training. Features that are not available do not collect data.
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
            credentials, account identifiers, or email addresses.
          </p>

          <h3>Optional Google sign-in</h3>
          <p>
            Music Training offers optional Google sign-in through Google Sign-In and Firebase
            Authentication. Google and Firebase may process a stable account identifier, email address,
            display name, profile picture, and authentication metadata. The application uses this
            information only to maintain and display the signed-in experience. I do not receive your
            Google password, and Music Training does not send your signed-in identity to an application
            database.
          </p>
          <p>
            Sign-in requests basic identity only. It does not grant access to Google Calendar or Google
            Tasks. Firebase maintains authentication state in the browser and may retain an authentication
            user record in the site's Firebase project.
          </p>
        </section>

        <section>
          <h2>Music Training</h2>
          <p>
            Music Training uses browser storage for practice settings such as interval choices,
            direction, and timing. Those settings remain on the device unless you clear browser data.
            Exercises and audio are generated in the browser. If you use Google sign-in, Music Training
            uses only the basic identity information described above. It does not request, receive,
            store, or use Google Calendar or Google Tasks data.
          </p>
        </section>

        <section>
          <h2>Cookies and browser storage</h2>
          <p>
            Firebase Authentication may use cookies or browser storage for temporary and persistent
            sign-in state. Music Training uses browser storage for local practice preferences. This
            storage is not used for advertising. Blocking or clearing it can sign you out or remove
            saved settings.
          </p>
        </section>

        <section>
          <h2>How information is used and shared</h2>
          <p>
            Information is used to provide the requested service, authenticate users, maintain security,
            diagnose failures, and respond to user requests. It is not sold, used for advertising,
            provided to data brokers, or used to train advertising or artificial-intelligence models.
          </p>
          <p>
            Google and Google Cloud process information as providers of authentication, hosting, and
            related infrastructure. Information may also be disclosed when required by law or when
            reasonably necessary to investigate abuse or protect users and the services. No other
            sharing is permitted except with the user's direction or consent.
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
            <li>Firebase authentication records remain until they are deleted or the Firebase project removes them.</li>
            <li>Operational logs are normally retained for 30 days.</li>
          </ul>
          <p>
            To request deletion of a Firebase authentication record or other service data, email{' '}
            <a href='mailto:theavijitsinha@gmail.com?subject=Data%20deletion%20request'>
              theavijitsinha@gmail.com
            </a>{' '}
            with the subject “Data deletion request.” I may ask you to verify control of the relevant
            Google account before acting. You can remove practice settings directly by clearing this
            site's browser data.
          </p>
          <p>
            You can also revoke this site's Google access from your{' '}
            <a href='https://myaccount.google.com/connections' target='_blank' rel='noreferrer'>
              Google Account connections
            </a>. Revoking at Google stops future sign-in access but does not clear browser-local
            practice settings.
          </p>
        </section>

        <section>
          <h2>Security</h2>
          <p>
            Safeguards include HTTPS, restrictive browser security headers, provider-managed
            authentication, and avoiding server-side storage of Music Training identity or practice
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
