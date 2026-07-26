import { Redis } from "@upstash/redis";

// Redis.fromEnv() reads UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
// (and falls back to the older KV_REST_API_URL / KV_REST_API_TOKEN names),
// whichever the Upstash Vercel integration injected — no manual config.
const redis = Redis.fromEnv();

// Only these keys are readable/writable through this endpoint — keeps the
// route from becoming an open key-value store for anything else.
const ALLOWED_KEYS = new Set(["players", "sessions"]);

export default async function handler(req, res) {
  const key = req.method === "GET" ? req.query.key : req.body?.key;

  if (!key || !ALLOWED_KEYS.has(key)) {
    return res.status(400).json({ error: "Invalid or missing key" });
  }

  if (req.method === "GET") {
    const value = await redis.get(key);
    return res.status(200).json({ key, value: value ?? null });
  }

  if (req.method === "POST") {
    const { value } = req.body || {};
    await redis.set(key, value);
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
