# Moka Digiteck — 10 Billion Steps

Authenticated demonstration foundation for the 10,000 Sites Activation ecosystem.

## Workspace

- `apps/operations` — implemented Operations Dashboard (Next.js App Router)
- `apps/driver-pwa` — mobile-first Driver PWA for the end-to-end activation demo
- `apps/scavenger-hunt` — reserved for the separate future platform
- `packages/domain` — future shared package boundary
- `supabase` — Phase 2 schema, RLS, private evidence storage, and local Supabase configuration

## Run locally

```bash
npm install
npm run dev
```

The Operations Dashboard runs at `http://localhost:3000`. Start the Driver PWA separately with `npm run dev:driver`; it runs at `http://localhost:3001`. Useful checks:

```bash
npm run typecheck
npm test
npm run build:all
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

Phase 1 did not include application authentication. Until Phase 2 authentication enforcement is enabled, use localhost or a hosting-provider preview protected by account access. Do not publish an unprotected public preview containing stakeholder material.

Payments, messaging delivery, AI vision, production cloud deployment, and the Scavenger Hunt remain out of scope. The authenticated Operations and Driver workflows are a demonstration, not a production-ready system.

The Driver PWA includes install metadata, GPS validation, two-photo evidence capture, and English/Arabic layouts. Localhost may expose a clearly labelled fictional GPS fallback for development; hosted builds do not expose it. See `docs/staging-mobile-checklist.md` for the physical-device test procedure.

Phase 2 Supabase infrastructure is documented in `docs/phase2-supabase.md`. Authentication enforcement and the production data switch remain opt-in until the initial administrator is provisioned.
