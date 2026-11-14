// Zero-dependency HTTP server: serves /public and exposes the agents in ./agents.js
// at POST /api/<name>. Every agent runs on SERV Reasoning; without a key it falls
// back to clearly-labelled demo responses so the UI can always be explored.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- tiny .env loader (no dotenv dependency) ---
const envFile = path.join(__dirname, ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const { servChat, extractJSON, hasKey, DEFAULT_MODEL } = await import("./lib/serv.js");
const { agents, APP_NAME } = await import("./agents.js");

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, "public");
const MAX_BODY = 12 * 1024 * 1024; // images can be large

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};

function send(res, status, payload, headers = {}) {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": typeof payload === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error("Request too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        reject(Object.assign(new Error("Invalid JSON body"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

async function runAgent(name, input) {
  const agent = agents[name];
  const problem = agent.validate?.(input);
  if (problem) throw Object.assign(new Error(problem), { status: 400 });

  if (!hasKey()) {
    // Demo mode: realistic canned output so the experience can be explored without credentials.
    await new Promise((r) => setTimeout(r, 650));
    return {
      demo: true,
      result: agent.demo(input),
      trace: { provider: "Demo mode (set SERV_API_KEY to use SERV Reasoning)", model: "—", latency_ms: 650 },
    };
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
  const result = agent.raw ? { text: content.trim() } : extractJSON(content);
  return { demo: false, result: agent.post ? agent.post(result, input) : result, trace };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/api/health") {
    return send(res, 200, { app: APP_NAME, serv: hasKey() ? "live" : "demo", model: DEFAULT_MODEL, agents: Object.keys(agents) });
  }

  if (url.pathname.startsWith("/api/")) {
    const name = url.pathname.slice(5);
    if (req.method !== "POST") return send(res, 405, { error: "Use POST" });
    if (!agents[name]) return send(res, 404, { error: `Unknown agent '${name}'` });
    try {
      const input = await readBody(req);
      const out = await runAgent(name, input);
      return send(res, 200, { ok: true, ...out });
    } catch (err) {
      console.error(`[${name}]`, err.message);
      return send(res, err.status || 502, { ok: false, error: err.message });
    }
  }

  // Static files
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith("/")) rel += "index.html";
  if (!path.extname(rel)) rel += ".html";
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) return send(res, 403, "Forbidden");
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, "Not found");
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`${APP_NAME} → http://localhost:${PORT}  (SERV: ${hasKey() ? "live, model " + DEFAULT_MODEL : "DEMO MODE — set SERV_API_KEY"})`);
});
