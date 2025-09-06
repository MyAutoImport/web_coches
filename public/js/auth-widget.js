<script type="module">
// auth-widget.js
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cfg = window.__APP_CONFIG__ || {};
const supabase = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

const $ = (s, r=document) => r.querySelector(s);

function initialsFromEmail(email=""){ const n=(email.split("@")[0]||"")[0]||"U"; return n.toUpperCase(); }

function renderDesktop(session){
  const host = $(".nav-desktop");
  if(!host) return;
  let box = $("#user-nav");
  if(!box){ box = document.createElement("div"); box.id="user-nav"; box.className="user-nav"; host.appendChild(box); }

  box.innerHTML = session ? `
    <button class="avatar-btn" id="avatar-btn" aria-haspopup="menu" aria-expanded="false" title="${session.user.email}">
      ${initialsFromEmail(session.user.email)}
    </button>
    <div class="user-menu" id="user-menu" role="menu">
      <a href="/mi-cuenta.html" role="menuitem">Preferencias</a>
      <button id="logout" role="menuitem">Cerrar sesión</button>
    </div>
  ` : `
    <a class="login-btn" href="/cliente-login.html">Acceder</a>
  `;

  if(session){
    const btn = $("#avatar-btn");
    const menu = $("#user-menu");
    const toggle = () => {
      const open = !menu.classList.contains("open");
      menu.classList.toggle("open", open);
      btn.setAttribute("aria-expanded", String(open));
    };
    btn?.addEventListener("click", (e)=>{ e.stopPropagation(); toggle(); });
    document.addEventListener("click", (e)=>{
      if(!menu) return;
      if(!menu.contains(e.target) && e.target !== btn){ menu.classList.remove("open"); btn.setAttribute("aria-expanded","false"); }
    });
    $("#logout")?.addEventListener("click", async ()=>{
      await supabase.auth.signOut();
      location.reload();
    });
  }
}

function renderMobile(session){
  const drawer = $("#mobile-drawer .drawer-inner");
  if(!drawer) return;
  let box = $("#drawer-user");
  if(!box){
    box = document.createElement("div");
    box.id = "drawer-user";
    box.className = "drawer-user";
    drawer.appendChild(box);
  }
  box.innerHTML = session ? `
    <div class="row">
      <div class="avatar-btn" title="${session.user.email}">${initialsFromEmail(session.user.email)}</div>
      <span style="color:var(--muted);font-size:.9rem">${session.user.email}</span>
    </div>
    <div class="links">
      <a href="/mi-cuenta.html">Preferencias</a>
      <button id="m-logout">Cerrar sesión</button>
    </div>
  ` : `
    <a class="login-btn" href="/cliente-login.html">Acceder</a>
  `;
  if(session){
    $("#m-logout")?.addEventListener("click", async ()=>{
      await supabase.auth.signOut();
      location.href = "/";
    });
  }
}

async function init(){
  // Sesión actual
  const { data:{ session } } = await supabase.auth.getSession();
  renderDesktop(session);
  renderMobile(session);

  // Reaccionar a cambios
  supabase.auth.onAuthStateChange((_evt, s)=>{
    renderDesktop(s);
    renderMobile(s);
  });
}
init();
</script>
