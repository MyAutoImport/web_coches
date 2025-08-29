# MyAutoImport — Launch Checklist (Producción)
> Ruta sugerida del archivo: `docs/launch-checklist.md`  
> Objetivo: tener una lista única y ejecutable para publicar **myautoimport.es** con garantías.

---

## 0) Preparación
- [ ] Crear rama `release` desde la rama estable.
- [ ] Confirmar que **Vercel → Settings → Environment Variables** contiene todo lo siguiente (Production y Preview si aplica):
  - [ ] `SUPABASE_URL`
  - [ ] `SUPABASE_SERVICE_ROLE`
  - [ ] `SUPABASE_ANON_KEY`
  - [ ] `RESEND_API_KEY`
  - [ ] `LEADS_TO_EMAIL`
  - [ ] `LEADS_FROM_EMAIL`
  - [ ] `SITE_ORIGIN` = `https://myautoimport.es`
  - [ ] `UPSTASH_REDIS_REST_URL`
  - [ ] `UPSTASH_REDIS_REST_TOKEN`

---

## 1) Bloqueo antes de publicar (críticos)
- [ ] **Eliminar strings hardcodeadas** en frontend:
  - [ ] Reemplazar cualquier `https://qsin...supabase.co` → `process.env.SUPABASE_URL` (o endpoint público `/api/public-env`).
  - [ ] Reemplazar cualquier `eyJhbGci...` (ANON) → `process.env.SUPABASE_ANON_KEY` (o `/api/public-env`).
  - [ ] Centralizar `myautoimport.es` con `process.env.SITE_ORIGIN` donde aplique.
- [ ] **CSP/headers** (`vercel.json`):
  - [ ] `img-src` incluye: `'self' https: data: blob:`, `https://*.supabase.co` y tu CDN si aplica.
  - [ ] `font-src` incluye Google Fonts si usas (`https://fonts.googleapis.com` `https://fonts.gstatic.com`).
  - [ ] `connect-src` incluye `https://*.supabase.co` y `'self'`.
  - [ ] Activar HSTS: `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`.
- [ ] **Formulario de leads**:
  - [ ] Endpoint con **Upstash Redis** (rate limit por IP + email) y validaciones.
  - [ ] Enmascarar logs sensibles en `console.log` (o desactivarlos en `NODE_ENV=production`).
  - [ ] (Opcional) Añadir **Turnstile/hCaptcha**.

---

## 2) Contenido y marca
- [ ] Sustituir “**Tu Empresa**” → **MyAutoImport** en títulos, metadatos, footer y textos.
- [ ] Actualizar **teléfono** (`tel:+34...`) y **WhatsApp** (`https://wa.me/34XXXXXXXXX`).
- [ ] Subir **imágenes reales** a Supabase Storage/carpeta pública; reemplazar `picsum.photos`.
- [ ] **Open Graph/SEO** reales:
  - [ ] `og:title`, `og:description`, `og:image` (1200×630), `twitter:card=summary_large_image`.
- [ ] **PWA**:
  - [ ] Favicon e iconos (192/512) con tu marca.
  - [ ] `theme_color` y `background_color` acordes al diseño.

---

## 3) Emailing (Resend)
- [ ] Verificar dominio y registros DNS (**SPF/DKIM**) en Resend.
- [ ] Usar remitente propio: `Leads <info@myautoimport.es>` y `Reply-To` al comercial.
- [ ] Plantilla de email: incluir **página de origen**, **UTM**, y **fecha/hora** (no incluir datos sensibles innecesarios).

---

## 4) Supabase — tablas, índices y RLS
- [ ] **leads** y **cars** creadas. Campos mínimos:
  - `leads(id, email, nombre, telefono, mensaje, source, created_at)`
  - `cars(id, marca, modelo, year, precio_objetivo, estado_publicacion, created_at, ...)`
