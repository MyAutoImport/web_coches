import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Configurar Redis con tus variables de entorno
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Rate limit: 2 requests cada 10 minutos
const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(2, "10 m"),
  analytics: true,
});

export default async function handler(req, res) {
  console.log("📩 /api/test-ratelimit endpoint hit", req.query);

  try {
    const email = req.query.email || "anonymous";
    const identifier = email.toLowerCase();

    const { success, limit, remaining, reset } = await ratelimit.limit(identifier);

    if (!success) {
      console.warn("⚠️ Too many requests for:", identifier);
      return res.status(429).json({
        success: false,
        message: "Too many requests, please try again later.",
        limit,
        remaining,
        reset,
      });
    }

    console.log("✅ Request allowed for:", identifier);
    return res.status(200).json({
      success: true,
      message: "Request allowed.",
      limit,
      remaining,
      reset,
    });
  } catch (error) {
    console.error("❌ Rate limit error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
