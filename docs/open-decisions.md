# Open decisions

The DMC Functional Specification was not available in the workspace or linked empty repository on 13 October 2026. The following are configurable UI defaults, not approved business rules.

1. Regional distribution, city coverage, category mix, and workload limits use deterministic demo values.
2. Assignment eligibility currently requires an active, available driver in the same region; sites under review cannot be reassigned.
3. Review decisions map to Verified, Revisit Required, or Flagged/Exception. Exact DMC approval roles and SLAs remain open.
4. GPS proximity uses a demo threshold of 150 metres and simulated measurements.
5. Reports expose the dashboard's current data shape; the exact DMC Excel template is represented by a labeled placeholder.
6. “Resolve” closes an exception record but does not silently change a verified site.
7. Map tiles default to OpenFreeMap’s public style and can be changed by environment configuration.
8. Local browser persistence currently stores the deterministic demo dataset plus simulated mutations; production data retention and audit immutability remain open.
9. Arabic support in Phase 1 provides a live RTL layout switch and direction-safe shell architecture. Approved Arabic product copy and terminology require DMC review.
