// api/notify-lead.js
// Serverless para guardar lead (Supabase con Service Role) + email (Resend).
// Si el email falla, igualmente devolvemos 200 si el insert fue OK.

const rateLimitStore = new Map();

function log(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  console.log(JSON.stringify({ timestamp, level: level.toUpperCase(), message, ...data }));
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function validateInput(d) {
  const errors = [];
  const nombre = (d.nombre || '').toString().trim();
  const email  = (d.email  || '').toString().trim().toLowerCase();
  const telefono = (d.telefono || '').toString().trim() || null;
  const mensaje  = (d.mensaje  || '').toString().trim();

  if (nombre.length < 2 || nombre.length > 100) errors.push('nombre');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) errors.push('email');
  if (telefono && !/^[0-9 +()\-]{7,15}$/.test(telefono.replace(/\s+/g,''))) errors.push('telefono');
  if (mensaje.length < 10 || mensaje.length > 2000) errors.push('mensaje');

  return { errors, clean: { nombre, email, telefono, mensaje } };
}

function readJSON(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    const max = 10 * 1024; // 10KB
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > max) return reject(new Error('payload_too_large'));
      data += chunk;
    });
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); }
      catch { reject(new Error('invalid_json')); }
    });
    req.on('error', reject);
  });
}

function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const maxRequests = 8;
  const arr = rateLimitStore.get(ip) || [];
  const fresh = arr.filter(t => now - t < windowMs);
  if (fresh.length >= maxRequests) return false;
  fresh.push(now);
  rateLimitStore.set(ip, fresh);
  return true;
}

export default async function handler(req, res) {
  const start = Date.now();
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'method_not_allowed' });
    }

    const ip =
      req.headers['x-forwarded-for']?.split(',')[0] ||
      req.headers['x-real-ip'] ||
      req.connection?.remoteAddress ||
      'unknown';

    if (!checkRateLimit(ip)) {
      log('warn', 'rate_limit', { ip });
      return res.status(429).json({ error: 'rate_limited' });
    }

    const body = await readJSON(req);
    const { errors, clean } = validateInput(body);
    if (errors.length) {
      log('warn', 'validation_failed', { fields: errors });
      return res.status(400).json({ error: 'invalid_fields', fields: errors });
    }

    // Campos adicionales opcionales del front
    const coche_interes = (body.coche_interes || '').toString().trim() || null;
    const car_id        = (body.car_id || '').toString().trim() || null;
    const page_url      = (body.page_url || '').toString().slice(0, 500);
    const user_agent    = (body.user_agent || '').toString().slice(0, 500);

    // === Insert en Supabase vía REST con Service Role ===
    const SB_URL  = process.env.SUPABASE_URL;
    const SB_SRK  = process.env.SUPABASE_SERVICE_ROLE; // Service Role Key
    if (!SB_URL || !SB_SRK) {
      log('error', 'missing_supabase_env');
      return res.status(500).json({ error: 'server_misconfigured' });
    }

    const insertPayload = [{
      nombre: clean.nombre,
      email: clean.email,
      telefono: clean.telefono,
      mensaje: clean.mensaje,
      coche_interes,
      car_id,
      page_url,
      user_agent,
      estado: 'nuevo'
    }];

    const sbRes = await fetch(`${SB_URL}/rest/v1/leads`, {
      method: 'POST',
      headers: {
        'apikey': SB_SRK,
        'Authorization': `Bearer ${SB_SRK}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(insertPayload)
    });

    let sbJson = null;
    try { sbJson = await sbRes.json(); } catch {}

    if (!sbRes.ok) {
      log('error', 'supabase_insert_failed', { status: sbRes.status, body: sbJson });
      return res.status(500).json({ error: 'db_insert_failed' });
    }

    const leadId = Array.isArray(sbJson) && sbJson[0]?.id ? sbJson[0].id : null;

    // === Email con Resend (opcional; no bloquea la respuesta) ===
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const TO   = process.env.LEADS_TO_EMAIL;
    const FROM = process.env.LEADS_FROM_EMAIL || 'Leads <onboarding@resend.dev>';

    if (RESEND_API_KEY && TO) {
      try {
        const html = `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
            <h2 style="color:#111">🚗 Nuevo lead</h2>
            <p><b>Nombre:</b> ${escapeHtml(clean.nombre)}</p>
            <p><b>Email:</b> ${escapeHtml(clean.email)}</p>
            ${clean.telefono ? `<p><b>Teléfono:</b> ${escapeHtml(clean.telefono)}</p>` : ''}
            ${coche_interes ? `<p><b>Coche:</b> ${escapeHtml(coche_interes)}</p>` : ''}
            ${car_id ? `<p><b>ID:</b> ${escapeHtml(car_id)}</p>` : ''}
            <p><b>Mensaje:</b></p>
            <div style="white-space:pre-wrap;border-left:4px solid #6366F1;padding-left:12px">
              ${escapeHtml(clean.mensaje)}
            </div>
            <hr style="border:none;border-top:1px solid #eee;margin:16px 0" />
            <p style="color:#666;font-size:.9rem">
              ${escapeHtml(page_url)}<br/>
              ${escapeHtml(user_agent)}
            </p>
          </div>
        `;

        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: FROM,
            to: [TO],
            subject: `🚗 Lead: ${clean.nombre}${coche_interes ? ` — ${coche_interes}` : ''}`,
            html
          })
        });

        const rJson = await r.json().catch(() => ({}));
        if (!r.ok) {
          // No rompemos la petición si falla el email
          log('warn', 'resend_failed', { status: r.status, body: rJson });
        }
      } catch (e) {
        log('warn', 'resend_exception', { error: e?.message });
      }
    } else {
      log('info', 'resend_skipped');
    }

    log('info', 'lead_ok', { duration: `${Date.now() - start}ms`, leadId });
    return res.status(200).json({ ok: true, id: leadId });

  } catch (e) {
    log('error', 'handler_exception', { error: e?.message, duration: `${Date.now() - start}ms` });
    return res.status(500).json({ error: 'internal_error' });
  }
}
