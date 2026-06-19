import React from 'react'

/**
 * High6 horizontal wordmark logo for the Payload admin login screen and nav.
 * Uses the extracted PNG directly (base64-in-SVG fails in some React renderers).
 */
const High6Logo: React.FC = () => {
  return (
    <img
      alt="High6"
      src="/high6-logo.png"
      style={{ height: 34, width: 'auto' }}
    />
  )
}

export default High6Logo
