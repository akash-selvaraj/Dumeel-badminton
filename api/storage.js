import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();
const ALLOWED_KEYS = new Set(["players", "sessions"]);

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const { key } = req.query;

      if (!ALLOWED_KEYS.has(key)) {
        return res.status(400).json({ error: "Invalid key" });
      }

      const value = await redis.get(key);
      return res.status(200).json({ key, value: value ?? null });
    }

    if (req.method === "POST") {
      let body = req.body;

      if (typeof body === "string") {
        body = JSON.parse(body);
      }

      const { key, value } = body || {};

      if (!ALLOWED_KEYS.has(key)) {
        return res.status(400).json({ error: "Invalid key" });
      }

      await redis.set(key, value);

      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("Storage API Error:", err);

    return res.status(500).json({
      error: err.message,
      name: err.name,
    });
  }
}
