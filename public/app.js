import { callAgent, speak, listen, traceHTML, escapeHTML, announce, mountStatus } from "./common.js";

const $ = (s) => document.querySelector(s);
const SYMBOL = { NGN: "₦", GHS: "GH₵", KES: "KSh ", USD: "$" };
const ICON = { sale: "🛒", purchase: "📦", expense: "🚕", payment_received: "💰", payment_made: "💸" };
const LABEL = { sale: "Sale", purchase: "Stock bought", expense: "Expense", payment_received: "Debt paid to you", payment_made: "You paid supplier" };

let book = load("tt-book", []);
let settings = load("tt-settings", { currency: "NGN", readback: true });
let pending = null;

function load(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } }
const money = (n) => `${SYMBOL[settings.currency] || ""}${Math.round(Number(n) || 0).toLocaleString()}`;
const isToday = (ts) => new Date(ts).toDateString() === new Date().toDateString();
const norm = (s) => (s || "").trim().toLowerCase();

// ---------- derived numbers (computed in code, not by the model) ----------
function debts() {
  const map = new Map();
  for (const e of book) {
    if (!e.party) continue;
    const key = norm(e.party);
    const d = map.get(key) || { party: e.party, owed: 0, items: [] };
    if (e.type === "sale") {
      d.owed += (Number(e.total) || 0) - (Number(e.paid) || 0);
      if (e.total > e.paid && e.item) d.items.push(e.item);
    }
    if (e.type === "payment_received") d.owed -= Number(e.paid || e.total) || 0;
    map.set(key, d);
  }
  return [...map.values()].filter((d) => d.owed > 0.5).sort((a, b) => b.owed - a.owed);
}

function totals(filter) {
  const rows = book.filter(filter);
  const sum = (types, field = "total") => rows.filter((e) => types.includes(e.type)).reduce((a, e) => a + (Number(e[field]) || 0), 0);
  return {
    sales: sum(["sale"]),
    spent: sum(["purchase", "expense", "payment_made"], "paid"),
    cash_in: sum(["sale"], "paid") + sum(["payment_received"], "paid"),
  };
}

function summary() {
  const weekAgo = Date.now() - 7 * 86400000;
  const week = totals((e) => e.ts >= weekAgo);
  const items = {};
  const expenses = {};
  book.filter((e) => e.ts >= weekAgo).forEach((e) => {
    if (e.type === "sale" && e.item) items[e.item] = (items[e.item] || 0) + (Number(e.total) || 0);
    if (e.type === "expense") expenses[e.item || "other"] = (expenses[e.item || "other"] || 0) + (Number(e.paid) || 0);
  });
  return {
    currency: settings.currency,
    today: totals((e) => isToday(e.ts)),
    last_7_days: { ...week, rough_profit: week.sales - week.spent },
    sales_by_item_7_days: items,
    expenses_7_days: expenses,
    customers_owing: debts().map((d) => ({ name: d.party, owes: d.owed })),
    total_owed_to_trader: debts().reduce((a, d) => a + d.owed, 0),
    entries_recorded: book.length,
  };
}

// ---------- render ----------
function render() {
  const t = totals((e) => isToday(e.ts));
  $("#t-sales").textContent = money(t.sales);
  $("#t-spent").textContent = money(t.spent);
  $("#t-cash").textContent = money(t.cash_in);
  $("#t-owed").textContent = money(debts().reduce((a, d) => a + d.owed, 0));

  $("#ledger").innerHTML = book.length
    ? book
        .slice()
        .reverse()
        .map((e) => {
          const inflow = e.type === "sale" || e.type === "payment_received";
          const desc = [e.qty ? `${e.qty} ${e.unit || ""}`.trim() : "", e.item || "", e.party ? `· ${e.party}` : ""].filter(Boolean).join(" ");
          const owe = e.type === "sale" && e.total > e.paid ? ` · owes ${money(e.total - e.paid)}` : "";
          return `<li><span class="ic" aria-hidden="true">${ICON[e.type] || "•"}</span>
            <span><b>${LABEL[e.type] || e.type}</b> ${escapeHTML(desc)}<small>${new Date(e.ts).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}${owe} · <button class="del" data-del="${e.id}">remove</button></small></span>
            <span class="amt ${inflow ? "in" : "out"}">${inflow ? "+" : "−"}${money(e.type === "sale" ? e.total : e.paid || e.total)}</span></li>`;
        })
        .join("")
    : '<li class="empty">Nothing yet. Press the big button and tell me your first sale.</li>';

  const ds = debts();
  $("#debtors").innerHTML = ds.length
    ? ds.map((d) => `<div class="debtor" data-party="${escapeHTML(d.party)}"><b>${escapeHTML(d.party)}</b><span class="owe">${money(d.owed)}</span><button class="btn btn-green" data-remind="${escapeHTML(d.party)}" style="min-height:44px;padding:0 14px">💬 Remind</button></div>`).join("")
    : '<p class="empty">Nobody owes you. 🎉</p>';
}

