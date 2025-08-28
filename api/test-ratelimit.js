// /api/test-ratelimit.js
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Conectar con Upstash Redis
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Rate limit: 2 intentos cada 10 minutos
const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(2, "10 m"),
  analytics: true,
});

export default async function handler(req, res) {
  try {
    const email = (req.query.email || "test@example.com").toLowerCase();
    const key = `test_limit:${email}`;

    const result = await ratelimit.limit(key);

    console.log("🔎 Ratelimit result:", result);

    return res.status(200).json({
      email,
      result
    });
  } catch (err) {
    console.error("❌ Error en test-ratelimit:", err);
    return res.status(500).json({ error: "internal_error" });
  }
}
