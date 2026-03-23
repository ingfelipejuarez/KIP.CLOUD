# KIP v6 — Fixes aplicados (CSS Audit)

Todos los cambios fueron realizados sobre los **archivos fuente** y el bundle fue regenerado.

---

## 🔴 Críticos

### FIX-01 — `@import` ordering en `main.css`
**Archivo:** `assets/css/main.css`  
La regla `[hidden] { display: none !important; }` estaba declarada antes de los `@import`, lo que hace que el navegador ignore todos los imports (spec CSS). Movida debajo de todos los `@import`.

### FIX-02 — Mobile nav drawer real
**Archivos:** `assets/css/components/navbar.css`, `app/*/index.html`  
El botón hamburger no tenía un drawer de navegación real — abría la paleta de comandos como workaround. Se añadió:
- CSS completo del drawer (`mobile-nav`, `mobile-nav__panel`, `mobile-nav__backdrop`)
- HTML del drawer inyectado en las 7 páginas de la app
- JS inline para abrir/cerrar con teclado (Escape), foco correcto y link activo automático

### FIX-03 — `metrics-grid` responsive en archivo fuente
**Archivo:** `assets/css/components/cards.css`  
Los media queries solo existían en el bundle compilado, no en el archivo fuente. Si se regeneraba el bundle, el responsive de las métricas desaparecía. Añadidos breakpoints en 900px y 640px directamente en `cards.css`.

---

## 🟡 Advertencias

### FIX-04 — `hc-more` invisible intercepta foco de teclado
**Archivo:** `assets/css/components/habits.css`  
`opacity: 0` no elimina el elemento del tab order. Añadido `visibility: hidden` en estado oculto y `visibility: visible` al mostrar, con transition coordinada.

### FIX-05 — Touch targets demasiado pequeños en móvil
**Archivo:** `assets/css/components/habits.css`  
`.hc-check` en `@media (max-width: 480px)` reducía a 28×28px. WCAG 2.5.5 exige mínimo 44×44px de área táctil. Fix con `::before` extendiendo el área sin cambiar el visual.

### FIX-06 — `dash-head__name` sin breakpoint intermedio
**Archivo:** `assets/css/components/dashboard.css`  
Salto brusco de 64px a 48px en 768px. Reemplazado con `clamp(var(--tx-3xl), 6vw, var(--tx-hero))` para escala fluida.

### FIX-07 — `!important` eliminado del hamburger-btn
**Archivo:** `assets/css/kip.bundle.css`  
Dos `!important` contrapuestos creaban guerra de especificidad. Eliminados — el orden de cascada gestiona la visibilidad correctamente.

### FIX-08 — `share-tooltip` overflow en móvil
**Archivo:** `assets/css/components/share-btn.css`  
Tooltip con `width: 190px` y `right: -8px` podía desbordarse. Reemplazado con `width: min(210px, calc(100vw - 32px))` y `translateX(-50%)` centrado.

---

## 🔵 UX / UI

### FIX-09 — `habits-stat-bar` distribución irregular con flex-wrap
**Archivo:** `assets/css/components/habits.css`  
Con `flex-wrap: wrap` las métricas se redistribuían de forma irregular. Convertido a `grid` con `auto-fit` y separadores por `border-right` en lugar de `gap`.

### FIX-10 — `habits-grid--full` idéntico a `habits-grid`
**Archivo:** `assets/css/components/habits.css`  
Código muerto. `--full` ahora usa `repeat(2, 1fr)` para ser semánticamente distinto.

---

## 🟢 Optimizaciones

### FIX-11 — Variables duplicadas en `:root`
**Archivo:** `assets/css/main.css`  
`--lh-tight` y `--ls-tight` definidas dos veces con valores distintos. Segunda declaración eliminada; comentario explicativo añadido.

### FIX-12 — Animation duplicada en `.habit-card`
**Archivo:** `assets/css/components/habits.css`  
`animation: cardReveal` declarada en dos bloques distintos. Consolidada en el bloque principal.

### FIX-13 — Contraste WCAG en tema `parchment`
**Archivo:** `assets/css/themes.css`  
`--tx-3: #7A6240` daba ratio ~3.1:1 (falla WCAG AA). Corregido a `#5C4A2A` (~4.8:1).

### FIX-14 — Bundle regenerado desde fuentes
**Archivo:** `assets/css/kip.bundle.css`  
El bundle fue regenerado concatenando los archivos fuente corregidos, garantizando sincronización entre fuentes y bundle.

---

**Total: 14 fixes aplicados en 10 archivos**

---

## 🔒 Fix CSP (post-audit)

### FIX-15 — Script inline del drawer violaba Content Security Policy
**Archivos:** `src/ui/components/composed/MobileNav.js` *(nuevo)*, `src/ui/pages/bootstrap.js`, `app/*/index.html`

El JS del drawer de navegación móvil fue inyectado como `<script>` inline, lo que viola la directiva `script-src 'self' 'sha256-...'` de la CSP definida en cada página.

**Solución:** El script inline fue eliminado de todos los HTML. La lógica se movió a un módulo ES externo `MobileNav.js` e importado en `bootstrap.js` (que ya es un módulo de confianza cargado con `<script type="module" src="...">`). La CSP permite `'self'` para scripts externos, por lo que no requiere ningún cambio en los meta CSP.

Además se añadió **trampa de foco** (focus trap) dentro del drawer para accesibilidad de teclado.

