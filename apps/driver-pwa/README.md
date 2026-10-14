# Driver PWA

Mobile-first field workflow for the Sites Activation demonstration.

The field sequence is assignment, external navigation, GPS capture, poster installation, two required photographs, submission, and Operations review. QR scanning is intentionally not part of Sites Activation.

Run from the repository root with `npm run dev:driver`. It uses the same Supabase project as the Operations Dashboard and listens on `http://localhost:3001`.

Drivers must be invited through Supabase Auth and linked to a row in `public.drivers` with the same email address before accepting the invitation.
