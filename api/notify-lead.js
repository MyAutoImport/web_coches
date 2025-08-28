// /api/notify-lead.js
// Endpoint para guardar leads en Supabase y enviar email (Resend) con rate limiting por email.
// Runtime: Node.js 20 (no Edge)

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Conexión a Upstash Redis
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Límite: 3 peticiones por email cada 10 minutos
const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(2, "10 m"),
  analytics: true,
});

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "method_not_allowed" });
    }

    // =====================
    // 1. Leer el body (JSON)
    // =====================
    let body = {};
    try {
      body = req.body || {};
    } catch {
      return res.status(400).json({ error: "invalid_json" });
    }

    const nombre = (body.nombre || "").toString().trim();
    const email = (body.email || "").toString().trim();
    const telefono = (body.telefono || "").toString().trim() || null;
    const mensaje = (body.mensaje || "").toString().trim();
    const coche_interes = (body.coche_interes || "").toString().trim() || null;
    const car_id = (body.car_id || "").toString().trim() || null;
    const page_url = (body.page_url || "").toString().slice(0, 500);
    const user_agent = (body.user_agent || "").toString().slice(0, 500);

    // =====================
    // 2. Validación simple
    // =====================
    if (!nombre || nombre.length < 2) {
      return res.status(400).json({ error: "invalid_name" });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "invalid_email" });
    }
    if (!mensaje || mensaje.length < 10) {
      return res.status(400).json({ error: "invalid_message" });
    }

    // =====================
    // 3. Rate limiting (por email)
    // =====================
    const key = `lead_limit:${email.toLowerCase()}`;
    const { success, reset, remaining } = await ratelimit.limit(key);

    if (!success) {
      return res.status(429).json({
        error: "too_many_requests",
        message: "Este email ha enviado el máximo de 3 leads. Intenta más tarde.",
        reset,
      });
    }

    // =====================
    // 4. Insert en Supabase
    // =====================
    const SB_URL = process.env.SUPABASE_URL;
    const SB_SRK = process.env.SUPABASE_SERVICE_ROLE;

    if (!SB_URL || !SB_SRK) {
      return res.status(500).json({ error: "server_misconfigured" });
    }

    const insertPayload = [{
      nombre,
      email,
      telefono,
      mensaje,
      coche_interes,
      car_id,
      page_url,
      user_agent,
      estado: "nuevo"
    }];

    const sbRes = await fetch(`${SB_URL}/rest/v1/leads`, {
      method: "POST",
      headers: {
        "apikey": SB_SRK,
        "Authorization": `Bearer ${SB_SRK}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      },
      body: JSON.stringify(insertPayload)
    });

    const sbJson = await sbRes.json().catch(() => null);
    if (!sbRes.ok) {
      console.error("❌ Supabase insert error:", sbJson);
      return res.status(500).json({ error: "db_insert_failed" });
    }

    const leadId = Array.isArray(sbJson) && sbJson[0]?.id ? sbJson[0].id : null;

    // =====================
    // 5. Email opcional con Resend
    // =====================
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const TO = process.env.LEADS_TO_EMAIL;
    const FROM = process.env.LEADS_FROM_EMAIL || "onboarding@resend.dev";

    if (RESEND_API_KEY && TO) {
      try {
        const html = `
          <h2>🚗 Nuevo lead</h2>
          <p><b>Nombre:</b> ${nombre}</p>
          <p><b>Email:</b> ${email}</p>
          ${telefono ? `<p><b>Teléfono:</b> ${telefono}</p>` : ""}
          ${coche_interes ? `<p><b>Coche:</b> ${coche_interes}</p>` : ""}
          <p><b>Mensaje:</b></p>
          <div style="white-space:pre-wrap;border-left:4px solid #6366F1;padding-left:12px">
            ${mensaje}
          </div>
          <hr/>
          <p style="color:#666;font-size:.9rem">
            ${page_url}<br/>
            ${user_agent}
          </p>
        `;

        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            from: FROM,
            to: [TO],
            subject: `🚗 Lead: ${nombre}${coche_interes ? ` — ${coche_interes}` : ""}`,
            html
          })
        });
      } catch (e) {
        console.warn("⚠️ Resend failed:", e.message);
      }
    }

    // =====================
    // 6. Respuesta final
    // =====================
    return res.status(200).json({
      ok: true,
      id: leadId,
      remaining
    });

  } catch (e) {
    console.error("❌ Handler exception:", e);
    return res.status(500).json({ error: "internal_error" });
  }
}
