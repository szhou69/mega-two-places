# mega-two-places

MEGA.dev S02E04 "two places".

- `worker1/` runs on the student's Mac (job 1, incident-lookup). Not committed.
- `worker2/` runs on GitHub Actions (job 2, voice-to-memo). Trigger: Actions → "worker2" → Run workflow.
  Needs repo secret `JOB2_URL` (job 2's MCP link; never commit it).