- [ ] **Índices** recomendados (ejecutar en SQL Editor):
  ```sql
  create index if not exists cars_marca_idx on cars (marca);
  create index if not exists cars_modelo_idx on cars (modelo);
  create index if not exists cars_precio_idx on cars (precio_objetivo);
  create index if not exists cars_estado_idx on cars (estado_publicacion);
  ```
- [ ] **RLS activado** y políticas mínimas:
  ```sql
  -- Leads: permitir INSERT a rol 'anon' (sin SELECT)
  alter table leads enable row level security;
  create policy anon_insert_leads on leads for insert to anon with check (true);
  revoke select on table leads from anon;

  -- Cars: lectura pública solo de coches publicados
  alter table cars enable row level security;
  create policy public_read_cars on cars
    for select to anon
    using (estado_publicacion = 'publicado');
  ```
- [ ] **Backups automáticos** activos.

---

## 5) Rendimiento
- [ ] Imágenes optimizadas (WebP/JPEG), `loading="lazy"` en `<img>` y `decoding="async"`.
- [ ] Preload de fuentes críticas + `font-display: swap`.
- [ ] `rel="preconnect"` a `*.supabase.co` y `fonts.gstatic.com` si aplica.
- [ ] Pasar **Lighthouse** (PWA/SEO/Performance > 90).

---

## 6) Analítica y estabilidad
- [ ] Añadir **Plausible** o **GA4**.
- [ ] **Sentry** en frontend y APIs (`SENTRY_DSN` en Vercel).
- [ ] **UptimeRobot** monitorizando `https://myautoimport.es` y `/api/notify-lead`.

---

## 7) SEO técnico
- [ ] **Sitemap** dinámico accesible y enviado a **Google Search Console**.
- [ ] `robots.txt` correcto (permitir todo en producción, bloquear previews si usas otro dominio).
- [ ] Validar **JSON-LD** (Vehicle/Organization) con Rich Results Test.
- [ ] Canónicas absolutas:
  ```html
  <link rel="canonical" href="https://myautoimport.es{PATH}" />
  ```

---

## 8) Accesibilidad
- [ ] `alt` descriptivo en todas las imágenes.
- [ ] Estados `:focus` visibles en botones y enlaces.
- [ ] **Skip link** al contenido principal.
- [ ] Revisar contraste tras cambiar imágenes/colores.

---

## 9) Seguridad adicional
- [ ] **CAPTCHA** (Turnstile/hCaptcha) en leads si recibes spam.
- [ ] **Rate limit** compuesto por IP+email (Upstash).
- [ ] Verificación de `Origin`/`Referer` en la API para mitigar CSRF.

---

## 10) Entornos y despliegue
- [ ] Forzar dominio canónico (apex ⇄ www) con redirección 301 en Vercel.
- [ ] Variables separadas por entorno si haces previews.
- [ ] Páginas personalizadas **/404** y **/500**.
- [ ] Hacer `vercel --prod` (o Deploy Production desde panel) y etiquetar el release.

---

## 11) Legal y confianza
- [ ] **Política de Privacidad**, **Términos** y **Aviso de Cookies** (si usas analítica).
- [ ] Footer con **nombre legal**, **CIF/NIF**, y datos de contacto.

---

## 12) Roadmap corto (opcional)
- [ ] Panel interno protegido para ver leads (vía API con `service_role` en serverless).
- [ ] Importación CSV de `cars`.
- [ ] Mejoras de filtros/paginación avanzada.

---

## 13) Verificación final (paso a paso)
- [ ] Formularios: enviar lead de prueba → comprobar fila en Supabase + email recibido.
- [ ] Navegación móvil y escritorio: Drawer, galería, filtros, detalle de coche.
- [ ] PWA: instalar en móvil y abrir offline básico.
- [ ] SEO: `sitemap.xml`, `robots.txt`, Open Graph con imagen correcta.
- [ ] Monitoreo: Sentry captura un error forzado, UptimeRobot en verde.

---

**Estado:** _Marca cada casilla y haz merge de `release` a `main` cuando todo esté ✅._
