# TallyTalk

> Talk your sales, we keep the book. Voice bookkeeping in English and Pidgin for market traders.

**SERV Hackathon 02 · Open Track** · Built on [SERV Reasoning](https://docs.openserv.ai/serv-reasoning/introduction)

## Who it's for

**Informal market traders in West Africa**: the women selling rice, beans and garri at Lagos, Onitsha or Kano markets. They run real businesses (Nigeria has ~39.6M MSMEs, per SMEDAN/NBS, and ~85% of jobs in Africa are informal, per the ILO) but many have limited literacy or simply no time to write.

## The problem

Most market traders keep records in their heads or a tattered notebook. They lose track of customers who bought on credit, can't tell whether they're actually profitable, and have no transaction history, so they can't access microloans. Bookkeeping apps are built for literate, English-first users filling in forms, not for someone shouting prices in Pidgin over market noise.

## What TallyTalk does

Press one big button and talk the way you talk: "I sell 3 bags rice to Mama Chidi, 45k each, she pay 100k remain 35k." SERV Reasoning turns that into structured ledger entries. It works out unit price vs. total, "k" = thousand, part payment, credit and which customer it is, then **reads it back in your own style for confirmation** before anything is saved. TallyTalk tracks who owes you, writes polite WhatsApp reminders in Pidgin, English, Yorùbá, Igbo or Hausa, and answers "How my business dey this week?" out loud.

### Features

- One-button voice capture (en-NG) plus typed input; handles English, Pidgin and code-switching
- Understands market shorthand: 45k, paint, mudu, half bag, 'each' vs. 'for', part payment, 'remain'
- Read-back confirmation before saving (no reading required), and a clarifying question when ambiguous
- Ledger: sales, stock purchases, expenses (transport, levy), debt repayments
- Daily dashboard: sales, spent, cash in, total owed to you; all numbers computed in code
- 'Who owe me' list with AI-written, relationship-preserving WhatsApp reminders in 5 languages
- Spoken business Q&A grounded in the app's own computed summary (no invented numbers)
- Multi-currency (₦, GH₵, KSh, $); data stays on the phone

## How it uses SERV Reasoning

Every AI call in TallyTalk goes through SERV Reasoning's OpenAI-compatible endpoint, `POST https://inference-api.openserv.ai/v1/chat/completions`. See [`lib/serv.js`](lib/serv.js) and [`agents.js`](agents.js).

- `POST /api/record`: speech text + known customers go to SERV Reasoning (`reasoning_effort: medium`), which returns typed ledger entries, a read-back confirmation in the user's language style and an optional clarifying question.
- `POST /api/remind`: customer, amount, items and language return a warm WhatsApp reminder.
- `POST /api/ask`: the app-computed ledger summary plus a question returns a spoken answer and one practical tip.
- Why reasoning: "3 bags 45k each" and "3 bags for 45k" differ by ₦90,000. Parsing noisy, code-switched market speech into correct money amounts needs careful step-by-step reasoning, and SERV delivers it on a model cheap enough for a ₦1,500/month product. Totals are always computed in code, never by the model. Model output is normalised (any key naming → the ledger schema), and an empty reasoning-only reply is retried automatically.

**Auditable by design:** every answer in the UI shows a trace line with the SERV model, token usage, latency and completion ID, so users and carers can see what produced each result. The prompts ask for structured JSON, and the app renders it as UI rather than raw chat text.

## Run it locally

Requires **Node 18+**. There are **no dependencies to install**.

```bash
cp .env.example .env      # add your SERV_API_KEY from https://console.openserv.ai
npm start                 # → http://localhost:3000
```

No key yet? It still runs. Without `SERV_API_KEY` the server returns clearly-labelled **demo-mode** sample answers so the whole UI can be explored. Try `http://localhost:3000/app?demo=1`.

| Env var | Purpose |
|---|---|
| `SERV_API_KEY` | Your SERV key (required for live mode) |
| `SERV_MODEL` | Any model from the [SERV catalog](https://docs.openserv.ai/serv-reasoning/models). Default `gpt-5.4-mini` |
| `PORT` | Default 3000 |

## Deploy

- **Vercel (free, no card):** Add New → Project → import this repo → add `SERV_API_KEY` under Environment Variables → Deploy. Uses [`vercel.json`](vercel.json) + the serverless functions in [`api/`](api).
- **Render:** New → Blueprint → point at this repo (uses [`render.yaml`](render.yaml)), then set `SERV_API_KEY`.
- **Railway / Fly / any Node host:** start command `node server.js`, set `SERV_API_KEY`.

## Architecture

```
public/            static site: landing page (index.html) + app (app.html, app.js)
  common.js        shared browser helpers: API calls, speech in/out, SERV trace badge
api/               Vercel serverless functions (same agents, same behaviour)
server.js          zero-dependency Node HTTP server: static files + POST /api/<agent>
agents.js          the TallyTalk agents: system prompts, input → SERV → JSON, demo fallbacks
lib/serv.js        minimal SERV Reasoning client (fetch, reasoning_effort, JSON extraction)
```

Browser-native speech (Web Speech API) handles voice input and output. User data (history, settings, records) stays in the browser's localStorage. Nothing is stored on the server.

## Business model

Free starter (30 records/month). **Trader plan ₦1,500/mo** (~$1): unlimited records, WhatsApp reminders, weekly spoken report. **B2B:** microfinance banks and cooperatives pay for consented, credit-ready transaction histories to underwrite loans for thin-file traders. Market associations get dashboards.

## Roadmap

- WhatsApp bot interface (voice notes in, confirmations out)
- Offline queue with sync
- Native Yorùbá/Igbo/Hausa speech input
- Consented credit-score export for microfinance partners

## Accessibility

Semantic HTML, visible focus rings, skip links, ARIA live regions for every AI result, large touch targets (≥48px), `prefers-reduced-motion` support, and the Atkinson Hyperlegible font (designed for low-vision readers) for body text.

## License

MIT
