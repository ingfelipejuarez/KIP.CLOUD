# KIP v5.0 "Zenith" — Arquitectura Modular

Habit tracker PWA con IA personal. Versión refactorizada con arquitectura modular.

---

## ⚠️ Requisito: servidor local

**No abrir los HTML directamente desde el explorador de archivos** (`file://`).  
`LayoutLoader.js` usa `fetch()` para inyectar el navbar compartido, y los navegadores bloquean `fetch()` en `file://` por seguridad (CORS). Siempre servir desde `http://localhost`.

---

## Inicio rápido

### Opción A — `serve` (sin instalar nada globalmente)
```bash
cd kip/
npx serve . --listen 3000
# → http://localhost:3000/app/index.html
```

### Opción B — Python (viene con macOS/Linux)
```bash
cd kip/
python3 -m http.server 3000
# → http://localhost:3000/app/index.html
```

### Opción C — VS Code Live Server
1. Instalar la extensión **Live Server** (ritwickdey.LiveServer)
2. Click derecho sobre `app/index.html` → **"Open with Live Server"**

> Verificar que la URL sea `http://127.0.0.1:5500/app/index.html`, no `…/index.html` a secas.
> Si Live Server abre desde dentro de `app/`, configurar `"liveServer.settings.root": "/"` en `.vscode/settings.json`.

### Opción D — Vite (hot reload)
```bash
cd kip/
npx vite --port 3000
# → http://localhost:3000/app/index.html
```

---

## Flujo de arranque por página

Cada página HTML sigue esta secuencia exacta:

```
1. <head> inline script   → aplica tema guardado (evita FOUC)
2. <head> main.css        → carga todos los estilos vía @import
3. <body> layout-navbar   → placeholder <div> vacío
4. <body> <main>          → contenido único de la página
5. <body> layout-settings → placeholder
6. <body> layout-footer   → placeholder
7. <script> LayoutLoader.js
     → fetch() paralelo de navbar.html + settings-panel.html + footer.html
     → inyecta los tres fragmentos en sus placeholders
     → dispara: document.dispatchEvent('kip:layouts-loaded')
8. <script> app.bundle.js
     → escucha 'kip:layouts-loaded' → arranca KIPApp + kipBootstrap()
     → fallback: DOMContentLoaded + 600ms si LayoutLoader falla
```

**¿Por qué el evento `kip:layouts-loaded`?**
`app.bundle.js` necesita elementos como `#cmd-palette`, `#habit-modal`, `#btn-account` que viven en `navbar.html`. Si arrancara en `DOMContentLoaded`, esos elementos aún no existen (los `fetch()` son asíncronos). El evento garantiza que el DOM compartido está listo antes de inicializar.

---

## Estructura del proyecto

```
kip/
├── app/                       ← 6 páginas HTML (solo su <main> único)
├── src/
│   ├── core/                  ← interfaces, enums, errors, 6 modelos
│   ├── services/              ← ThemeManager, DataService, AIService, KIPStore…
│   ├── infrastructure/        ← ApiClient, 3 repositories
│   ├── controllers/           ← HabitController, DashboardController
│   └── ui/
│       ├── components/        ← 9 primitivos + 15 compuestos (54 módulos)
│       ├── layouts/           ← navbar.html · settings-panel.html · footer.html
│       │                         LayoutLoader.js
│       └── pages/             ← bootstrap.js · KIPApp.js
├── assets/css/                ← main.css + 26 archivos CSS por sección
├── app.bundle.js              ← bundle original sin cambios visuales
├── manifest.json              ← PWA (rutas en app/)
├── sw.js                      ← Service Worker (cache actualizado)
└── package.json
```

---

## Añadir una nueva página

1. Crear `app/nueva.html` — copiar estructura de `app/actividad.html`, cambiar solo el `<main>`
2. Agregar link en `src/ui/layouts/navbar.html` (dentro de `.navbar__navlist`)
3. Agregar entrada en el CMD palette dentro del mismo `navbar.html`
4. Agregar la URL en `STATIC_ASSETS` de `sw.js`

---

## CSS: modificar estilos

Cada sección tiene su propio archivo:

| Quiero cambiar…        | Editar…                                   |
|------------------------|-------------------------------------------|
| Variables / tokens     | `assets/css/tokens.css`                   |
| Un tema (colores)      | `assets/css/themes.css`                   |
| El navbar              | `assets/css/components/navbar.css`        |
| Tarjetas de hábitos    | `assets/css/components/habits.css`        |
| Modales                | `assets/css/components/modals.css`        |
| Panel de settings      | `assets/css/components/settings-panel.css`|
| Página de hábitos      | `assets/css/page.css` (sección habits)    |
| Breakpoints responsive | `assets/css/utilities.css`                |

---

## Service Worker en desarrollo

El SW puede cachear archivos viejos durante el desarrollo. Para limpiar:

```
DevTools → Application → Service Workers → Unregister
```

O activar **"Update on reload"** en esa misma pestaña.

---

## Despliegue en producción

Subir la carpeta `kip/` tal cual a Netlify, Vercel o GitHub Pages.  
No se necesita build step — es HTML + CSS + JS vanilla.

El SW solo funciona en **HTTPS** (excepto `localhost`). Todos los hostings modernos activan HTTPS automáticamente.
