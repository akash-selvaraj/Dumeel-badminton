import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const key = req.query.key;

      const value = await redis.get(key);
      return res.status(200).json({ value });
    }

    if (req.method === "POST") {
      console.log("Raw body:", req.body);

      let body = req.body;

      if (typeof body === "string") {
        body = JSON.parse(body);
      }

      const key = body.key;
      const value = body.value;

      await redis.set(key, value);

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error(e);

    return res.status(500).json({
      message: e.message,
      stack: e.stack,
    });
  }
}
