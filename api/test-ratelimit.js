import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(2, "10 m"),
  analytics: true,
});

export default async function handler(req, res) {
  console.log("📩 test-ratelimit endpoint called");

  const email = req.query.email || "anonymous";
  const { success, limit, remaining, reset } = await ratelimit.limit(email);

  if (!success) {
    return res.status(429).json({
      success: false,
      message: "Too many requests",
      limit,
      remaining,
      reset,
    });
  }

  return res.status(200).json({
    success: true,
    message: "Request allowed",
    limit,
    remaining,
    reset,
  });
}
