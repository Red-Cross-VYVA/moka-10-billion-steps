# Staging mobile validation

Use fictional demonstration sites and the invited administrator and driver accounts only. Operations remains behind Vercel Authentication. The Driver custom domain opens directly to the invite-only Supabase sign-in; its generated Vercel deployment addresses remain protected.

## Phone preparation

1. Open `https://drivers.10billionsteps.site` in Safari on iOS or Chrome on Android.
2. Sign in with the invited driver account.
3. Add the app to the home screen when the browser offers installation.
4. In the phone settings, allow Camera and Precise Location for the browser/PWA.
5. Keep the Operations staging URL open on a separate authenticated browser or computer.

## Field workflow

1. In Operations, assign one fictional site to the demo driver.
2. Refresh the Driver PWA and confirm the assignment appears.
3. Open the site and use **Open route in maps**.
4. Return to the PWA and tap **Capture GPS** at the fictional test location. Hosted staging has no manual GPS override.
5. Install the poster and capture the installation and close-up photos using the phone camera.
6. Confirm both previews visibly show the Saudi capture date/time, GPS coordinates and site ID.
7. Retake one photo and confirm its preview receives an updated stamp and evidence UID.
8. Submit evidence and confirm the site changes to **Under review**.
9. In Operations, confirm both retrieved photos retain their visible stamps and show a separate authoritative server upload timestamp.
10. In Operations, reject the submission with a revisit reason.
11. Refresh the Driver PWA and confirm the revisit status and reason.
12. Submit a second GPS/photo attempt, then approve it in Operations.
13. Confirm both applications display **Verified**.
14. Refresh both applications and confirm the status persists.
15. In Operations, confirm both attempts, all evidence records, the rejection, revisit, approval, and acting users remain in the audit history.

Record the phone model, operating system, browser version, camera result, GPS accuracy, upload result, and any permission prompts. A desktop browser test does not count as physical-device verification.