// ---------- record ----------
async function record(said) {
  if (!said.trim()) return;
  $("#confirm").innerHTML = '<p class="empty">Writing it down…</p>';
  try {
    const data = await callAgent("record", { said, currency: settings.currency, customers: [...new Set(book.map((e) => e.party).filter(Boolean))] });
    pending = data.result.entries || [];
    const r = data.result;
    $("#confirm").innerHTML = `<div class="confirm">
      <p>${escapeHTML(r.confirm)}</p>
      ${r.clarify ? `<div class="clarify">❓ ${escapeHTML(r.clarify)}</div>` : ""}
      <div class="entries">${pending.map((e) => `<div class="entry"><span class="t">${LABEL[e.type] || e.type}${e.item ? " · " + escapeHTML(e.item) : ""}${e.qty ? ` × ${e.qty} ${escapeHTML(e.unit || "")}` : ""}</span><b>${money(e.total)}</b><span>${escapeHTML(e.party || "")}</span>${e.type === "sale" && e.total > e.paid ? `<span class="owe">owes ${money(e.total - e.paid)}</span>` : `<span>paid ${money(e.paid)}</span>`}</div>`).join("")}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-yellow" id="ok">✓ Correct, save am</button><button class="btn" id="no">✗ No, try again</button></div>
      ${traceHTML(data)}</div>`;
    if (settings.readback) speak(r.confirm, { lang: "en-NG", rate: 0.95 });
    $("#ok").focus();
    $("#ok").addEventListener("click", commit);
    $("#no").addEventListener("click", () => { pending = null; $("#confirm").innerHTML = ""; $("#said").value = said; $("#said").focus(); });
  } catch (err) {
    $("#confirm").innerHTML = `<p class="error">${escapeHTML(err.message)}</p>`;
  }
}

function commit() {
  if (!pending) return;
  const now = Date.now();
  pending.forEach((e, i) => book.push({ ...e, total: Number(e.total) || 0, paid: Number(e.paid ?? e.total) || 0, id: `${now}-${i}`, ts: now }));
  save("tt-book", book);
  pending = null;
  $("#confirm").innerHTML = '<p class="empty" style="border-color:var(--green)">✅ Saved for your book.</p>';
  $("#said").value = "";
  announce("Saved");
  render();
}

$("#typed").addEventListener("submit", (e) => { e.preventDefault(); record($("#said").value); });
document.querySelectorAll("[data-ex]").forEach((b) => b.addEventListener("click", () => { $("#said").value = b.dataset.ex; record(b.dataset.ex); }));

let stopTalk = null;
$("#talk").addEventListener("click", () => {
  if (stopTalk) { stopTalk(); return; }
  let text = "";
  stopTalk = listen({
    lang: "en-NG",
    onText: ({ finalText, interim }) => { text += finalText; $("#said").value = (text + interim).trim(); },
    onEnd: () => {
      stopTalk = null;
      $("#talk").classList.remove("on");
      $("#talk-label").textContent = "Press and talk";
      if (text.trim()) record(text.trim());
    },
  });
  if (!stopTalk) { $("#talk-label").textContent = "Voice not supported here, type below"; $("#said").focus(); return; }
  $("#talk").classList.add("on");
  $("#talk-label").textContent = "I dey listen… press to stop";
});

