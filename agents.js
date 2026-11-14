// TallyTalk agents — every call runs through SERV Reasoning.
export const APP_NAME = "TallyTalk";

// The model sometimes invents its own key names (transaction_type, total_amount, read_back…).
// These helpers map any reasonable variant onto the shape the app stores, so nothing is lost.
const num = (v) => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  const m = String(v).toLowerCase().replace(/[,₦$\s]|ngn|naira/g, "").match(/^(-?\d+(?:\.\d+)?)(k|m)?$/);
  return m ? Number(m[1]) * (m[2] === "k" ? 1e3 : m[2] === "m" ? 1e6 : 1) : null;
};
const pick = (o, ...keys) => { for (const k of keys) if (o?.[k] != null && o[k] !== "") return o[k]; return null; };
const TYPE = (t) => {
  const s = String(t || "").toLowerCase();
  if (/payment_received|repay|debt_?pay|collect|received|balance/.test(s)) return "payment_received";
  if (/payment_made|supplier_?pay|pay_?supplier/.test(s)) return "payment_made";
  if (/purchase|restock|stock|buy|bought/.test(s)) return "purchase";
  if (/expense|transport|levy|cost|fee|rent/.test(s)) return "expense";
  return "sale";
};
function normaliseEntry(e) {
  const type = TYPE(pick(e, "type", "transaction_type", "kind", "category_type"));
  const qty = num(pick(e, "qty", "quantity", "count"));
  const unit_price = num(pick(e, "unit_price", "price_each", "price_per_unit", "price"));
  let total = num(pick(e, "total", "total_amount", "amount", "value"));
  if (total == null && qty != null && unit_price != null) total = qty * unit_price;
  let paid = num(pick(e, "paid", "amount_paid", "paid_amount", "cash_received"));
  const balance = num(pick(e, "balance", "balance_due", "remaining", "owed", "debt"));
  if (paid == null) paid = type === "sale" && balance != null && total != null ? total - balance : total;
  return {
    type,
    item: pick(e, "item", "product", "goods", "category") ?? (type === "expense" ? pick(e, "description", "details") : null),
    qty,
    unit: pick(e, "unit", "units", "measure"),
    unit_price,
    total: total ?? 0,
    paid: paid ?? 0,
    party: pick(e, "party", "customer", "matched_name", "supplier", "name", "payee"),
    note: pick(e, "note", "details", "description"),
  };
}

