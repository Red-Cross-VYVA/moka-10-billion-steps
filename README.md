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

The dashboard uses 10,000 deterministic fictional Saudi site fixtures. Changes are simulated in the browser and saved to local storage. The Phase 1 workflows include validated site creation, client-side CSV field mapping and row validation, regional assignment/reassignment, evidence decisions with preserved attempts, derived driver workloads, reconciled KPIs, and an Arabic RTL mode for core operations screens.

Set `NEXT_PUBLIC_MAP_STYLE_URL` to replace the default MapLibre-compatible tile style. Do not commit provider tokens or environment files; configure deployment values in the hosting provider instead.

## Demo data and imports

- All merchant and driver records are fictional and deterministic.
- Site CSV imports are parsed locally and never sent to a server.
- Required import fields are `id`, `merchant`, `region`, `city`, `category`, `lat`, and `lng`; `address` is optional.
- Accepted rows are added to local browser storage. Invalid and duplicate rows remain excluded with row-level feedback.
- Native Excel workbook parsing and the final DMC report template remain open decisions.

## Preview safety

This repository does not include application authentication. Use localhost or a hosting-provider preview protected by account access. Do not publish an unprotected public preview containing stakeholder material.

This phase intentionally excludes authentication, payments, messaging delivery, AI vision, production cloud deployment, the Driver PWA, and Scavenger Hunt implementation. It is a functional UI prototype, not a production-ready system.
