# Authentication email configuration

## Magic-link sign-in for Operations and Driver

Both `/login` screens offer **Email me a sign-in link** alongside password sign-in. Only existing invited accounts can sign in; the request explicitly disables automatic account creation. The existing organization roles, driver linkage, and database access policies still apply.

The request sends the app's own `/auth/callback?next=...` as the return address. The callback exchanges the Supabase PKCE code for a cookie-backed session and returns to the requested internal page. Invalid or expired links return to sign-in with an explanation and keep the requested destination for a replacement link.

Open the email link in the same browser that requested it. PKCE requires that browser's verification cookie; switching devices or opening an unrelated in-app email browser will not complete sign-in. Request a fresh link in the browser you want to use, or use the existing password option.

The default hosted **Magic link or OTP** template already uses `{{ .ConfirmationURL }}` and does not need a template or SMTP change for this flow. The existing email-service limits still apply. The UI waits 60 seconds before allowing another successful request; Supabase also enforces its own limits.

Before releasing, check the hosted Auth redirect allow list includes the callback on each intended app origin:

- `https://drivers.10billionsteps.site/auth/callback`
- `https://moka-10bs-ops-staging.vercel.app/auth/callback`
- `https://10-billion-steps.vercel.app/auth/callback` when publishing to the existing Operations production URL

Local callbacks use ports 3000 and 3001, already allowed by `supabase/config.toml`. Protected Vercel staging URLs still require Vercel account access before application sign-in. No email request, hosted configuration change, or production release is performed by the test suite.

Release verification with an invited tester: request a link without filling a password, confirm email receipt, open it in the requesting browser, confirm the expected role and destination, and then verify that reusing or expiring the link shows the sign-in error. Repeat on the Driver app and Operations app. Local tests cover request restrictions and callback behavior with a mocked provider; they do not prove hosted email delivery.

## Previously verified hosted setup

The following records the setup verified on 14 October 2026 for hosted project `cpyumnhbpbsdefjiqvtl`.

## Repository templates

The copy-ready English templates and their subjects are stored in `supabase/templates/auth/`. They use `{{ .ConfirmationURL }}` for both the primary button and the visible fallback link. Run `npm run validate:auth-emails` before applying them.

The local development configuration is defined in `supabase/config.toml`. These entries do not change the hosted project.

## Hosted-project limitation

The hosted project is on the Free plan and uses the built-in email provider. The Authentication → Emails screen currently displays **“Set up custom SMTP to edit templates”** and disables both the source editor and Save changes button. New Free-plan projects using the built-in provider cannot customize authentication email templates.

The project requirements explicitly prohibit custom SMTP and sender changes. For that reason, the branded templates cannot currently be applied to the hosted project without changing an approved requirement. No hosted template was changed and no test email was sent.

If custom SMTP or a plan that permits template editing is approved later:

1. Open the hosted project dashboard.
2. Go to **Authentication → Emails → Templates**.
3. Open each template and copy the subject and full HTML from the matching repository file:
   - **Invite user** → `invite.html`
   - **Magic link or OTP** → `magic-link.html`
   - **Reset password** → `recovery.html`
   - **Confirm sign up** → `confirmation.html`
4. Select **source**, replace the full body, and save each template.
5. Re-open each template and confirm that the preview renders the DMC header, CTA, security notice, fallback link, and footer.
6. Send a single invitation only after the Invite user template visibly shows the branded source.
7. Confirm receipt in the recipient mailbox and complete the link flow in a browser. A successful send response alone is not proof of delivery.

## Hosted URL configuration applied

- Hosted Site URL: `https://10-billion-steps.vercel.app`
- Hosted redirect allow list:
  - `http://localhost:3000/**`
  - `http://127.0.0.1:3000/**`
  - `http://localhost:3001/**`
  - `http://127.0.0.1:3001/**`
  - `https://10-billion-steps.vercel.app/**`
- Existing Vercel production domain: `https://10-billion-steps.vercel.app`
- Local Operations Dashboard: `http://localhost:3000`
- Local Driver PWA: `http://localhost:3001`

The deployed `/auth/callback` and `/auth/confirm` routes were verified before this change. Default Supabase email templates and the built-in delivery service remain unchanged.

## Built-in email service restrictions

- Authentication email templates are locked for this new Free-plan project while it uses the built-in provider.
- The built-in provider is limited to two authentication emails per hour for the project.
- It only sends to email addresses belonging to members of the project's organization.
- Delivery is best-effort and has no delivery or uptime SLA.
- It is suitable for development/demo testing, not production delivery.
