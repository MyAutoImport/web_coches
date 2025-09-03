// /api/notify-matches.js
// Busca usuarios con preferencias que encajen con un coche y les envía email (Resend)

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  try {
    const { car_id } = req.body || {};
    if (!car_id) return res.status(400).json({ error: "missing_car_id" });

    const SB_URL = process.env.SUPABASE_URL;
    const SB_SRV = process.env.SUPABASE_SERVICE_ROLE;  // service role para saltar RLS
    const RESEND_API_KEY = process.env.RESEND_API_KEY;

    // 1) Carga coche
    const carResp = await fetch(`${SB_URL}/rest/v1/cars?id=eq.${car_id}&select=*`, {
      headers: { apikey: SB_SRV, Authorization:`Bearer ${SB_SRV}` }
    });
    const cars = await carResp.json();
    const car = cars?.[0];
    if (!car) return res.status(404).json({ error:"car_not_found" });

    // 2) Encuentra candidatos (filtra en SQL sencillo + filtrado fino en JS)
    const prefsResp = await fetch(`${SB_URL}/rest/v1/buyer_prefs?select=user_id,name,notify_email,brands,models,fuel,gearbox,body,budget_min,budget_max,year_min,year_max,km_max`, {
      headers: { apikey: SB_SRV, Authorization:`Bearer ${SB_SRV}` }
    });
    const prefs = await prefsResp.json();

    const fits = (arr, v) => !arr || arr.length===0 || (v != null && arr.includes(String(v)));
    const inRange = (min,max,val) => (min==null || val>=min) && (max==null || val<=max);

    const matches = prefs.filter(p =>
      (p.notify_email !== false) &&
      inRange(p.budget_min, p.budget_max, car.price ?? 0) &&
      inRange(p.year_min,   p.year_max,   car.year  ?? 0) &&
      (p.km_max == null || (car.km ?? 0) <= p.km_max) &&
      fits(p.brands,  car.brand) &&
      fits(p.models,  car.model) &&
      fits(p.fuel,    car.fuel) &&
      fits(p.gearbox, car.gearbox) &&
      fits(p.body,    car.body)
    );

    // 3) Carga emails de esos user_id
    if (matches.length === 0) return res.status(200).json({ ok:true, sent:0 });

    const ids = matches.map(m => m.user_id).map(id => `id=eq.${id}`).join("&");
    const usersResp = await fetch(`${SB_URL}/auth/v1/admin/users?${ids}`, {
      headers: { Authorization:`Bearer ${SB_SRV}` }
    });
    const usersJson = await usersResp.json();
    const toList = (usersJson.users || usersJson).map(u => u.email).filter(Boolean);

    // 4) Evitar duplicados por coche/usuario (notify_log)
    const origin = (process.env.SITE_ORIGIN || "").replace(/\/$/, "");
    const carUrl = car.slug ? `${origin}/car.html?slug=${encodeURIComponent(car.slug)}` :
                               `${origin}/car.html?id=${car.id}`;

    if (RESEND_API_KEY && toList.length) {
      const subject = `🔔 Nuevo coche que encaja con tu búsqueda: ${car.brand} ${car.model}`;
      const html = `
        <h2>Nuevo coche</h2>
        <p><b>${car.brand} ${car.model}</b> — año ${car.year ?? "?"}, ${car.km ?? "?"} km — ${car.price ? car.price+" €" : "precio a consultar"}</p>
        <p><a href="${carUrl}">Ver ficha</a></p>
        <hr>
        <p style="color:#6b7280">Recibes este email porque tienes alertas activadas en My Auto Import.</p>
      `;

      // manda en lotes pequeños
      for (const email of toList) {
        await fetch("https://api.resend.com/emails", {
          method:"POST",
          headers:{ Authorization:`Bearer ${RESEND_API_KEY}`, "Content-Type":"application/json" },
          body: JSON.stringify({ from: "Avisos <no-reply@yourdomain.com>", to:[email], subject, html })
        });
      }
    }

    // 5) Guarda log
    const logPayload = matches.map(m => ({ user_id: m.user_id, car_id }));
    await fetch(`${SB_URL}/rest/v1/notify_log`, {
      method:"POST",
      headers:{ apikey: SB_SRV, Authorization:`Bearer ${SB_SRV}`, "Content-Type":"application/json", Prefer:"resolution=merge-duplicates" },
      body: JSON.stringify(logPayload)
    });

    return res.status(200).json({ ok:true, sent: toList.length });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error:"internal_error" });
  }
}
