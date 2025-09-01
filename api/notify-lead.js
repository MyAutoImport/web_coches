// /api/notify-lead.js
// Guarda leads en Supabase y envía email (Resend) con rate-limit (Upstash).
// Runtime: Node.js 20

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { createClient } from "@supabase/supabase-js";

// ---------- Rate limit (Upstash) ----------
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(2, "10 m"), // 2 envíos / 10 min por email
  analytics: true,
});

// ---------- Helpers ----------
const isUUID  = s => /^[0-9a-f-]{36}$/i.test(String(s || "").trim());
const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());
const trimTo  = (v, n=500) => String(v ?? "").slice(0, n);
const getProjectRef = (url) => {
  try { return new URL(url).hostname.split(".")[0]; } catch { return ""; }
};

// REST insert with return=representation
async function insertLeadREST(SB_URL, SB_SRK, payload){
  const res = await fetch(`${SB_URL}/rest/v1/leads`, {
    method: "POST",
    headers: {
      apikey: SB_SRK,
      Authorization: `Bearer ${SB_SRK}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Prefer": "return=representation",
      "Content-Profile": "public",
    },
    body: JSON.stringify([payload]),
  });

  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    const txt = typeof data === "object" ? JSON.stringify(data) : String(data);
    throw new Error(`REST ${res.status}: ${txt}`);
  }
  const id = Array.isArray(data) && data[0]?.id ? data[0].id : null;
  if (!id) throw new Error("REST ok pero sin id devuelto");
  return id;
}

// Fallback SDK (service-role)
async function insertLeadSDK(SB_URL, SB_SRK, payload){
  const sb = createClient(SB_URL, SB_SRK, {
    auth: { persistSession:false, autoRefreshToken:false },
    global: { headers: { "X-Client-Info": "notify-lead" } },
  });
  const { data, error } = await sb.from("leads").insert(payload).select("id").single();
  if (error) throw error;
  return data.id;
}

export default async function handler(req, res){
  console.log("📩 /api/notify-lead called");

  try{
    if (req.method !== "POST") {
      return res.status(405).json({ error: "method_not_allowed" });
    }

    // 1) Body + validación
    const body = req.body || {};
    const nombre = trimTo(body.nombre).trim();
    const email  = trimTo(body.email).trim().toLowerCase();
    const telefono = trimTo(body.telefono, 50) || null;
    const mensaje  = trimTo(body.mensaje, 2000).trim();
    const coche_interes = trimTo(body.coche_interes, 200) || null;

    let car_id = trimTo(body.car_id, 64);
    if (!isUUID(car_id)) car_id = null;

    const page_url  = trimTo(body.page_url);
    const user_agent = trimTo(body.user_agent);

    if (nombre.length < 2)  return res.status(400).json({ error:"invalid_name" });
    if (!isEmail(email))    return res.status(400).json({ error:"invalid_email" });
    if (mensaje.length < 10) return res.status(400).json({ error:"invalid_message" });

    // 2) Rate limit
    const { success, limit, remaining, reset } = await ratelimit.limit(`lead_limit:${email}`);
    console.log("⏳ rate:", { success, remaining, reset });
    if (!success){
      return res.status(429).json({ error:"too_many_requests", limit, remaining, reset });
    }

    // 3) Insert en Supabase
    const SB_URL = process.env.SUPABASE_URL;
    const SB_SRK = process.env.SUPABASE_SERVICE_ROLE;
    if (!SB_URL || !SB_SRK){
      console.error("❌ Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE");
      return res.status(500).json({ error:"server_misconfigured" });
    }
    const projectRef = getProjectRef(SB_URL);
    console.log("🗃️ Supabase projectRef:", projectRef, "SB_URL:", SB_URL);

    const payload = {
      nombre, email, telefono, mensaje, coche_interes, car_id,
      page_url, user_agent, estado: "nuevo",
    };

    let leadId = null;
    try{
      leadId = await insertLeadREST(SB_URL, SB_SRK, payload);
      console.log("✅ REST insert id:", leadId);
    }catch(e1){
      console.warn("⚠️ REST falló, probando SDK:", e1.message);
      try{
        leadId = await insertLeadSDK(SB_URL, SB_SRK, payload);
        console.log("✅ SDK insert id:", leadId);
      }catch(e2){
        console.error("❌ SDK insert error:", e2.message);
        return res.status(500).json({ error:"db_insert_failed" });
      }
    }

    // 4) Email SOLO si hubo id
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const TO   = process.env.LEADS_TO_EMAIL;
    const FROM = process.env.LEADS_FROM_EMAIL || "onboarding@resend.dev";

    if (leadId && RESEND_API_KEY && TO){
      try{
        const html = `
          <h2>🚗 Nuevo lead</h2>
          <p><b>Nombre:</b> ${nombre}</p>
          <p><b>Email:</b> ${email}</p>
          ${telefono ? `<p><b>Teléfono:</b> ${telefono}</p>` : ""}
          ${coche_interes ? `<p><b>Coche:</b> ${coche_interes}</p>` : ""}
          <p><b>Mensaje:</b></p>
          <div style="white-space:pre-wrap;border-left:4px solid #6366F1;padding-left:12px">${mensaje}</div>
          <hr/>
          <p style="color:#666;font-size:.9rem">${page_url}<br/>${user_agent}</p>
          <p style="color:#666;font-size:.8rem">ProjectRef: ${projectRef}</p>
        `;
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: FROM, to: [TO], subject: `🚗 Lead: ${nombre}${coche_interes ? ` — ${coche_interes}` : ""}`, html })
        });
        if(!r.ok) console.warn("⚠️ Resend error:", await r.text());
      }catch(e){
        console.warn("⚠️ Resend exception:", e?.message || e);
      }
    } else if (!leadId) {
      console.warn("⚠️ No se envía email porque no hubo leadId (falló inserción).");
    }

    return res.status(200).json({ ok:true, id: leadId, remaining, reset, projectRef });

  }catch(e){
    console.error("❌ Handler exception:", e);
    return res.status(500).json({ error:"internal_error" });
  }
}
