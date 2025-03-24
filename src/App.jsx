import { DotLottieReact } from '@lottiefiles/dotlottie-react'

import githubLogo from '/github-logo.svg'
import instagramLogo from '/instagram-logo.svg'
import linkedinLogo from '/linkedin-logo.svg'
import './App.css'

function App() {
  return (
    <>
      <div className='construction-gif'>
        <DotLottieReact
          src="/construction.lottie"
          loop
          autoplay
          style={{
            width: "auto",
            height: "auto",
          }}
        />
      </div>
      <h1>Under construction</h1>
      <div className='footer'>
        <div className='contacts'>
          <a href='https://www.instagram.com/theavijitsinha/' target='_blank'>
            <img src={instagramLogo} className='contact-logo' alt='instagram' />
          </a>
          <a href='https://github.com/theavijitsinha' target='_blank'>
            <img src={githubLogo} className='contact-logo' alt='github' />
          </a>
          <a href='https://www.linkedin.com/in/theavijitsinha/' target='_blank'>
            <img src={linkedinLogo} className='contact-logo' alt='linkedin' />
          </a>
        </div>
        <div className='copyright-message'>
          <p>&copy; 2025 Avijit Sinha</p>
        </div>
      </div>
    </>
  )
}

export default App
