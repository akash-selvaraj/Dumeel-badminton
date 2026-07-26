import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();
const ALLOWED_KEYS = new Set(["players", "sessions"]);

export default async function handler(req, res) {
  try {
    const key =
      req.method === "GET"
        ? req.query.key
        : req.body?.key;

    if (!key || !ALLOWED_KEYS.has(key)) {
      return res.status(400).json({
        error: "Invalid or missing key",
      });
    }

    if (req.method === "GET") {
      const value = await redis.get(key);
      return res.status(200).json({
        key,
        value: value ?? null,
      });
    }

    if (req.method === "POST") {
      const body =
        typeof req.body === "string"
          ? JSON.parse(req.body)
          : req.body;

      if (!body || body.value === undefined) {
        return res.status(400).json({
          error: "Missing value",
        });
      }

      await redis.set(key, body.value);

      return res.status(200).json({
        ok: true,
      });
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).json({
      error: "Method not allowed",
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: err.message,
    });
  }
}
