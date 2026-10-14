import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const directory = dirname(fileURLToPath(import.meta.url));
const templates = {
  "invite.html": "Welcome to the 10 Billion Steps Operations Platform",
  "magic-link.html": "Your Secure Login Link",
  "recovery.html": "Reset Your Password",
  "confirmation.html": "Confirm Your Email Address",
};

const required = [
  '<html lang="en" dir="ltr">',
  'name="viewport"',
  'role="presentation"',
  "Security notice:",
  "Delta Marketing Co.",
  "10 Billion Steps",
];
const prohibited = [/Moka Digiteck/i, /Supabase/i, /service[_ -]?role/i, /anon[_ -]?key/i];
let failed = false;

for (const [file, subject] of Object.entries(templates)) {
  const html = await readFile(join(directory, file), "utf8");
  const errors = [];

  for (const value of required) {
    if (!html.includes(value)) errors.push(`missing ${value}`);
  }
  for (const pattern of prohibited) {
    if (pattern.test(html)) errors.push(`contains prohibited text ${pattern}`);
  }
  if (!html.includes(`<title>${subject}</title>`)) errors.push("title does not match subject");
  if (file === "recovery.html") {
    if ((html.match(/{{ \.RedirectTo }}/g) ?? []).length < 3) {
      errors.push("CTA and fallback link must both use RedirectTo");
    }
    if ((html.match(/{{ \.TokenHash }}/g) ?? []).length < 3) {
      errors.push("CTA and fallback link must both use TokenHash");
    }
    if (!html.includes("type=recovery")) errors.push("recovery link must set the OTP type");
  } else if ((html.match(/{{ \.ConfirmationURL }}/g) ?? []).length < 2) {
    errors.push("CTA and fallback link must both use ConfirmationURL");
  }

  if (errors.length) {
    failed = true;
    console.error(`${file}: ${errors.join("; ")}`);
  } else {
    console.log(`${file}: valid`);
  }
}

if (failed) process.exitCode = 1;