// ---------- ledger delete ----------
$("#ledger").addEventListener("click", (e) => {
  const b = e.target.closest("[data-del]");
  if (!b) return;
  book = book.filter((x) => x.id !== b.dataset.del);
  save("tt-book", book);
  render();
});

// ---------- reminders ----------
$("#debtors").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-remind]");
  if (!b) return;
  const d = debts().find((x) => x.party === b.dataset.remind);
  const card = b.closest(".debtor");
  card.querySelector(".reminder")?.remove();
  const box = document.createElement("div");
  box.className = "reminder";
  box.style.flexBasis = "100%";
  box.textContent = "Writing a polite message…";
  card.appendChild(box);
  try {
    const data = await callAgent("remind", { party: d.party, amount: d.owed, currency: settings.currency, items: [...new Set(d.items)], language: $("#lang").value });
    const msg = data.result.message;
    box.innerHTML = `<p style="margin:0 0 10px">${escapeHTML(msg)}</p><a class="btn btn-green" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(msg)}">Send on WhatsApp</a> <button class="btn" data-copy>Copy</button>${traceHTML(data)}`;
    box.querySelector("[data-copy]").addEventListener("click", () => navigator.clipboard?.writeText(msg).then(() => announce("Copied")));
  } catch (err) {
    box.innerHTML = `<span class="error">${escapeHTML(err.message)}</span>`;
  }
});

// ---------- ask ----------
async function ask(q) {
  if (!q.trim()) return;
  $("#answer").innerHTML = '<p class="empty">Checking your book…</p>';
  try {
    const data = await callAgent("ask", { question: q, summary: summary() });
    $("#answer").innerHTML = `<div class="answer">${escapeHTML(data.result.answer)}</div>${traceHTML(data)}`;
    if (settings.readback) speak(data.result.answer, { lang: "en-NG", rate: 0.95 });
  } catch (err) {
    $("#answer").innerHTML = `<p class="error">${escapeHTML(err.message)}</p>`;
  }
}
$("#ask-form").addEventListener("submit", (e) => { e.preventDefault(); ask($("#q").value); });
$("#ask-mic").addEventListener("click", () => {
  let text = "";
  const stop = listen({ lang: "en-NG", onText: ({ finalText, interim }) => { text += finalText; $("#q").value = (text + interim).trim(); }, onEnd: () => text.trim() && ask(text.trim()) });
  if (!stop) $("#q").focus();
});

// ---------- settings ----------
$("#currency").value = settings.currency;
$("#currency").addEventListener("change", (e) => { settings.currency = e.target.value; save("tt-settings", settings); render(); });
function applyReadback() {
  $("#readback").textContent = `🔊 Read back: ${settings.readback ? "on" : "off"}`;
  $("#readback").setAttribute("aria-pressed", String(settings.readback));
}
$("#readback").addEventListener("click", () => { settings.readback = !settings.readback; save("tt-settings", settings); applyReadback(); });

// Seed a realistic demo book on first visit so judges see a living ledger.
if (!book.length && new URLSearchParams(location.search).has("demo")) {
  const h = 3600000, now = Date.now();
  book = [
    { id: "s1", ts: now - 50 * h, type: "purchase", item: "Rice", qty: 10, unit: "bag", unit_price: 38000, total: 380000, paid: 380000, party: "Alhaji Musa" },
    { id: "s2", ts: now - 30 * h, type: "sale", item: "Beans", qty: 6, unit: "paint", unit_price: 3000, total: 18000, paid: 18000, party: null },
    { id: "s3", ts: now - 26 * h, type: "sale", item: "Rice", qty: 2, unit: "bag", unit_price: 46000, total: 92000, paid: 65000, party: "Iya Bisi" },
    { id: "s4", ts: now - 5 * h, type: "expense", item: "Market levy", total: 1000, paid: 1000, party: null },
    { id: "s5", ts: now - 3 * h, type: "sale", item: "Garri", qty: 4, unit: "paint", unit_price: 2500, total: 10000, paid: 10000, party: null },
  ];
  save("tt-book", book);
}

applyReadback();
render();
mountStatus();
