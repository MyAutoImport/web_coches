// /api/notify-matches.js
// Busca usuarios con preferencias que encajen con un coche y les envía email (Resend).
// Runtime: Node.js 20 (no Edge)

import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  try {
    // Seguridad opcional: secreto para invocaciones desde DB trigger
    const hookSecret = process.env.NOTIFY_HOOK_SECRET || "";
    const hdr = (req.headers["x-hook-secret"] || req.headers["X-Hook-Secret"] || "").toString();
    if (hookSecret && hdr !== hookSecret) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const { car_id } = req.body || {};
    if (!car_id) return res.status(400).json({ error: "missing_car_id" });

    const SB_URL = process.env.SUPABASE_URL;
    const SB_SRV = process.env.SUPABASE_SERVICE_ROLE;
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const ORIGIN = (process.env.SITE_ORIGIN || "").replace(/\/$/, "");

    if (!SB_URL || !SB_SRV) return res.status(500).json({ error: "server_misconfigured" });

    const sb = createClient(SB_URL, SB_SRV, { auth: { persistSession: false } });

    // 1) Coche
    const { data: car, error: eCar } = await sb
      .from("cars")
      .select("id, marca, modelo, anio, km, combustible, caja, precio_objetivo")
      .eq("id", car_id).single();
    if (eCar || !car) return res.status(404).json({ error: "car_not_found" });

    // 2) Preferencias
    const { data: prefs, error: ePrefs } = await sb
      .from("buyer_prefs")
      .select("user_id, name, notify_email, brands, models, fuel, gearbox, body, budget_min, budget_max, year_min, year_max, km_max");
    if (ePrefs) return res.status(500).json({ error: "prefs_error", detail: ePrefs.message });

    // Helpers de matching
    const fits = (arr, v) => !arr || arr.length === 0 || (v != null && arr.map(String).includes(String(v)));
    const inRange = (min, max, val) => (min == null || val >= min) && (max == null || val <= max);

    const price = car.precio_objetivo ?? 0;
    const year  = car.anio ?? 0;
    const km    = car.km ?? 0;

    const matches = (prefs || []).filter(p =>
      p.notify_email !== false &&
      inRange(p.budget_min, p.budget_max, price) &&
      inRange(p.year_min,   p.year_max,   year)  &&
      (p.km_max == null || km <= p.km_max) &&
      fits(p.brands,  car.marca) &&
      fits(p.models,  car.modelo) &&
      fits(p.fuel,    car.combustible) &&
      fits(p.gearbox, car.caja) &&
      fits(p.body,    car.body) // si no tienes 'body' en cars, no pasa nada: quedará undefined y fits() será permisivo si pref no pide nada
    );

    if (matches.length === 0) return res.status(200).json({ ok: true, sent: 0 });

    // 3) Evita duplicados ya enviados para este coche
    const { data: already, error: eLog } = await sb
      .from("notify_log")
      .select("user_id")
      .eq("car_id", car.id);
    const alreadySet = new Set((already || []).map(x => x.user_id));
    const toNotify = matches.filter(m => !alreadySet.has(m.user_id));
    if (toNotify.length === 0) return res.status(200).json({ ok: true, sent: 0 });

    // 4) Emails de usuarios (admin API)
    const emails = [];
    for (const m of toNotify) {
      try {
        const { data: u } = await sb.auth.admin.getUserById(m.user_id);
        const email = u?.user?.email;
        if (email) emails.push({ email, user_id: m.user_id });
      } catch (_) {}
    }
    if (emails.length === 0) return res.status(200).json({ ok: true, sent: 0 });

    // 5) Construir email
    const carUrl = `${ORIGIN || ""}/car.html?id=${car.id}`;
    const subject = `🔔 Nuevo coche que encaja: ${car.marca} ${car.modelo} ${car.anio ?? ""}`.trim();
    const html = `
      <div style="font:14px/1.6 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; color:#111827">
        <h2 style="margin:0 0 8px">Nuevo coche que encaja con tu búsqueda</h2>
        <p><b>${car.marca} ${car.modelo}</b> — ${car.anio ?? "?"} • ${car.km?.toLocaleString("es-ES")} km • ${car.precio_objetivo != null ? car.precio_objetivo.toLocaleString("es-ES")+" €" : "precio a consultar"} • ${car.combustible ?? "—"} ${car.caja ? " · "+car.caja : ""}</p>
        <p><a href="${carUrl}" style="background:#6366F1;color:#fff;text-decoration:none;padding:10px 14px;border-radius:10px;display:inline-block">Ver coche</a></p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0"/>
        <p style="color:#6b7280">Recibes este email porque tienes alertas activadas en My Auto Import.</p>
      </div>
    `.trim();

    // 6) Envío
    if (RESEND_API_KEY) {
      for (const { email } of emails) {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "Avisos <no-reply@myautoimport.es>", // ajusta dominio
            to: [email],
            subject, html,
          }),
        });
      }
    }

    // 7) Log
    const logs = emails.map(e => ({ user_id: e.user_id, car_id: car.id }));
    await sb.from("notify_log").insert(logs, { returning: "minimal" });

    return res.status(200).json({ ok: true, sent: emails.length });
  } catch (e) {
    console.error("notify-matches error:", e);
    return res.status(500).json({ error: "internal_error" });
  }
}
