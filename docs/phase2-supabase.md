# Phase 2 Supabase foundation

The approved Supabase foundation is additive. Phase 1 mock workflows remain the default until `NEXT_PUBLIC_SUPABASE_AUTH_REQUIRED=true` and a production data switch is reviewed.

## Included

- Supabase browser/server clients using `@supabase/ssr`
- Invite-only password authentication routes and session middleware
- Organization-scoped schema for sites, drivers, assignments, attempts, evidence, reviews, exceptions, notifications, imports, and append-only audit events
- Database-enforced site transitions and audited assignment/review RPCs
- RLS policies for admin, operator, reviewer, and driver roles
- Private `site-evidence` bucket with JPEG/PNG/WebP and 10 MiB limits
- PostGIS point data and spatial index for future proximity queries

## Local environment

Copy `apps/operations/.env.example` to `apps/operations/.env.local` and populate the project URL and publishable key. Never commit `.env.local`. Keep the service-role value blank unless a reviewed server-only workflow needs it.

The checked-in local Supabase configuration and hosted project both disable public sign-up and require passwords of at least 12 characters with upper/lowercase letters and digits. Hosted email confirmation remains enabled.

## First administrator

1. Create or invite the user through Supabase Auth.
2. Insert an `organization_members` record for organization `00000000-0000-4000-8000-000000000001` with role `admin`.
3. Only then set `NEXT_PUBLIC_SUPABASE_AUTH_REQUIRED=true`.

The application deliberately keeps authentication enforcement disabled until this bootstrap is complete, preventing an accidental lockout of the current UI.

## Evidence paths

Objects use `organization-id/site-id/attempt-id/random-file-id.ext`. The bucket is private, has no public read policy, and has no client update or delete policy. Signed URLs must be generated only after an authenticated authorization check.

## Migration workflow

The source of truth is `supabase/migrations`. Use the CLI for future changes, generate types after schema changes, and never use `db reset --linked` against the hosted project.

The initial hosted migration was approved and applied through the Supabase SQL editor on 13 October 2026. Before a future `supabase db push`, link the project and mark migration `20261013150000` as applied with the Supabase CLI so migration history matches the checked-in source.

## Outstanding configuration

- Create the first administrator identity and membership.
- Confirm hosted Auth URL/redirect settings for the eventual preview domain.
- Approve an evidence retention/deletion process before enabling deletion.
- Supply the final DMC reporting template and functional specification when available.
