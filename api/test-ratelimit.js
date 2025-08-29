import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(2, "10 m"),
});

export default async function handler(req, res) {
  const email = req.query.email || "anon@test.com";
  const key = `lead_limit:${email}`;

  const { success, limit, remaining, reset } = await ratelimit.limit(key);

  console.log("🔎 Test rate limit:", { key, success, limit, remaining, reset });

  if (!success) {
    return res.status(429).json({ error: "too_many_requests", limit, remaining, reset });
  }

  return res.status(200).json({ ok: true, limit, remaining, reset });
}
