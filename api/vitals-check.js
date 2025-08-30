// /api/vitals-check.js (Node 18+ en Vercel)
export default async function handler(req, res) {
  try {
    const SITE = process.env.SITE_ORIGIN || 'https://myautoimport.es';
    const PSI = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(SITE)}&category=PERFORMANCE&strategy=mobile&key=${process.env.PSI_API_KEY}`;

    const resp = await fetch(PSI);
    const data = await resp.json();

    const m = data.loadingExperience?.metrics || {};
    const lcp = m.LARGEST_CONTENTFUL_PAINT_MS?.percentile ?? null; // ms
    const inp = m.EXPERIMENTAL_INTERACTION_TO_NEXT_PAINT?.percentile ?? null; // ms
    const clsRaw = m.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile ?? null; // viene *100
    const cls = clsRaw == null ? null : clsRaw / 100;

    // Umbrales (ajústalos a tu gusto)
    const ALERTS = [];
    if (lcp != null && lcp > 2500) ALERTS.push(`LCP ${lcp} ms (>2500)`);
    if (inp != null && inp > 500) ALERTS.push(`INP ${inp} ms (>500)`);
    if (cls != null && cls > 0.25) ALERTS.push(`CLS ${cls} (>0.25)`);

    // Si hay alertas, enviamos email con Resend (o solo log si no configuras)
    if (ALERTS.length && process.env.RESEND_API_KEY && process.env.ALERT_TO) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: process.env.ALERT_FROM || 'alerts@myautoimport.es',
          to: [process.env.ALERT_TO],
          subject: `Web Vitals alertas — ${SITE}`,
          html: `
            <h2>Alertas de Core Web Vitals</h2>
            <p><b>Site:</b> ${SITE}</p>
            <ul>${ALERTS.map(a => `<li>${a}</li>`).join('')}</ul>
            <p><b>Valores actuales:</b><br/>
            LCP: ${lcp ?? 'N/A'} ms<br/>
            INP: ${inp ?? 'N/A'} ms<br/>
            CLS: ${cls ?? 'N/A'}</p>
          `
        })
      });
    }

    res.status(200).json({ ok: true, site: SITE, lcp, inp, cls, alerts: ALERTS });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}
