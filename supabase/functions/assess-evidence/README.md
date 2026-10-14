# Evidence assessment worker

This Edge Function processes queued, advisory evidence assessments. It never changes a site, visit attempt, review decision, or exception.

Required Supabase secrets:

- `OPENAI_API_KEY`
- `OPENAI_VISION_MODEL`
- `ASSESSMENT_WORKER_SECRET`

Schedule a POST request every minute with `x-worker-secret` set to `ASSESSMENT_WORKER_SECRET`. The function atomically claims one queued item. Operations retries invoke the same function with an authenticated bearer token and `{ "assessmentId": "..." }` after calling `retry_evidence_assessment`.

The function downloads evidence through the service client, creates bounded JPEG analysis copies in memory, sends them with `store: false`, and does not persist analysis images or image data in logs.
