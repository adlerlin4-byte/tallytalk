// Vercel serverless entry: POST /api/<agent> (rewritten to /api/agent?agent=<agent> by vercel.json). Same behaviour as server.js, so the app
// can be hosted for free on Vercel (no card needed). Local dev still uses `node server.js`.
import { servChat, extractJSON, hasKey, DEFAULT_MODEL } from "../lib/serv.js";
import { agents } from "../agents.js";

async function readJSON(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return req.body ? JSON.parse(req.body) : {};
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const name = req.query?.agent;
  const agent = agents[name];
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Use POST" });
  if (!agent) return res.status(404).json({ ok: false, error: `Unknown agent '${name}'` });

  try {
    const input = await readJSON(req);
    const problem = agent.validate?.(input);
    if (problem) return res.status(400).json({ ok: false, error: problem });

    if (!hasKey()) {
      return res.status(200).json({
        ok: true,
        demo: true,
        result: agent.demo(input),
        trace: { provider: "Demo mode (set SERV_API_KEY to use SERV Reasoning)", model: "—", latency_ms: 0 },
      });
    }

    const system = typeof agent.system === "function" ? agent.system(input) : agent.system;
    const { content, trace } = await servChat({
      system,
      user: agent.user(input),
      history: agent.history?.(input) || [],
      model: agent.model || DEFAULT_MODEL,
      effort: agent.effort,
      maxTokens: agent.maxTokens,
    });
    const parsed = agent.raw ? { text: content.trim() } : extractJSON(content);
    const result = agent.post ? agent.post(parsed, input) : parsed;
    return res.status(200).json({ ok: true, demo: false, result, trace });
  } catch (err) {
    console.error(`[${name}]`, err.message);
    return res.status(err.status || 502).json({ ok: false, error: err.message });
  }
}
