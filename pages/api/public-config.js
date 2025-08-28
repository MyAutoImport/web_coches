export const config = { runtime: 'edge' };
export default function handler() {
  const body = `
    window.__APP_CONFIG__ = {
      SUPABASE_URL: ${JSON.stringify(process.env.SUPABASE_URL || '')},
      SUPABASE_ANON_KEY: ${JSON.stringify(process.env.SUPABASE_ANON_KEY || '')},
      SITE_ORIGIN: ${JSON.stringify(process.env.SITE_ORIGIN || 'https://myautoimport.es')}
    };
  `;
  return new Response(body, {
    headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}
