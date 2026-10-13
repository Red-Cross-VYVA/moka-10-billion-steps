# Sites Activation demo runbook

## Local addresses

- Operations Dashboard: `http://localhost:3000`
- Driver PWA: `http://localhost:3001`

Run each application in its own terminal with `npm run dev:operations` and `npm run dev:driver`.

## Environment

Both applications need the same `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in their own ignored `.env.local` file. Set `NEXT_PUBLIC_SUPABASE_AUTH_REQUIRED=true` only in the development/demo environment after the first administrator has accepted the invitation and received organization membership.

## First administrator

1. In Supabase Authentication → Users, choose **Add user → Send invitation**.
2. Invite `karim.assad@mokadigital.net`.
3. After the Auth user exists, add it to organization `00000000-0000-4000-8000-000000000001` as role `admin`.
4. Accept the email invitation and set a password that meets the hosted policy.
5. Enable `NEXT_PUBLIC_SUPABASE_AUTH_REQUIRED=true` for the Operations development server and restart it.

The local invite flow detects Supabase's invitation fragment and opens `/set-password`. The token is removed from the address bar as soon as the browser session is established.

## Demo driver account

1. Replace the email on one fictional driver row with an inbox controlled by the tester.
2. Send an invitation to that exact email from Supabase Authentication.
3. The user-creation trigger links the invited identity to the matching driver record.
4. Accept the invitation, then sign in at `http://localhost:3001/login`.

The hosted development project must allow `http://localhost:3001/**` under Authentication → URL Configuration so driver invitations can return to the PWA.

Never invent or share a password. The tester sets it through the invitation flow.

## Demonstration workflow

1. Operations assigns a fictional unassigned site to the invited driver.
2. Driver refreshes assignments, opens the site and captures GPS.
3. Driver captures an installation photo and close-up photo, then submits.
4. Operations opens Review queue and verifies or requests a revisit.
5. Driver refreshes to see the resulting status and revisit reason.

## Current limitations

- Driver invitations remain a Supabase dashboard action; no service-role workflow is present in the apps.
- Evidence deletion and retention are intentionally not implemented.
- Realtime subscriptions are not enabled; each app uses an explicit refresh after mutations.
- The demo uses six fictional sites and two fictional driver profiles.