---

## Revisión profunda — Fixes P01–P10

### P01 — Doble handler en btn-mobile-nav *(CRÍTICO)*
**Archivo:** `src/ui/pages/bootstrap.js`
`bootstrap.js` tenía un listener propio en `btn-mobile-nav` que abría la paleta de comandos. Al añadir `MobileNav.js`, ambos listeners se ejecutaban simultáneamente: el drawer se abría Y la paleta aparecía. El handler de bootstrap fue eliminado; `MobileNav.js` es la única fuente de verdad para ese botón.

### P04 — `habits-stat-bar` responsive frágil con `auto-fit` *(ALTO)*
**Archivo:** `assets/css/components/habits.css`
El uso de `nth-child(even/odd)` para bordes requiere saber exactamente cuántas columnas tiene el grid, pero `auto-fit` lo hace variable. Fix: columnas explícitas `repeat(2, 1fr)` en breakpoints donde se usan nth-child, más regla para tablet (900px–641px).

### P05 — `.habit-card--pending` huérfana en CSS *(ALTO)*
**Archivo:** `assets/css/components/habits.css`
`habits.js` aplica `habit-card--pending` en cards no completados pero la clase no existía en el CSS. Añadida con comentario explicativo.

### P06 — Bundle regenerado con orden correcto *(ALTO)*
**Archivo:** `assets/css/kip.bundle.css`
El bundle anterior tenía `buttons.css` después de `navbar.css`, lo que hacía que `.btn { display:inline-flex }` ganara sobre `.hamburger-btn { display:none }`. Bundle regenerado con navbar antes de buttons, incluyendo todos los patches UI-09 a UI-25 del original y los responsive patches de 768px/520px.

### P08 — `hamburger-btn` invisible en desktop *(MEDIO-CRÍTICO)*
**Archivo:** `assets/css/components/navbar.css`
Sin `!important`, `.btn { display:inline-flex }` (cargado después) sobrescribía `.hamburger-btn { display:none }`. Restaurado `!important` con comentario técnico que explica por qué es necesario.

### P09 — Doble disparo de Escape en el drawer *(MEDIO)*
**Archivo:** `src/ui/pages/bootstrap.js`
El handler global de Escape cerraba cualquier `[role="dialog"]:not([hidden])`, incluyendo `#mobile-nav`. `MobileNav.js` también escuchaba Escape independientemente. Fix: el handler global de bootstrap excluye explícitamente `#mobile-nav`.

### P10 — `--lh-relax` con valor incorrecto por duplicado *(BAJO)*
**Archivo:** `assets/css/main.css`
La segunda definición `--lh-relax: 1.65` sobrescribía la primera `--lh-relax: 1.6` silenciosamente. Segunda definición eliminada.

---

**Total acumulado: 19 fixes en 17 archivos** (incluyendo 1 archivo nuevo: `MobileNav.js`)

---

## Revisión profunda sesión 3 — Bugs reportados

### BUG-A — backdrop invisible bloqueaba toda la UI *(CRÍTICO)*
**Archivos:** `assets/css/kip.bundle.css`, `assets/css/components/navbar.css`  
`.mobile-nav__backdrop` tenía `opacity:0` pero no `pointer-events:none`. El backdrop invisible cubría toda la página y capturaba todos los clicks — botones, modales, inputs. El drawer CSS usa `visibility:hidden` para ocultar el panel, pero el backdrop hijo no heredaba esa propiedad. Fix: `pointer-events:none` en estado cerrado, `pointer-events:auto` solo cuando `.mobile-nav.open`.

### BUG-B — data-theme="prism" inconsistente *(ALTO)*
**Archivos:** `app/*/index.html`  
Todos los HTMLs tenían `data-theme="prism"` pero `ThemeManager.cargarGuardado()` usa `"ember"` como fallback. Si `localStorage` estaba vacío, el ThemeManager sobreescribía a `"ember"` generando un flash. Cambiado el default de los HTMLs a `"ember"` para consistencia. También añadido `"prism"` al toolbar de atajos (`T`) que solo tenía ember/abyss/etc.

### BUG-C — Atajos de teclado no funcionaban en páginas sin dashboard *(ALTO)*
**Archivos:** `src/ui/pages/bootstrap.js`  
`KeyboardShortcutsComponent.init()` solo se llamaba desde `dashboard.js`. En `habits.js`, `activity.js`, etc., el botón FAB `?` no abría el panel de atajos. Movido a `bootstrap.js` para que funcione en todas las páginas.

### BUG-D — Bundle CSS con duplicados (550KB → 136KB) *(CRÍTICO)*
**Archivos:** `assets/css/kip.bundle.css`  
El bundle regenerado en la sesión anterior concatenaba los archivos fuente + los "responsive patches" del bundle original (que era el bundle completo) + los UI patches. Resultado: cada selector aparecía 4-7 veces. El bundle original de 133KB se expandió a 550KB con reglas en conflicto. Corregido usando el bundle original como base y aplicando solo patches quirúrgicos.

### BUG-E — mobile-nav no se reseteaba en bootstrap *(MEDIO)*
**Archivos:** `src/ui/pages/bootstrap.js`  
El reset defensivo de bootstrap cerraba todos los modales al arrancar pero no llamaba `.classList.remove('open')` en `#mobile-nav`. Añadido al bloque de reset.

---

**Total acumulado: 24 fixes en 18 archivos**
