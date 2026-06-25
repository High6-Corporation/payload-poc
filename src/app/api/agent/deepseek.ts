// ---------------------------------------------------------------------------
// Agent API — DeepSeek integration
// ---------------------------------------------------------------------------

import { SYSTEM_PROMPT, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL, FIELD_CHOICE_PROMPT } from './prompts'
import { type ParsedAction, isParsedAction, type ParsedFieldChoice } from './types'

/**
 * Call DeepSeek to parse a natural-language command into a structured action.
 * Throws a descriptive Error on any failure — callers should catch and convert
 * to an appropriate Response.
 */
export async function callDeepSeek(message: string): Promise<ParsedAction> {
  const deepseekKey = process.env.DEEPSEEK_API_KEY
  if (!deepseekKey) {
    throw new Error('DEEPSEEK_API_KEY not configured')
  }

  const dsRes = await fetch(`${DEEPSEEK_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${deepseekKey}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: message },
      ],
      temperature: 0,
    }),
  })

  if (!dsRes.ok) {
    const errBody = await dsRes.text()
    throw new Error(`DeepSeek API error (HTTP ${dsRes.status}): ${errBody}`)
  }

  const dsData = await dsRes.json()
  const raw: string = dsData?.choices?.[0]?.message?.content ?? ''

  // Strip any backticks or markdown fences the model may have emitted
  const cleaned = raw
    .replace(/```(?:json)?\s*/gi, '')
    .replace(/```/g, '')
    .trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error(`DeepSeek returned unparseable output: ${raw}`)
  }

  if (!isParsedAction(parsed)) {
    throw new Error(`DeepSeek response missing "action" field: ${raw}`)
  }

  return parsed
}

/**
 * Call DeepSeek to parse the user's answer to the "which field?" FAQ question.
 * Uses a dedicated lightweight prompt for fast, cheap classification.
 * Returns { field: 'unknown', reason: '...' } on any failure so callers never
 * need to catch.
 */
export async function parseFieldChoice(message: string): Promise<ParsedFieldChoice> {
  const deepseekKey = process.env.DEEPSEEK_API_KEY
  if (!deepseekKey) {
    return { field: 'unknown', reason: 'DEEPSEEK_API_KEY not configured' }
  }

  try {
    const dsRes = await fetch(`${DEEPSEEK_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${deepseekKey}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: FIELD_CHOICE_PROMPT },
          { role: 'user', content: message },
        ],
        temperature: 0,
      }),
    })

    if (!dsRes.ok) {
      return { field: 'unknown', reason: `DeepSeek API error (HTTP ${dsRes.status})` }
    }

    const dsData = await dsRes.json()
    const raw: string = dsData?.choices?.[0]?.message?.content ?? ''

    const cleaned = raw
      .replace(/```(?:json)?\s*/gi, '')
      .replace(/```/g, '')
      .trim()

    const parsed = JSON.parse(cleaned)
    if (
      parsed &&
      typeof parsed === 'object' &&
      ['question', 'answer', 'both', 'unknown'].includes(
        (parsed as Record<string, unknown>).field as string,
      )
    ) {
      return parsed as ParsedFieldChoice
    }

    return { field: 'unknown', reason: `Unparseable field choice: ${raw}` }
  } catch (e) {
    return { field: 'unknown', reason: (e as Error).message }
  }
}
