export default function handler(req, res) {
  return res.json({
    hasUrl: !!process.env.UPSTASH_REDIS_REST_URL,
    hasToken: !!process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}
