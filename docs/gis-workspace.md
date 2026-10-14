# Operations GIS

`/map` has an independent data path. It never uses the older overview loader's
site limit or eagerly signs evidence for the whole network. Hosted mode never
falls back to demo fixtures. The existing 10,000 fictional sites remain available
only in the explicitly labeled local demo mode.

## Database and access

Apply `supabase/migrations/20261015010000_gis_workspace.sql` before deploying.
It adds a private primary-contact table, three RPCs, and supporting indexes.
Existing active admin/operator/reviewer memberships determine GIS visibility.
Drivers and anonymous users cannot access GIS profiles or contacts. Only active
organization admins may call the contact-write RPC. Direct contact writes are
not granted. Organization ownership comes from the site, and each successful
write records its actor and before/after values in `audit_events` atomically.
The existing driver audit policy excludes contact events to prevent contact
details leaking through audit history.

Summary loading uses UUID keyset pagination in pages of 500, ordered by site ID.
Only selecting a site loads its full profile and signs its private photos.
Original/stamped variants under the same capture folder count once; stamped is
preferred. Legacy evidence files each count once. Signed access lasts 15 minutes
and refreshes every 12 minutes while a profile remains open, or once on an image
load failure. Evidence storage remains private.

QR analytics are intentionally disconnected. Nullable metrics display
**Not connected** in the workspace, profiles, and CSV. No scan-event storage or
collection endpoint is introduced. Coordinates remain read-only.

## Browser behavior

The map survives filters and layer switches. Results are virtualized in 88px
rows. Site selection and filters are stored in the URL. Enabling Search this
area adds the viewport to the URL; disabling it restores whole-filter results.
CSV uses the same result set as the list and excludes private image paths/URLs
and contact data. Formula-like text cells are escaped.

MapLibre's module worker and shared module are copied from the installed package
to public assets by `predev`/`prebuild`. This avoids worker URL rewriting by
Turbopack. Public worker assets contain library code only. Tiles use the existing
OpenFreeMap style, or `NEXT_PUBLIC_MAP_STYLE_URL`. A map failure leaves the list,
profiles, and export available.

## Validation and release

- `npm run test -w @moka/operations`: includes 10,001-row boundary/10,000-row
  pagination, combined filters, bounds, photo grouping, signed-URL renewal,
  CSV consistency and spreadsheet formula escaping.
- `npm run typecheck -w @moka/operations` and `npm run build`.
- `supabase/tests/gis_workspace.sql`: transactional hosted checks for 10,000
  temporary sites, contact persistence/audit, direct-write rejection, role
  restrictions and cross-organization isolation. It expects the existing demo
  admin and driver identities. All fixtures, contact edits and membership changes
  roll back; never remove the final rollback statement.
- Browser checks: 10,000 demo sites, clusters, filters, layers, area counts,
  selection, URL restoration, CSV, keyboard navigation, Arabic/RTL, mobile
  map/list and full-screen profile, missing contacts and map error handling.
- Validate the Operations project's protected preview before assigning
  `ops.10billionsteps.site`. Keep generated Vercel URLs protected and the existing
  app login enabled. Do not reassign the Driver domain.

Rollback the Operations domain alias to its previous deployment if necessary.
Leave the additive contact table in place to preserve saved contact data.
