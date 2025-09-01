// /api/notify-lead.js
// Guarda leads en Supabase y envía email (Resend) con rate limiting.
// Runtime: Node.js 20 (no Edge)

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Upstash Redis
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// 2 peticiones por email cada 10 min
const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(2, "10 m"),
  analytics: true,
});

export default async function handler(req, res) {
  console.log("📩 /api/notify-lead endpoint called");

  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "method_not_allowed" });
    }

    // 1) Body
    let body = {};
    try {
      body = req.body || {};
    } catch {
      return res.status(400).json({ error: "invalid_json" });
    }

    const nombre = (body.nombre || "").toString().trim();
    const email = (body.email || "").toString().trim().toLowerCase();
    const telefono = (body.telefono || "").toString().trim() || null;
    const mensaje = (body.mensaje || "").toString().trim();
    const coche_interes = (body.coche_interes || "").toString().trim() || null;

    let car_id = (body.car_id || "").toString().trim();
    if (!/^[0-9a-f-]{36}$/i.test(car_id)) car_id = null;

    const page_url = (body.page_url || "").toString().slice(0, 500);
    const user_agent = (body.user_agent || "").toString().slice(0, 500);

    // 2) Validación
    if (!nombre || nombre.length < 2) return res.status(400).json({ error: "invalid_name" });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "invalid_email" });
    if (!mensaje || mensaje.length < 10) return res.status(400).json({ error: "invalid_message" });

    // 3) Rate limit
    const { success, limit, remaining, reset } = await ratelimit.limit(`lead_limit:${email}`);
    console.log("⏳ Rate limit:", { success, limit, remaining, reset });
    if (!success) {
      return res.status(429).json({
        error: "too_many_requests",
        message: `Este email ha alcanzado el máximo de ${limit} envíos en 10 minutos. Intenta más tarde.`,
        limit,
        remaining,
        reset,
      });
    }

    // 4) Insert en Supabase (REST + fallback SDK)
    const SB_URL = process.env.SUPABASE_URL;
    const SB_SRK = process.env.SUPABASE_SERVICE_ROLE;
    if (!SB_URL || !SB_SRK) {
      console.error("❌ Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE");
      return res.status(500).json({ error: "server_misconfigured" });
    }

    const insertPayload = {
      nombre,
      email,
      telefono,
      mensaje,
      coche_interes,
      car_id,
      page_url,
      user_agent,
      estado: "nuevo",
    };

    let leadId = null;
    let insertSource = null;

    // 4A) REST
    const restEndpoint = `${SB_URL.replace(/\/$/, "")}/rest/v1/leads?select=id`;
    let restStatus = 0,
      restBodyText = "";

    try {
      const resp = await fetch(restEndpoint, {
        method: "POST",
        headers: {
          apikey: SB_SRK,
          Authorization: `Bearer ${SB_SRK}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
          "Content-Profile": "public",
          Accept: "application/json",
        },
        body: JSON.stringify(insertPayload),
      });

      restStatus = resp.status;
      restBodyText = await resp.text();
      console.log("🟦 REST insert status:", restStatus, "| body:", restBodyText?.slice(0, 400));

      if (resp.ok) {
        try {
          const json = restBodyText ? JSON.parse(restBodyText) : null;
          leadId = Array.isArray(json) ? json[0]?.id : json?.id ?? null;
          if (leadId) insertSource = "rest";
        } catch (e) {
          console.warn("⚠️ REST parse JSON falló:", e.message);
        }
      }
    } catch (e) {
      console.warn("⚠️ REST request error:", e.message);
    }

    // 4B) Fallback SDK
    if (!leadId) {
      console.warn("⚠️ Fallback a supabase-js (REST no devolvió id)");
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const sb = createClient(SB_URL, SB_SRK, { auth: { persistSession: false } });

        const { data, error } = await sb.from("leads").insert(insertPayload).select("id").single();
        if (error) throw error;
        leadId = data?.id || null;
        if (leadId) insertSource = "supabase-js";
        console.log("🟩 Fallback insert OK, id:", leadId);
      } catch (e) {
        console.error("❌ Supabase insert (fallback) error:", e);
        return res.status(500).json({
          error: "db_insert_failed",
          restStatus,
          restBodyText: restBodyText?.slice(0, 400) || null,
        });
      }
    }

    // 5) Email con Resend (logs + fallback simple)
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const TO = process.env.LEADS_TO_EMAIL;
    const FROM = process.env.LEADS_FROM_EMAIL || "onboarding@resend.dev";

    if (RESEND_API_KEY && TO) {
      try {
        const origin = (process.env.SITE_ORIGIN || "").replace(/\/$/, "");
        const carLink = page_url || (car_id && origin ? `${origin}/car.html?id=${car_id}` : null);

        const subjectPretty = `🚗 Lead: ${nombre}${coche_interes ? ` — ${coche_interes}` : ""}`;
        const preheader = `De ${nombre} (${email})${telefono ? ` · ${telefono}` : ""}${coche_interes ? ` · ${coche_interes}` : ""}`;

        const html = `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<title>${subjectPretty}</title>
</head>
<body style="margin:0;padding:0;background:#f6f7fb;">
<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${preheader}</span>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f6f7fb;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
<tr><td style="background:#111827;padding:16px 20px;color:#fff;font:600 16px/1.2 Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
<span style="font-size:18px">🚗</span><span style="margin-left:8px;">Nuevo lead</span></td></tr>
<tr><td style="padding:20px 22px;font:400 14px/1.6 Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111827;">
<div style="margin:0 0 12px 0;font-size:16px;font-weight:600;">${coche_interes || "Consulta desde la web"}</div>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px 0;">
${nombre ? `<tr><td style="padding:6px 0;color:#6b7280;width:120px;">Nombre</td><td style="padding:6px 0;color:#111827;font-weight:500;">${nombre}</td></tr>` : ""}
${email ? `<tr><td style="padding:6px 0;color:#6b7280;">Email</td><td style="padding:6px 0;"><a href="mailto:${email}" style="color:#4338ca;text-decoration:none;">${email}</a></td></tr>` : ""}
${telefono ? `<tr><td style="padding:6px 0;color:#6b7280;">Teléfono</td><td style="padding:6px 0;"><a href="tel:${telefono}" style="color:#111827;text-decoration:none;">${telefono}</a></td></tr>` : ""}
${carLink ? `<tr><td style="padding:6px 0;color:#6b7280;">Ficha</td><td style="padding:6px 0;"><a href="${carLink}" style="color:#4338ca;text-decoration:none;">${carLink}</a></td></tr>` : ""}
</table>
<div style="margin:8px 0 14px 0;color:#111827;font-weight:600;">Mensaje</div>
<div style="white-space:pre-wrap;border-left:4px solid #6366F1;background:#f3f4f6;padding:10px 12px;border-radius:8px;color:#111827;">${mensaje}</div>
${carLink ? `<div style="margin:18px 0 6px 0;"><a href="${carLink}" style="display:inline-block;background:#6366F1;color:#fff;text-decoration:none;padding:10px 16px;border-radius:10px;font-weight:600;">Abrir coche</a></div>` : ""}
<div style="margin-top:12px;color:#6b7280;font-size:12px;">${page_url ? `${page_url}<br/>` : ""}${user_agent || ""}</div>
</td></tr>
<tr><td style="padding:14px 20px;color:#6b7280;background:#fafafa;border-top:1px solid #e5e7eb;font:400 12px/1.4 Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;">Responde a este email para contactar con <b>${nombre || "el interesado"}</b>.</td></tr>
</table>
</td></tr>
</table>
</body></html>`;

        const text = `Nuevo lead
Nombre: ${nombre}
Email: ${email}
Teléfono: ${telefono || "-"}
Coche: ${coche_interes || "-"}
Mensaje:
${mensaje}

${carLink || page_url || ""}

${user_agent || ""}`;

        // Envío principal (con nombre en "from" y emoji en subject)
        const payload = {
          from: `Leads <${FROM}>`,
          to: [TO],
          subject: subjectPretty,
          html,
          text,
          reply_to: email,
        };

        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const rText = await r.text();
        console.log("📨 Resend respuesta:", r.status, rText?.slice(0, 400));

        // Fallback simple si falla
        if (!r.ok) {
          console.warn("⚠️ Resend falló, intentando payload simple…");
          const simple = {
            from: FROM, // sin nombre
            to: [TO],
            subject: `Lead: ${nombre}${coche_interes ? ` - ${coche_interes}` : ""}`, // sin emoji
            html,
            text,
            reply_to: email,
          };
          const r2 = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify(simple),
          });
          const r2Text = await r2.text();
          console.log("📨 Resend fallback:", r2.status, r2Text?.slice(0, 400));
          if (!r2.ok) {
            console.error("❌ Resend error definitivo:", r2.status, r2Text);
          }
        }
      } catch (e) {
        console.warn("⚠️ Resend exception:", e?.message || e);
      }
    }

    // 6) Respuesta
    console.log("✅ Lead guardado con ID:", leadId, "vía:", insertSource);
    return res.status(200).json({ ok: true, id: leadId, source: insertSource, remaining, reset });
  } catch (e) {
    console.error("❌ Handler exception:", e);
    return res.status(500).json({ error: "internal_error" });
  }
}
