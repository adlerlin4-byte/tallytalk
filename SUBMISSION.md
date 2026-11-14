# TallyTalk: submission kit

## Submission form answers

**Project name:** TallyTalk

**Track:** Open Track (SERV Reasoning)

**One-liner:** Talk your sales, we keep the book. Voice bookkeeping in English and Pidgin for market traders.

**What it does:**
Press one big button and talk the way you talk: "I sell 3 bags rice to Mama Chidi, 45k each, she pay 100k remain 35k." SERV Reasoning turns that into structured ledger entries. It works out unit price vs. total, "k" = thousand, part payment, credit and which customer it is, then **reads it back in your own style for confirmation** before anything is saved. TallyTalk tracks who owes you, writes polite WhatsApp reminders in Pidgin, English, Yorùbá, Igbo or Hausa, and answers "How my business dey this week?" out loud.

**Target audience:**
**Informal market traders in West Africa**: the women selling rice, beans and garri at Lagos, Onitsha or Kano markets. They run real businesses (Nigeria has ~39.6M MSMEs, per SMEDAN/NBS, and ~85% of jobs in Africa are informal, per the ILO) but many have limited literacy or simply no time to write.

**How it uses SERV Reasoning:**
- `POST /api/record`: speech text + known customers go to SERV Reasoning (`reasoning_effort: medium`), which returns typed ledger entries, a read-back confirmation in the user's language style and an optional clarifying question.
- `POST /api/remind`: customer, amount, items and language return a warm WhatsApp reminder.
- `POST /api/ask`: the app-computed ledger summary plus a question returns a spoken answer and one practical tip.
- Why reasoning: "3 bags 45k each" and "3 bags for 45k" differ by ₦90,000. Parsing noisy, code-switched market speech into correct money amounts needs careful step-by-step reasoning, and SERV delivers it on a model cheap enough for a ₦1,500/month product. Totals are always computed in code, never by the model.

**What was built during the hackathon:** Everything. The landing page, the app, the SERV agents and the zero-dependency server were all built for SERV Hackathon 02 (Nov 2026).

**Public repo:** https://github.com/adlerlin4-byte/tallytalk
**Live demo:** https://tally-talk-six.vercel.app/app?demo=1 (landing page: https://tally-talk-six.vercel.app)
**Demo video:** <paste YouTube/Loom link>
**X post:** <paste link>

## X post (copy, then add links)

```
Meet TallyTalk 🎙️📒

Voice bookkeeping for market traders. Say "I sell 3 bags rice to Mama Chidi 45k each, she pay 100k" in English or Pidgin and it keeps the book, tracks who owes you, and writes polite WhatsApp reminders.

Built on @openservai SERV Reasoning #SERVHackathon

https://tally-talk-six.vercel.app https://github.com/adlerlin4-byte/tallytalk
```

## 90-second demo video script

- 0:00 Show a market trader's problem: credit customers, no records, no loans.
- 0:15 Open `/app?demo=1` with a living ledger and today's totals.
- 0:25 Tap 'Rice on credit' (or speak it) → read-back in Pidgin → '✓ Correct, save am'. Mama Chidi now owes ₦35,000.
- 0:50 Tap 'Debt repaid' → her balance drops.
- 1:05 Remind → a Pidgin WhatsApp message → 'Send on WhatsApp'. Switch to Yorùbá.
- 1:20 Ask 'How my business dey this week?' → spoken answer. Close on SERV Reasoning parsing money correctly.

**Recording tips:** record with `SERV_API_KEY` set so the trace line shows "SERV Reasoning · model · tokens". Use Chrome (best Web Speech support). Turn system audio on so judges hear the read-aloud.
