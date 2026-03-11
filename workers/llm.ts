// workers/llm.ts
// Generic LLM caller — tries OpenAI first, falls back to Anthropic.
// Both APIs accept { system, user } and return text.

import * as dotenv from 'dotenv';
dotenv.config();

import { captureError } from '../lib/errors';

interface Prompt { system: string; user: string; }
interface LLMResult { text: string; provider: string; }

const OPENAI_MODEL     = 'gpt-4o-mini';
const ANTHROPIC_MODEL  = 'claude-haiku-4-5-20251001';  // fast + cheap
const MAX_TOKENS       = 1024;
const TIMEOUT_MS       = 20_000;

/** Call LLM with retry. Returns raw text output. */
export async function callLlm(prompt: Prompt, retries = 2): Promise<LLMResult> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (process.env.OPENAI_API_KEY) {
        const text = await callOpenAi(prompt);
        return { text, provider: 'openai' };
      }
      if (process.env.ANTHROPIC_API_KEY) {
        const text = await callAnthropic(prompt);
        return { text, provider: 'anthropic' };
      }
      throw new Error('No LLM API key configured (OPENAI_API_KEY or ANTHROPIC_API_KEY)');
    } catch (err) {
      if (attempt === retries) {
        captureError('llm', err, { attempt, retries });
        throw err;
      }
      await sleep(1000 * 2 ** attempt);   // exponential back-off
    }
  }
  throw new Error('LLM call failed after retries');
}

/** Parse JSON from LLM output — strips markdown fences if present. */
export function parseLlmJson<T = unknown>(text: string): T | null {
  try {
    const cleaned = text
      .replace(/^```(?:json)?\s*/im, '')
      .replace(/```\s*$/im, '')
      .trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

// ── Internal callers ──────────────────────────────────────────────────────────

async function callOpenAi(prompt: Prompt): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        Authorization:   `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model:      OPENAI_MODEL,
        max_tokens: MAX_TOKENS,
        messages:   [
          { role: 'system', content: prompt.system },
          { role: 'user',   content: prompt.user   },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
    const data = await res.json() as any;
    return data.choices?.[0]?.message?.content ?? '';
  } finally {
    clearTimeout(timer);
  }
}

async function callAnthropic(prompt: Prompt): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':   'application/json',
        'x-api-key':       process.env.ANTHROPIC_API_KEY ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      ANTHROPIC_MODEL,
        max_tokens: MAX_TOKENS,
        system:     prompt.system,
        messages:   [{ role: 'user', content: prompt.user }],
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
    const data = await res.json() as any;
    return data.content?.[0]?.text ?? '';
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
