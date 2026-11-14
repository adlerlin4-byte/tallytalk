// Vercel: GET /api/health — tells the app whether SERV is live or in demo mode.
import { hasKey, DEFAULT_MODEL } from "../lib/serv.js";
import { agents, APP_NAME } from "../agents.js";

export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ app: APP_NAME, serv: hasKey() ? "live" : "demo", model: DEFAULT_MODEL, agents: Object.keys(agents) });
}
