'use client'

import { useState, useRef, useEffect, useCallback, type FormEvent, type KeyboardEvent } from 'react'

export const dynamic = 'force-dynamic'

interface ChatEntry {
  role: 'user' | 'agent'
  message: string
  timestamp: number
  isError: boolean
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function AgentPage() {
  const [tenantSlug, setTenantSlug] = useState('client-b')
  const [command, setCommand] = useState('')
  const [chatHistory, setChatHistory] = useState<ChatEntry[]>([])
  const [loading, setLoading] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [])

  // Scroll to bottom when history changes or loading state updates
  useEffect(() => {
    scrollToBottom()
  }, [chatHistory, loading, scrollToBottom])

  // Re-focus textarea after loading completes
  useEffect(() => {
    if (!loading) {
      textareaRef.current?.focus()
    }
  }, [loading])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()

    const trimmed = command.trim()
    if (!trimmed || loading) return

    const now = Date.now()

    // Add user message
    const userEntry: ChatEntry = { role: 'user', message: trimmed, timestamp: now, isError: false }
    setChatHistory((prev) => [...prev, userEntry])
    setCommand('')
    setLoading(true)

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: trimmed, tenantSlug }),
      })

      const data = await res.json()

      // Detect error responses
      const isError = !data?.success

      const agentEntry: ChatEntry = {
        role: 'agent',
        message: JSON.stringify(data, null, 2),
        timestamp: Date.now(),
        isError,
      }
      setChatHistory((prev) => [...prev, agentEntry])
    } catch (err) {
      const errorEntry: ChatEntry = {
        role: 'agent',
        message: `Network error: ${(err as Error).message}`,
        timestamp: Date.now(),
        isError: true,
      }
      setChatHistory((prev) => [...prev, errorEntry])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* ── Header bar ─────────────────────────────────────────────────── */}
      <header className="flex shrink-0 items-center gap-4 border-b border-gray-700 bg-gray-900 px-6 py-3">
        <h1 className="text-lg font-bold text-white tracking-tight">Agent Chat</h1>
        <div className="flex items-center gap-2">
          <label
            htmlFor="tenantSlug"
            className="text-xs font-semibold uppercase tracking-wide text-gray-400"
          >
            Tenant
          </label>
          <input
            id="tenantSlug"
            type="text"
            value={tenantSlug}
            onChange={(e) => setTenantSlug(e.target.value)}
            className="w-36 rounded-md border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="client-b"
          />
        </div>
      </header>

      {/* ── Chat history ───────────────────────────────────────────────── */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto bg-gray-950 px-4 py-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {chatHistory.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-20 text-gray-500">
              <svg
                className="h-10 w-10 opacity-40"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                />
              </svg>
              <p className="text-sm">Send a command to get started.</p>
            </div>
          )}

          {chatHistory.map((entry, i) => {
            const isUser = entry.role === 'user'
            const isAgentError = entry.role === 'agent' && entry.isError

            return (
              <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-5 py-3 ${
                    isUser
                      ? 'bg-blue-600 text-white'
                      : isAgentError
                        ? 'border border-red-700 bg-red-950 text-red-100'
                        : 'bg-gray-800 text-gray-100'
                  }`}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span
                      className={`text-[11px] font-semibold uppercase tracking-wide ${
                        isUser ? 'text-blue-200' : isAgentError ? 'text-red-400' : 'text-gray-400'
                      }`}
                    >
                      {isUser ? 'You' : 'Agent'}
                    </span>
                    <span className="text-[10px] text-gray-500">{formatTime(entry.timestamp)}</span>
                  </div>
                  <pre
                    className={`whitespace-pre-wrap break-words font-mono text-sm leading-relaxed ${
                      isAgentError ? 'text-red-200' : isUser ? 'text-blue-50' : 'text-gray-100'
                    }`}
                  >
                    {entry.message}
                  </pre>
                </div>
              </div>
            )
          })}

          {loading && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-2xl bg-gray-800 px-5 py-3">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  Agent
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-gray-400" />
                  Thinking…
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Input area ─────────────────────────────────────────────────── */}
      <form
        onSubmit={handleSubmit}
        className="shrink-0 border-t border-gray-700 bg-gray-900 px-6 py-4"
      >
        <div className="mx-auto flex max-w-3xl items-end gap-3">
          <textarea
            ref={textareaRef}
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            disabled={loading}
            className="flex-1 resize-none rounded-lg border border-gray-600 bg-gray-800 px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            placeholder="e.g. Change the title of the welcome post to Hello World"
          />
          <button
            type="submit"
            disabled={loading || !command.trim()}
            className="shrink-0 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Sending…' : 'Send'}
          </button>
        </div>
        <p className="mx-auto mt-2 max-w-3xl text-[11px] text-gray-500">
          Press{' '}
          <kbd className="rounded border border-gray-600 bg-gray-800 px-1 py-px font-mono text-xs">
            Enter
          </kbd>{' '}
          to send ·{' '}
          <kbd className="rounded border border-gray-600 bg-gray-800 px-1 py-px font-mono text-xs">
            Shift
          </kbd>{' '}
          +{' '}
          <kbd className="rounded border border-gray-600 bg-gray-800 px-1 py-px font-mono text-xs">
            Enter
          </kbd>{' '}
          for newline
        </p>
      </form>
    </div>
  )
}
