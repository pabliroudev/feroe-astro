# FEROE (Astro)

Plantilla inicial para la web **FEROE** (estructura base + estilos + páginas).

## Requisitos
- Node.js 18+ (recomendado 20+)
- npm / pnpm / yarn

## Arranque
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
npm run preview
```

## Contenidos
- Páginas: `src/pages/*`
- Noticias (Markdown): `src/content/noticias/*.md`
- Layout y componentes: `src/layouts`, `src/components`
- Estilos globales: `src/styles/global.css`
- Logo/Favicon: `public/logo.png`, `public/favicon.png`

## Personalización rápida
- Ajusta la paleta en `:root` dentro de `src/styles/global.css`
- Cambia enlaces del menú en `src/components/Header.astro`
- Completa textos y formularios en las páginas (los formularios están sin backend)

## Siguientes mejoras (si queréis)
- Buscador y filtrado en Programa y Noticias
- Páginas por evento (agenda) con inscripción
- Integración de CMS (Decap/Netlify CMS, Sanity, Strapi, etc.)
- Sitemap, RSS, analytics, cookies/consent, i18n
