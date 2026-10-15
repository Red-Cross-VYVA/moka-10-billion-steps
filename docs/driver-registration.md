# Driver registration

Operations → Drivers → Add driver creates a persisted driver profile using the
existing `drivers` table and its `drivers_manage` row-level policy. Active admins
and operators can register drivers. The form loads active regions only from
organizations where the current account has one of those roles. A read-only
account sees a permission explanation rather than an unexplained disabled button.

Required: driver code, full name and region. Mobile and email are optional contact
fields. The selected region determines the organization. Duplicate driver codes,
revoked access and save failures keep the form open with the entered values.
Submission is locked while saving. No schema or permission changes are needed.

Creating a profile does not create an authentication account, link an existing
account, or send an invitation email. New profiles have `user_id = null` and are
labeled “Sign-in not linked.” Sign-in requires a separately invited account linked
to the profile. “Copy driver app link” copies the Driver login URL; it is not an
invitation or an authentication link.

The local demo retains the same entered fields in browser storage and stays
explicitly labeled as demo data.

Validation:

- Unit checks cover validation, preserving entered contacts, region ownership,
  duplicate/permission/save errors and omitted contacts.
- `supabase/tests/driver-registration.sql` exercises real driver inserts and
  reloads as the existing demo admin/operator, plus rejected duplicate codes,
  reviewer/driver/inactive/anonymous/cross-organization inserts. It must run with
  the complete transaction and final rollback. Test records and role changes do
  not persist.
- Browser checks cover opening, validation, creation, reload, cancellation,
  mobile and Arabic layout. A signed-in production session remains necessary for
  a user acceptance check on the live form.