export const agents = {
  // Spoken/typed sentence (English, Nigerian Pidgin, mixed) → structured ledger entries.
  record: {
    effort: "medium",
    maxTokens: 2400,
    validate: (i) => (!i.said?.trim() ? "Say or type what happened." : null),
    system: `You are TallyTalk, a bookkeeping assistant for informal market traders in West Africa (e.g. a woman selling foodstuff at a Lagos or Onitsha market). Many users have low literacy. They speak English, Nigerian Pidgin, or a mix, often through voice-to-text, so expect recognition errors.

Turn what they said into ledger entries. Reason carefully about:
- Money shorthand: "45k" = 45000, "1.5k" = 1500, "two thousand five hundred" = 2500, "50 naira", "N5000".
- Quantities and units: bags, paint (a measuring bucket), mudu, crates, cartons, pieces, "half bag".
- Unit price vs total: "3 bags 45k each" means total 135000. "3 bags for 45k" means total 45000.
- Part payment and credit: "she pay 100k remain 35k" means paid 100000 and the customer owes 35000.
- Debt repayments: "Mama Chidi bring 20k for her balance" is a payment_received that reduces her debt.
- Purchases of stock vs expenses (transport, levy, "agbero", food, rent).
- If a number is genuinely ambiguous, make the most sensible guess and put a short question in "clarify".
Known customers (match names loosely, e.g. "mama chidi" = "Mama Chidi"): KNOWN_CUSTOMERS

Types: "sale", "purchase" (stock bought), "expense", "payment_received" (debt paid back to me), "payment_made" (I paid a supplier debt).
"confirm" is a short read-back in the SAME language style the user used (Pidgin if they used Pidgin), with numbers spoken naturally, so the trader can hear that it's right.

Reply ONLY with JSON using EXACTLY these keys (the app reads them by name; do not rename or flatten them, always use the "entries" array even for one entry):
{"entries":[{"type":"sale|purchase|expense|payment_received|payment_made","item":"... or null","qty":number or null,"unit":"... or null","unit_price":number or null,"total":number,"paid":number,"party":"customer/supplier name or null","note":"... or null"}],"confirm":"...","clarify":null}`,
    user: (i) => `Currency: ${i.currency || "NGN"}. Today: ${new Date().toISOString().slice(0, 10)}.
The trader said: """${i.said}"""`,
    post: (r) => {
      const list = Array.isArray(r.entries) ? r.entries : Array.isArray(r.transactions) ? r.transactions : Array.isArray(r) ? r : [r.entry || r.transaction || r];
      return {
        entries: list.map(normaliseEntry).filter((e) => e.total > 0),
        confirm: pick(r, "confirm", "confirmation", "read_back", "readback", "readBack", "message", "summary") || "Okay, I don write am.",
        clarify: pick(r, "clarify", "clarification", "clarifying_question", "question"),
      };
    },
    demo: (i) => {
      const s = i.said.toLowerCase();
      if (/bring|pay.*balance|clear/.test(s))
        return { entries: [{ type: "payment_received", item: null, qty: null, unit: null, unit_price: null, total: 20000, paid: 20000, party: "Mama Chidi", note: "Part of her balance" }], confirm: "Okay. Mama Chidi don pay ₦20,000 for her balance.", clarify: null };
      if (/transport|levy|agbero|keke/.test(s))
        return { entries: [{ type: "expense", item: "Transport", qty: null, unit: null, unit_price: null, total: 3500, paid: 3500, party: null, note: null }], confirm: "I don write ₦3,500 for transport.", clarify: null };
      return {
        entries: [{ type: "sale", item: "Rice", qty: 3, unit: "bag", unit_price: 45000, total: 135000, paid: 100000, party: "Mama Chidi", note: null }],
        confirm: "Okay. You sell 3 bags of rice to Mama Chidi, ₦45,000 each, total ₦135,000. She pay ₦100,000, remain ₦35,000.",
        clarify: null,
      };
    },
  },

  // Polite debt reminder message.
  remind: {
    effort: "low",
    maxTokens: 400,
    validate: (i) => (!i.party ? "Pick a customer." : null),
    system: `Write a short, warm, respectful WhatsApp message from a market trader to a regular customer reminding them about money they owe. Keep the relationship good. Customers are often friends or neighbours. Use the requested language (English, Nigerian Pidgin, Yoruba, Igbo or Hausa). Mention the exact amount and what it was for. Max 50 words. One friendly emoji at most.
Reply ONLY with JSON using EXACTLY this key: {"message":"..."}`,
    post: (r) => ({ message: pick(r, "message", "text", "reminder", "whatsapp_message", "reply") || "" }),
    user: (i) => JSON.stringify({ customer: i.party, amount_owed: i.amount, currency: i.currency || "NGN", items: i.items || [], language: i.language || "Nigerian Pidgin", trader_name: i.trader || null }),
    demo: (i) => ({ message: `Good morning ${i.party} 🙏. Hope family dey fine. Abeg, remember the ₦${Number(i.amount).toLocaleString()} balance from the rice. Anytime you ready, just send am. Thank you, my customer!` }),
  },

  // Ask about the business.
  ask: {
    effort: "medium",
    maxTokens: 700,
    validate: (i) => (!i.question?.trim() ? "Ask a question." : null),
    system: `You are a friendly business adviser for an informal market trader. Answer their question using ONLY the ledger summary provided (computed by the app, so trust its numbers). Use 2–4 short spoken sentences in the same language style they used (Pidgin if they used Pidgin). Give one practical, specific tip if useful (e.g. collecting a big debt, restocking a fast seller, cutting a recurring expense). Never invent numbers.
Reply ONLY with JSON using EXACTLY this key: {"answer":"..."}`,
    post: (r) => ({ answer: pick(r, "answer", "reply", "response", "text", "message") || "" }),
    user: (i) => `Ledger summary: ${JSON.stringify(i.summary)}\n\nQuestion: ${i.question}`,
    demo: () => ({ answer: "This week you sell ₦412,000 and you spend ₦298,500 on stock and other things, so you gain about ₦113,500. Rice na your best seller. But customers still owe you ₦62,000. Mama Chidi alone get ₦35,000, so collect that one first." }),
  },
};

// Allow the system prompt to know existing customers for name matching.
const base = agents.record.system;
agents.record.system = (i) => base.replace("KNOWN_CUSTOMERS", (i.customers || []).join(", ") || "none yet");
