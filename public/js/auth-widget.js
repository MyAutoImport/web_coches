// /public/js/auth-widget.js  (JS PURO, sin <script>)
// Pinta login/usuario en #user-nav (desktop) y #user-nav-mobile (móvil) usando Supabase Auth.
// Además, inyecta items en .drawer-nav para que siempre se vea en el menú.
// Requiere que /api/public-config.js defina window.__APP_CONFIG__.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

(function () {
  const log = (...a) => console.debug("[auth-widget]", ...a);

  // Espera DOM listo
  const domReady =
    document.readyState === "loading"
      ? new Promise((res) =>
          document.addEventListener("DOMContentLoaded", res, { once: true })
        )
      : Promise.resolve();

  // CSS mínimo inline (por si falta en main.css)
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
      .user-nav .btn[disabled]{opacity:.6;cursor:wait}

      /* --- Bloque móvil (drawer) --- */
      .drawer-user{ margin-top:8px; padding:8px; border-top:1px solid var(--nav-border,rgba(255,255,255,.06)) }
      .drawer-user .login-btn{ width:100%; text-align:center; padding:12px 14px; border-radius:12px; font-weight:700; background:var(--primary,#6366F1); color:#fff; border:0 }
      .drawer-user .row{ display:flex; align-items:center; justify-content:space-between; gap:10px }
      .drawer-user .row .left{ display:flex; align-items:center; gap:10px }
      .drawer-user .row img{ width:34px; height:34px; border-radius:999px; border:1px solid var(--nav-border,rgba(255,255,255,.06)); background:#0B1220 }
      .drawer-user .links{ display:flex; gap:8px; margin-top:10px }
      .drawer-user .links a, .drawer-user .links button{
        flex:1; padding:10px 12px; border-radius:12px; font-weight:700;
        background:#0B1220; color:#fff; border:1px solid var(--nav-border,rgba(255,255,255,.06));
      }
      .drawer-user .links button[disabled]{opacity:.6;cursor:wait}
    `;
    document.head.appendChild(style);
  }

  // Placeholder por defecto (desktop)
  function paintLogin(el) {
    if (!el) return;
    el.innerHTML = `<a class="btn" href="/login.html">Login</a>`;
  }
  // Placeholder por defecto (móvil)
  function paintLoginMobile(el) {
    if (!el) return;
    el.innerHTML = `<button class="login-btn" type="button" onclick="location.href='/login.html'">Login</button>`;
  }

  async function init() {
    await domReady;

    const elDesktop = document.querySelector("#user-nav");          // barra (desktop)
    const elMobile  = document.querySelector("#user-nav-mobile");   // drawer (móvil)
    const drawerNav = document.querySelector(".drawer-nav");        // lista del menú móvil

    if (!elDesktop && !elMobile && !drawerNav) { log("no existe #user-nav / #user-nav-mobile / .drawer-nav"); return; }
    ensureCSS();

    // Placeholders inmediatos
    if (elDesktop) paintLogin(elDesktop);
    if (elMobile)  paintLoginMobile(elMobile);

    // Espera la config pública (evita condiciones de carrera)
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

    // Recarga dura con cache-busting (evita bfcache)
    const hardReload = () => {
      const url = new URL(location.href);
      url.searchParams.set("_", Date.now().toString());
      location.replace(url.toString());
    };

    // Helper: limpia items inyectados en el menú móvil para no duplicar
    const cleanupDrawerInjected = () => {
      if (!drawerNav) return;
      drawerNav.querySelectorAll('[data-auth-injected="1"]').forEach(n => n.remove());
    };

    async function render() {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;

        const user = data?.user;

        // ===== LOGOUT/NO USER =====
        if (!user) {
          if (elDesktop) paintLogin(elDesktop);
          if (elMobile)  paintLoginMobile(elMobile);

          // Menú móvil: mostrar item "Login" como enlace normal
          cleanupDrawerInjected();
          if (drawerNav) {
            const loginItem = document.createElement("a");
            loginItem.href = "/login.html";
            loginItem.className = "drawer-link";
            loginItem.textContent = "Login";
            loginItem.setAttribute("data-auth-injected", "1");
            // lo colocamos ANTES del botón "Contacto" si existe,
            // si no, lo añadimos al final
            const contactBtn = [...drawerNav.children].find(el => el.textContent?.trim().toLowerCase() === "contacto");
            if (contactBtn?.parentNode) {
              drawerNav.insertBefore(loginItem, contactBtn);
            } else {
              drawerNav.appendChild(loginItem);
            }
          }
          return;
        }

        // ===== USER LOGGED =====
        const name = user.user_metadata?.name || (user.email || "").split("@")[0] || "Cuenta";
        const avatar = user.user_metadata?.avatar_url || "";

        // Desktop
        if (elDesktop) {
          elDesktop.innerHTML = `
            ${avatar ? `<img class="avatar" src="${avatar}" alt="avatar" referrerpolicy="no-referrer">` : ``}
            <a class="link" href="/mi-cuenta.html" aria-label="Preferencias"><span class="name">${name}</span></a>
            <span class="sep">·</span>
            <button id="logout-btn" class="btn" type="button">Salir</button>
          `;

          // Logout (desktop)
          elDesktop.querySelector("#logout-btn")?.addEventListener("click", async (e) => {
            e.preventDefault();
            const btn = e.currentTarget;
            btn.disabled = true;
            btn.textContent = "Saliendo…";
            const fallbackTimer = setTimeout(hardReload, 1500);
            const { data: sub } = supabase.auth.onAuthStateChange((event) => {
              if (event === "SIGNED_OUT") hardReload();
            });
            try {
              await supabase.auth.signOut({ scope: "local" }).catch(() => {});
              await supabase.auth.signOut({ scope: "global" }).catch(() => {});
            } finally {
              setTimeout(() => sub.subscription?.unsubscribe?.(), 0);
              void fallbackTimer;
            }
          });
        }

        // Bloque móvil (drawer)
        if (elMobile) {
          elMobile.innerHTML = `
            <div class="row">
              <div class="left">
                ${avatar ? `<img src="${avatar}" alt="avatar" referrerpolicy="no-referrer">` : `<img src="/img/icon-192.png" alt="avatar">`}
                <b>${name}</b>
              </div>
            </div>
            <div class="links">
              <a href="/mi-cuenta.html">Preferencias</a>
              <button id="logout-btn-mobile" type="button">Salir</button>
            </div>
          `;

          // Logout (móvil bloque)
          elMobile.querySelector("#logout-btn-mobile")?.addEventListener("click", async (e) => {
            e.preventDefault();
            const btn = e.currentTarget;
            btn.disabled = true;
            btn.textContent = "Saliendo…";
            const fallbackTimer = setTimeout(hardReload, 1500);
            const { data: sub } = supabase.auth.onAuthStateChange((event) => {
              if (event === "SIGNED_OUT") hardReload();
            });
            try {
              await supabase.auth.signOut({ scope: "local" }).catch(() => {});
              await supabase.auth.signOut({ scope: "global" }).catch(() => {});
            } finally {
              setTimeout(() => sub.subscription?.unsubscribe?.(), 0);
              void fallbackTimer;
            }
          });
        }

        // Menú móvil: también mostramos accesos dentro de la lista
        cleanupDrawerInjected();
        if (drawerNav) {
          const prefsItem = document.createElement("a");
          prefsItem.href = "/mi-cuenta.html";
          prefsItem.className = "drawer-link";
          prefsItem.textContent = "Preferencias";
          prefsItem.setAttribute("data-auth-injected", "1");

          const logoutItem = document.createElement("button");
          logoutItem.type = "button";
          logoutItem.className = "drawer-link";
          logoutItem.textContent = "Salir";
          logoutItem.setAttribute("data-auth-injected", "1");

          // Inserta ambos antes de "Contacto" si existe; si no, al final
          const contactBtn = [...drawerNav.children].find(el => el.textContent?.trim().toLowerCase() === "contacto");
          if (contactBtn?.parentNode) {
            drawerNav.insertBefore(prefsItem, contactBtn);
            drawerNav.insertBefore(logoutItem, contactBtn);
          } else {
            drawerNav.appendChild(prefsItem);
            drawerNav.appendChild(logoutItem);
          }

          // Logout (inline en la lista)
          logoutItem.addEventListener("click", async (e) => {
            e.preventDefault();
            logoutItem.disabled = true;
            logoutItem.textContent = "Saliendo…";
            const fallbackTimer = setTimeout(hardReload, 1500);
            const { data: sub } = supabase.auth.onAuthStateChange((event) => {
              if (event === "SIGNED_OUT") hardReload();
            });
            try {
              await supabase.auth.signOut({ scope: "local" }).catch(() => {});
              await supabase.auth.signOut({ scope: "global" }).catch(() => {});
            } finally {
              setTimeout(() => sub.subscription?.unsubscribe?.(), 0);
              void fallbackTimer;
            }
          });
        }
      } catch (e) {
        log("render error:", e);
        if (elDesktop) paintLogin(elDesktop);
        if (elMobile)  paintLoginMobile(elMobile);
        cleanupDrawerInjected();
        if (drawerNav) {
          const loginItem = document.createElement("a");
          loginItem.href = "/login.html";
          loginItem.className = "drawer-link";
          loginItem.textContent = "Login";
          loginItem.setAttribute("data-auth-injected", "1");
          drawerNav.appendChild(loginItem);
        }
      }
    }

    // Primer render + dos reintentos por si la sesión tarda en hidratar
    await render();
    setTimeout(render, 250);
    setTimeout(render, 1000);

    // Re-render al cambiar el estado
    supabase.auth.onAuthStateChange(() => render());
  }

  init();
})();
