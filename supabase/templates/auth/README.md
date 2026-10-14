# DMC authentication email templates

These files are the source of truth for the English authentication emails used by the 10 Billion Steps platform.

| Flow | Subject | File |
| --- | --- | --- |
| User invitation | Welcome to the 10 Billion Steps Operations Platform | `invite.html` |
| Magic-link login | Your Secure Login Link | `magic-link.html` |
| Password recovery | Reset Your Password | `recovery.html` |
| Email confirmation | Confirm Your Email Address | `confirmation.html` |

All CTA and fallback links use the hosted authentication service's `{{ .ConfirmationURL }}` variable. The templates deliberately avoid external images and web fonts so they remain dependable in Gmail, Outlook, and mobile clients. The header is a typographic treatment based on the approved DMC navy, silver, and white reference; it does not create or alter a DMC logo.

The root element uses `lang="en"` and `dir="ltr"`. Future Arabic copies should be stored as separate localized templates with `lang="ar"`, `dir="rtl"`, right-aligned content, and Arabic-safe system fonts. Do not combine languages into one transactional email.

Run `npm run validate:auth-emails` before copying these templates to the hosted project. Hosted templates are managed separately in the authentication dashboard; the `config.toml` entries configure local development only.

See `docs/auth-email-configuration.md` for the verified hosted-project limitation, callback URL findings, and exact application checklist.
