# AI-assisted evidence triage

## Behaviour

Submitting an attempt atomically queues an advisory assessment. A scheduled Edge Function claims one queued run, checks server-held evidence metadata, downloads originals from the private bucket, creates temporary bounded analysis copies, and requests structured visual findings from OpenAI. The result is `meets_criteria`, `needs_review`, or `likely_issue`.

Human Operations review remains authoritative. Assessment code and database triggers do not update sites, attempts, review decisions, or exceptions.

Retries append a new run and retain previous results. Provider errors retry up to three times, then remain visible as `needs_review` with an unavailable status.

## Security model

- `evidence_assessments`: SELECT for active admin/operator/reviewer membership only. No authenticated INSERT, UPDATE, or DELETE grant.
- `evidence_assessment_settings`: SELECT for active Operations roles; UPDATE for admins only.
- `retry_evidence_assessment`: checks admin/operator/reviewer membership server-side and requires a submitted attempt.
- `claim_evidence_assessment`: executable only by `service_role`.
- Driver and anonymous roles cannot read assessments or settings.
- Evidence stays in the existing private bucket. The worker uses the service client internally and never creates a public URL.
- Image bytes, data URLs, API keys, and evidence URLs must not be logged.

## Hosted rollout status

The approved migration and worker were applied to project `cpyumnhbpbsdefjiqvtl` on 15 October 2026.

- `OPENAI_API_KEY`, `OPENAI_VISION_MODEL`, and `ASSESSMENT_WORKER_SECRET` are encrypted Edge Function secrets.
- `assess-evidence` is deployed with gateway JWT verification disabled because the function enforces its own two explicit authorization paths: a matching `x-worker-secret` for scheduled work, or a signed-in admin/operator/reviewer plus assessment ID for manual retries.
- `pg_cron`, `pg_net`, and Vault are enabled. The active `assess-evidence-every-minute` job runs every minute and reads its worker credential from the encrypted Vault secret `assessment_worker_secret`; the credential is not retained in the cron command.
- Hosted scheduler invocations returned HTTP 200 after configuration.
- `rollout_mode` remains `shadow`. Human review is authoritative, and risk ordering and automatic decisions remain disabled.

Rotating the worker credential requires updating both the Edge Function secret `ASSESSMENT_WORKER_SECRET` and the Vault secret `assessment_worker_secret` to the same new random value.

Do not commit secret values. Do not activate risk ordering or any automatic decision path during the shadow evaluation.
