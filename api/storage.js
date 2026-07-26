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

    switch (req.method) {
      case "GET": {
        const value = await redis.get(key);
        return res.status(200).json({
          key,
          value: value ?? null,
        });
      }

      case "POST": {
        const { value } = req.body ?? {};

        if (value === undefined) {
          return res.status(400).json({
            error: "Missing value",
          });
        }

        await redis.set(key, value);

        return res.status(200).json({
          ok: true,
        });
      }

      default:
        res.setHeader("Allow", ["GET", "POST"]);
        return res.status(405).json({
          error: "Method not allowed",
        });
    }
  } catch (error) {
    console.error("Storage API error:", error);

    return res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
