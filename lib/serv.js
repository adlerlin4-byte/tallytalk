// Minimal SERV Reasoning client (OpenAI Chat Completions shape).
// Docs: https://docs.openserv.ai/serv-reasoning/api/chat-completions
// Zero dependencies — uses the global fetch available in Node 18+.

const BASE_URL = (process.env.SERV_BASE_URL || "https://inference-api.openserv.ai/v1").replace(/\/$/, "");

export const DEFAULT_MODEL = process.env.SERV_MODEL || "gpt-5.4-mini";

export function hasKey() {
  return Boolean(process.env.SERV_API_KEY);
}

/**
 * Call SERV Reasoning.
 * @param {object} opts
 * @param {string} opts.system  System prompt (required by SERV).
 * @param {string|Array} opts.user  User content — a string or OpenAI content parts (text + image_url).
 * @param {Array} [opts.history] Prior {role, content} turns.
 * @param {string} [opts.model]
 * @param {string} [opts.effort] reasoning_effort: "low" | "medium" | "high"
 * @param {number} [opts.maxTokens]
 */
export async function servChat({ system, user, history = [], model = DEFAULT_MODEL, effort, maxTokens = 1800 }) {
  if (!hasKey()) throw new Error("SERV_API_KEY is not set");

  const body = {
    model,
    messages: [{ role: "system", content: system }, ...history, { role: "user", content: user }],
    max_completion_tokens: maxTokens,
  };
  if (effort) body.reasoning_effort = effort;

  const started = Date.now();
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SERV_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`SERV ${res.status}: ${text.slice(0, 400)}`);
  }
  const data = JSON.parse(text);
  const content = data?.choices?.[0]?.message?.content ?? "";
  // Reasoning models can spend the whole token budget thinking and return no text.
  // Retry once with a bigger budget and lighter reasoning instead of failing.
  if (!content.trim() && !arguments[0]._retried) {
    return servChat({ ...arguments[0], maxTokens: Math.max(maxTokens * 2, 2400), effort: "low", _retried: true });
  }
  return {
    content,
    trace: {
      provider: "SERV Reasoning",
      completion_id: data.id || null,
      model: data.model || model,
      reasoning_effort: effort || "default",
      usage: data.usage || null,
      latency_ms: Date.now() - started,
    },
  };
}

/** Pull the first JSON object out of a model reply (handles ```json fences and chatter). */
export function extractJSON(text) {
  if (!text) throw new Error("Empty model reply");
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Model reply did not contain JSON");
  return JSON.parse(candidate.slice(start, end + 1));
}
