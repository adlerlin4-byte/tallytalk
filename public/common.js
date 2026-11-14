// Shared browser helpers: API calls, speech, and the SERV trace badge.

export async function callAgent(name, input) {
  const res = await fetch(`/api/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({ ok: false, error: "Bad response from server" }));
  if (!data.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

export async function health() {
  try {
    return await (await fetch("/api/health")).json();
  } catch {
    return { serv: "offline" };
  }
}

/** Speak text aloud with the browser's built-in voice. */
export function speak(text, { rate = 1, lang } = {}) {
  if (!("speechSynthesis" in window) || !text) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = rate;
  if (lang) u.lang = lang;
  window.speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

/** Start browser speech recognition; returns a stop() function, or null if unsupported. */
export function listen({ onText, onEnd, continuous = false, lang = "en-US" }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const rec = new SR();
  rec.lang = lang;
  rec.continuous = continuous;
  rec.interimResults = true;
  rec.onresult = (e) => {
    let finalText = "";
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText += t;
      else interim += t;
    }
    onText?.({ finalText, interim });
  };
  rec.onend = () => onEnd?.();
  rec.onerror = () => onEnd?.();
  rec.start();
  return () => rec.stop();
}

/** Render a short "who decided this" footer so every answer is auditable. */
export function traceHTML(data) {
  const t = data.trace || {};
  const tokens = t.usage?.total_tokens ? ` · ${t.usage.total_tokens} tokens` : "";
  const id = t.completion_id ? ` · <code>${escapeHTML(String(t.completion_id).slice(0, 18))}…</code>` : "";
  const label = data.demo ? "Demo mode — sample answer" : `SERV Reasoning · ${escapeHTML(t.model || "")}`;
  return `<div class="trace${data.demo ? " is-demo" : ""}" role="note">
    <span class="trace-dot" aria-hidden="true"></span>${label}${tokens} · ${t.latency_ms ?? "?"} ms${id}
  </div>`;
}

export function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/** Announce a message to screen readers via a polite live region. */
export function announce(msg) {
  let region = document.getElementById("sr-live");
  if (!region) {
    region = document.createElement("div");
    region.id = "sr-live";
    region.className = "sr-only";
    region.setAttribute("aria-live", "polite");
    document.body.appendChild(region);
  }
  region.textContent = "";
  setTimeout(() => (region.textContent = msg), 50);
}

/** Show the live/demo status pill wherever [data-serv-status] exists. */
export async function mountStatus() {
  const els = document.querySelectorAll("[data-serv-status]");
  if (!els.length) return;
  const h = await health();
  els.forEach((el) => {
    el.dataset.state = h.serv;
    el.textContent = h.serv === "live" ? `SERV live · ${h.model}` : h.serv === "demo" ? "Demo mode" : "Offline";
  });
}
