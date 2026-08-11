'use client'

import React, { useEffect, useRef, useState } from 'react'
import './admin-loading.scss'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdminLoadingProps {
  /** Presentation mode */
  mode: 'fullpage' | 'inline'

  /** Messages to cycle through. Defaults vary by mode. */
  messages?: string[]

  /** Minimum display time before dismissal (ms). Default: 0 inline, 300 fullpage. */
  minDisplayMs?: number

  /** Interval between message rotations (ms). Default: 1500. */
  rotateIntervalMs?: number

  /** Time before "taking longer" tier activates (ms). Default: 6000 fullpage, Infinity inline. */
  slowThresholdMs?: number

  /** Whether the component is visible. Parent sets false to dismiss. */
  show: boolean

  /** Callback when dismiss button clicked (shown after timeoutMs). */
  onDismiss?: () => void

  /** Time before dismiss button appears (ms). Default: 8000 fullpage. */
  timeoutMs?: number
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const FULLPAGE_MESSAGES = [
  'Getting things ready…',
  'Just a few seconds…',
  'Setting up your workspace…',
  'Almost there…',
  'Still working on it…',
]

const INLINE_MESSAGES = ['Loading…']

// ---------------------------------------------------------------------------
// LoaderIcon — shared animated SVG spinner
// ---------------------------------------------------------------------------

interface LoaderIconProps {
  size?: number
  strokeWidth?: number
  className?: string
}

export const LoaderIcon: React.FC<LoaderIconProps> = ({
  size = 14,
  strokeWidth = 3,
  className,
}) => (
  <svg
    className={['admin-loading__spinner', className].filter(Boolean).join(' ')}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 2a10 10 0 1 0 10 10" />
  </svg>
)

// ---------------------------------------------------------------------------
// AdminLoading
// ---------------------------------------------------------------------------

export const AdminLoading: React.FC<AdminLoadingProps> = ({
  mode,
  messages,
  minDisplayMs,
  rotateIntervalMs = 1500,
  slowThresholdMs,
  show,
  onDismiss,
  timeoutMs,
}) => {
  const defaults = mode === 'fullpage' ? FULLPAGE_MESSAGES : INLINE_MESSAGES
  const msgs = messages ?? defaults
  const minDisplay = minDisplayMs ?? (mode === 'fullpage' ? 300 : 0)
  const slowThreshold = slowThresholdMs ?? (mode === 'fullpage' ? 6000 : Infinity)
  const timeout = timeoutMs ?? (mode === 'fullpage' ? 8000 : Infinity)

  const startRef = useRef<number>(0)
  const [currentMsg, setCurrentMsg] = useState(msgs[0])
  const [visible, setVisible] = useState(false)
  const [isSlow, setIsSlow] = useState(false)
  const [isTimedOut, setIsTimedOut] = useState(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const msgCycleRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ---- show / hide lifecycle ----

  useEffect(() => {
    if (show) {
      // Mount: start the clock
      startRef.current = Date.now()
      setVisible(true)
      setIsSlow(false)
      setIsTimedOut(false)

      // Clear any pending hide timer
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
    } else if (visible && startRef.current) {
      // Dismiss requested — enforce minimum display time
      const elapsed = Date.now() - startRef.current
      if (elapsed >= minDisplay) {
        setVisible(false)
      } else {
        hideTimerRef.current = setTimeout(() => setVisible(false), minDisplay - elapsed)
      }
    }

    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
    }
  }, [show, visible, minDisplay])

  // ---- message rotation ----

  useEffect(() => {
    if (!visible) return

    msgCycleRef.current = setInterval(() => {
      const elapsed = Date.now() - startRef.current
      // How many intervals have passed
      const ticks = Math.floor(elapsed / rotateIntervalMs)
      // Map tick to message index (wrap within the message list)
      const idx = ticks % msgs.length
      setCurrentMsg(msgs[idx])
    }, rotateIntervalMs)

    return () => {
      if (msgCycleRef.current) {
        clearInterval(msgCycleRef.current)
        msgCycleRef.current = null
      }
    }
  }, [visible, msgs, rotateIntervalMs])

  // ---- slow threshold ----

  useEffect(() => {
    if (!visible || slowThreshold === Infinity) return

    const timer = setTimeout(() => setIsSlow(true), slowThreshold)
    return () => clearTimeout(timer)
  }, [visible, slowThreshold])

  // ---- timeout ----

  useEffect(() => {
    if (!visible || timeout === Infinity) return

    const timer = setTimeout(() => setIsTimedOut(true), timeout)
    return () => clearTimeout(timer)
  }, [visible, timeout])

  // ----

  if (!visible) return null

  const isFullpage = mode === 'fullpage'
  const className = [
    'admin-loading',
    isFullpage ? 'admin-loading--fullpage' : 'admin-loading--inline',
    isSlow ? 'admin-loading--slow' : '',
    isTimedOut ? 'admin-loading--timed-out' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={className} role="status" aria-live="polite">
      {isFullpage ? (
        <div className="admin-loading__body">
          <div className="admin-loading__icon-wrap">
            <LoaderIcon size={36} strokeWidth={2.5} />
          </div>
          <span className="admin-loading__message">{currentMsg}</span>
          {isSlow && (
            <span className="admin-loading__detail">
              This is taking longer than expected. The system may be warming up.
            </span>
          )}
          {isTimedOut && onDismiss && (
            <button className="admin-loading__dismiss" onClick={onDismiss} type="button">
              Continue anyway
            </button>
          )}
        </div>
      ) : (
        <>
          <LoaderIcon size={14} />
          <span className="admin-loading__message">{currentMsg}</span>
        </>
      )}
    </div>
  )
}
