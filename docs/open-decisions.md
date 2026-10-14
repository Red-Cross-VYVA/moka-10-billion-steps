# Open decisions

The DMC Functional Specification was not available in the workspace or linked empty repository on 13 October 2026. The following are configurable UI defaults, not approved business rules.

1. Regional distribution, city coverage, and category mix use deterministic demo values. Driver workload is derived from current site records; no maximum workload is enforced until DMC supplies an approved limit.
2. Assignment eligibility currently requires an active, available driver in the same region. Under Review, Verified, and Closed / Cancelled sites cannot be assigned or reassigned.
3. Review decisions map to Verified, Revisit Required, or Flagged/Exception. Exact DMC approval roles and SLAs remain open.
4. Phase 1 mock data uses simulated proximity measurements. Authenticated evidence assessment uses an organization-configurable 100 metre default; this remains a triage setting rather than an approved automatic rejection rule.
5. Reports expose the dashboard's current data shape; the exact DMC Excel template is represented by a labeled placeholder.
6. “Resolve” closes an exception record but does not silently change a verified site.
7. Map tiles default to OpenFreeMap’s public style and can be changed by environment configuration.
8. Local browser persistence currently stores the deterministic demo dataset plus simulated mutations; production data retention and audit immutability remain open.
9. Arabic support in Phase 1 includes translated core navigation, site-list controls, status terminology, dates, and RTL layout behavior. Remaining feature-level copy and approved DMC terminology require review by a native Arabic product stakeholder.
10. Site imports support standards-compliant CSV files in the browser. Native `.xlsx` parsing is not included; adding it requires agreement on accepted worksheets, cell formats, and validation rules.
11. Preview access must remain private. Authentication, user roles, and production hosting are intentionally outside Phase 1; the preferred review path is a provider-protected preview or local execution.

## Phase 2 decisions approved on 13 October 2026

- Supabase Auth is invite-only with provisional `admin`, `operator`, `reviewer`, and `driver` organization roles.
- Evidence uses a private bucket with JPEG, PNG, and WebP objects up to 10 MiB. Client overwrite and deletion are disabled pending a retention policy.
- PostGIS is enabled for site coordinates and future proximity queries.
- Status, attempt, and exception lifecycles remain separate. The Phase 1 transition matrix is enforced in PostgreSQL.
- Phase 1 mock mode remains available until an initial administrator is provisioned and authenticated mode is explicitly enabled.

## Sites Activation workflow decision approved on 14 October 2026

- QR scanning is removed from the Sites Activation Driver PWA. Field submission requires GPS capture plus an installation photo and a close-up photo before Operations review.
- The existing `qr_mismatch` exception enum value remains in PostgreSQL for migration and historical-record compatibility, but it is no longer offered as an active Sites Activation workflow control. QR checkpoint scanning remains reserved for the future Scavenger Hunt module.
- Photo stamps show a server-referenced capture time formatted in Saudi Arabia time (`Asia/Riyadh`, UTC+3), the site code and captured GPS coordinates. The unmodified original and stamped derivative are stored privately under a shared evidence UID. Existing `evidence_files.created_at` and Storage object creation timestamps are the authoritative server upload record; the visible capture stamp is supporting field metadata, not cryptographic proof of shutter time.
- The prepared AI-triage migration adds structured capture metadata to new `evidence_files` rows so server-side rules can compare the capture record with the attempt and server upload time. Existing private Storage metadata remains intact and legacy rows remain valid. The visible capture stamp is still supporting metadata, not cryptographic proof.

## AI-assisted evidence triage defaults approved for implementation on 14 October 2026

- Assessments are advisory. They never approve, reject, create exceptions, or change site and attempt status.
- Automatic assessment uses deterministic server rules plus an OpenAI image-capable model selected by secret configuration.
- The rollout begins in shadow mode. Explicit filtering is available, but default queue order remains unchanged.
- GPS defaults to 100 metres; capture/upload delays over 30 minutes and future-time anomalies are warnings requiring human review.
- Visual pass confidence defaults to 0.85 and high-confidence issue detection to 0.90. These values are configurable by an organization administrator.
- Temporary analysis images are bounded to a 1600-pixel long edge, remain in memory, are submitted with provider storage disabled, and are not saved as additional evidence.
- Detailed assessment findings are visible only to administrator, operator, and reviewer roles. Drivers receive only human review outcomes and revisit instructions.
- The migration and RLS policies were explicitly approved and applied to Supabase project `cpyumnhbpbsdefjiqvtl` on 15 October 2026. The hosted worker remains in shadow mode; activating risk ordering or any automated decision path still requires separate approval.
