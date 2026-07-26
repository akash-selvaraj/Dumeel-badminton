import { Redis } from "@upstash/redis";

export default async function handler(req, res) {
  try {
    const redis = Redis.fromEnv();

    // Simple ping by writing and reading a test key
    await redis.set("test", "hello");
    const value = await redis.get("test");

    return res.status(200).json({
      success: true,
      value,
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      name: err.name,
      message: err.message,
      stack: err.stack,
    });
  }
}
