// public/js/auth-widget.js
// Pinta login/usuario en #user-nav usando Supabase Auth.
// Requiere que /api/public-config.js defina window.__APP_CONFIG__.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

(function () {
  const log = (...a) => console.debug("[auth-widget]", ...a);

  // Espera al DOM si hace falta
  const domReady = document.readyState === "loading"
    ? new Promise(res => document.addEventListener("DOMContentLoaded", res, { once: true }))
    : Promise.resolve();

  const ensureCSS = () => {
    if (document.getElementById("user-nav-inline-css")) return;
    const style = document.createElement("style");
    style.id = "user-nav-inline-css";
    style.textContent = `
      .user-nav{display:flex;align-items:center;gap:10px;margin-left:6px}
      .user-nav .btn{padding:8px 12px;border-radius:999px;font-weight:600;background:#0B1220;border:1px solid var(--border);color:#fff;white-space:nowrap}
      .user-nav .btn.primary{background:var(--primary);border-color:transparent;color:#fff}
      .user-nav .avatar{width:28px;height:28px;border-radius:999px;object-fit:cover;border:1px solid var(--border);background:#111}
      .user-nav .name{color:#E5E7EB;font-weight:600;font-size:.95rem}
      .user-nav .link{color:rgba(249,250,251,.82);font-weight:600;white-space:nowrap}
      .user-nav .sep{opacity:.5}
    `;
    document.head.appendChild(style);
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  async function init() {
    await domReady; // asegura que #user-nav exista

    const el = document.querySelector("#user-nav");
    if (!el) { log("no existe #user-nav en esta página"); return; }

    ensureCSS();

    // Espera a que esté la config pública
    let tries = 0;
    while (!window.__APP_CONFIG__ && tries < 20) { await sleep(50); tries++; }
    const cfg = window.__APP_CONFIG__ || {};
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
      log("falta config pública; muestro botón simple");
      el.innerHTML = `<a class="btn" href="/cliente-login.html">Login</a>`;
      return;
    }

    const supabase = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

    async function getUserEventually() {
      // Reintenta un poco para dar tiempo a hidratar la sesión tras volver del login
      for (let i = 0; i < 12; i++) {            // ~1.2s total
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) return session.user;
        await sleep(100);
      }
      // Último intento “lento” por si acaso
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) return user;
      } catch {}
      return null;
    }

    const render = async () => {
      try {
        const user = await getUserEventually();

        if (!user) {
          el.innerHTML = `<a class="btn" href="/cliente-login.html">Login</a>`;
          return;
        }

        const name =
          user.user_metadata?.name ||
          user.user_metadata?.full_name ||
          (user.email ? user.email.split("@")[0] : "Cuenta");

        const avatar = user.user_metadata?.avatar_url || "";

        el.innerHTML = `
          ${avatar ? `<img class="avatar" src="${avatar}" alt="avatar" referrerpolicy="no-referrer">` : ``}
          <a class="link" href="/mi-cuenta.html" aria-label="Preferencias"><span class="name">${name}</span></a>
          <span class="sep">·</span>
          <button id="logout-btn" class="btn">Salir</button>
        `;

        el.querySelector("#logout-btn")?.addEventListener("click", async () => {
          try { await supabase.auth.signOut(); location.reload(); }
          catch { alert("No se pudo cerrar la sesión."); }
        });
      } catch (e) {
        log("error render:", e);
        el.innerHTML = `<a class="btn" href="/cliente-login.html">Login</a>`;
      }
    };

    // Si el estado cambia en esta misma pestaña (login/logout), repinta
    supabase.auth.onAuthStateChange(() => render());

    render();
  }

  init();
})();
