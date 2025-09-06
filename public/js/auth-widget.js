// public/js/auth-widget.js
// Pinta login/usuario en #user-nav usando Supabase Auth.
// Requiere que /api/public-config.js defina window.__APP_CONFIG__.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

(function () {
  const log = (...a) => console.debug("[auth-widget]", ...a);

  // 1) Espera DOM listo
  const domReady = document.readyState === "loading"
    ? new Promise(res => document.addEventListener("DOMContentLoaded", res, { once: true }))
    : Promise.resolve();

  // 2) CSS mínimo inline (por si falta en main.css)
  function ensureCSS() {
    if (document.getElementById("user-nav-inline-css")) return;
    const style = document.createElement("style");
    style.id = "user-nav-inline-css";
    style.textContent = `
      .user-nav{display:flex;align-items:center;gap:10px;margin-left:6px}
      .user-nav .btn{padding:8px 12px;border-radius:999px;font-weight:600;background:#0B1220;border:1px solid var(--border,#374151);color:#fff;white-space:nowrap}
      .user-nav .btn.primary{background:var(--primary,#6366F1);border-color:transparent;color:#fff}
      .user-nav .avatar{width:28px;height:28px;border-radius:999px;object-fit:cover;border:1px solid var(--border,#374151);background:#111}
      .user-nav .name{color:#E5E7EB;font-weight:600;font-size:.95rem}
      .user-nav .link{color:rgba(249,250,251,.9);font-weight:600;white-space:nowrap}
      .user-nav .sep{opacity:.5}
    `;
    document.head.appendChild(style);
  }

  // 3) Siempre deja un placeholder visible inmediatamente
  function paintLogin(el) {
    el.innerHTML = `<a class="btn" href="/cliente-login.html">Login</a>`;
  }

  async function init() {
    await domReady;

    const el = document.querySelector("#user-nav");
    if (!el) { log("no existe #user-nav"); return; }
    ensureCSS();
    paintLogin(el); // placeholder inmediato

    // 4) Espera la config pública con reintentos
    let tries = 0;
    while (!window.__APP_CONFIG__ && tries < 40) { // ~2s
      await new Promise(r => setTimeout(r, 50));
      tries++;
    }
    const cfg = window.__APP_CONFIG__ || {};
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
      log("falta SUPABASE_URL/ANON_KEY; dejo botón Login");
      return;
    }

    const supabase = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

    async function render() {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;

        const user = data?.user;
        if (!user) { paintLogin(el); return; }

        const name = user.user_metadata?.name || (user.email || "").split("@")[0] || "Cuenta";
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
        log("render error:", e);
        paintLogin(el);
      }
    }

    // 5) Primer render + reintentos suaves (por si tarda la sesión del storage)
    await render();
    // dos reintentos rápidos por si el storage tarda en hidratar
    setTimeout(render, 250);
    setTimeout(render, 1000);

    // 6) Re-render cuando cambie el estado
    supabase.auth.onAuthStateChange(() => render());
  }

  init();
})();
