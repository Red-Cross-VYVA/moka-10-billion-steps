# Moka Digiteck — 10 Billion Steps

Phase 1 UI foundation for the 10,000 Sites Activation ecosystem.

## Workspace

- `apps/operations` — implemented Operations Dashboard (Next.js App Router)
- `apps/driver-pwa` — reserved for the future Driver PWA
- `apps/scavenger-hunt` — reserved for the separate future platform
- `packages/domain` — future shared package boundary

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Useful checks:

```bash
npm run typecheck
npm test
npm run build
```

The dashboard uses 10,000 deterministic fictional Saudi site fixtures. Changes are simulated in the browser and saved to local storage. Set `NEXT_PUBLIC_MAP_STYLE_URL` to replace the default MapLibre-compatible tile style.

This phase intentionally excludes authentication, payments, messaging delivery, AI vision, cloud deployment, the Driver PWA, and Scavenger Hunt implementation. It is a functional UI prototype, not a production-ready system.
