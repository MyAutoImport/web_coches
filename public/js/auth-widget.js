// public/js/auth-widget.js
// Requiere que /api/public-config.js haya definido window.__APP_CONFIG__ con SUPABASE_URL y SUPABASE_ANON_KEY
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

(function () {
  const cfg = window.__APP_CONFIG__ || {};
  const supabase = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  const $  = s => document.querySelector(s);
  const el = $('#user-nav');        // <- placeholder en el header
  if (!el) return;

  // CSS utilitario para avatar/btn (por si falta en main.css)
  const ensureCSS = () => {
    if (document.getElementById('user-nav-inline-css')) return;
    const style = document.createElement('style');
    style.id = 'user-nav-inline-css';
    style.textContent = `
      .user-nav{display:flex;align-items:center;gap:10px;margin-left:6px}
      .user-nav .btn{padding:8px 12px;border-radius:999px;font-weight:600;background:#0B1220;border:1px solid var(--border);color:#fff}
      .user-nav .btn.primary{background:var(--primary);border-color:transparent;color:#fff}
      .user-nav .avatar{width:28px;height:28px;border-radius:999px;object-fit:cover;border:1px solid var(--border);background:#111}
      .user-nav .name{color:#E5E7EB;font-weight:600;font-size:.95rem}
      .user-nav .link{color:rgba(249,250,251,.82);font-weight:600}
      .user-nav .sep{opacity:.5}
    `;
    document.head.appendChild(style);
  };

  const render = async () => {
    ensureCSS();

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      el.innerHTML = `
        <a class="btn" href="/cliente-login.html">Login</a>
      `;
      return;
    }

    const name = user.user_metadata?.name || user.email?.split('@')[0] || 'Cuenta';
    const avatar = user.user_metadata?.avatar_url || '';

    el.innerHTML = `
      ${avatar ? `<img class="avatar" src="${avatar}" alt="avatar" referrerpolicy="no-referrer">` : ``}
      <a class="link" href="/mi-cuenta.html" aria-label="Preferencias"><span class="name">${name}</span></a>
      <span class="sep">·</span>
      <button id="logout-btn" class="btn">Salir</button>
    `;

    const btn = $('#logout-btn');
    btn?.addEventListener('click', async () => {
      try {
        await supabase.auth.signOut();
        location.reload();
      } catch {
        alert('No se pudo cerrar la sesión.');
      }
    });
  };

  // Re-render al cambiar el estado de auth
  supabase.auth.onAuthStateChange(() => render());

  // Primer pintado
  render();
})();
