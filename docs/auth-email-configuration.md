# Authentication email configuration

Verified on 14 October 2026 for hosted project `cpyumnhbpbsdefjiqvtl`.

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
