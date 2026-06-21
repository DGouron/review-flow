# SPEC-073 Stage 4c — Centralize HTTP webhook reply shaping

## Scope

Stage 4c ONLY: collapse the duplicated webhook reply-mapping logic from both
controllers into ONE shared presentation mapper, parameterised by the platform's
number-field key (`mrNumber` for GitLab, `prNumber` for GitHub). Byte-for-byte
identical output; zero behavior change. Built on top of 4d (already done on this
branch — `_trackingGateway` already dropped). 4a/4b untouched.

## Files

### Created
- `src/modules/platform-integration/interface-adapters/controllers/webhook/webhookReply.ts`
  — `sendWebhookReply(reply, result, { numberKey })` presentation helper
  (interface-adapter layer). Discriminated-union input `WebhookReplyResult`;
  no imports beyond the structural reply target type. No `@/` framework imports.
- `src/tests/units/modules/platform-integration/interface-adapters/controllers/webhook/webhookReply.test.ts`
  — 21 byte-for-byte assertions (status code + full body) per variant × numberKey.

### Modified (production code only)
- `src/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.ts`
  — every mapper-covered `reply.status().send()` routed through `sendWebhookReply(..., { numberKey: 'mrNumber' })`.
- `src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts`
  — same, `{ numberKey: 'prNumber' }`.

NO existing test file modified (see evidence below).

## Reply variants handled by the mapper

| `kind` | Status | Body shape | Number key? |
|---|---|---|---|
| `cleaned` | 200 | `{status:'cleaned', [numberKey], jobCancelled, trackingArchived}` | yes |
| `merged` | 200 | `{status:'merged', [numberKey]}` | yes |
| `approved` | 200 | `{status:'approved', [numberKey]}` | yes |
| `unapproved` | 200 | `{status:'unapproved', [numberKey], reason}` | yes |
| `ignored-with-number` | 200 | `{status:'ignored', [numberKey], reason}` | yes |
| `ignored` | 200 | `{status:'ignored', reason}` | no |
| `rejected` | 200 | `{status:'rejected', reason}` | no |
| `queued` | 202 | `{status:'queued', jobId, [numberKey]}` | yes |
| `followup-queued` | 202 | `{status:'followup-queued', jobId, [numberKey]}` | yes |
| `deduplicated` | 200 | `{status:'deduplicated', jobId, reason}` | no |
| `pending-confirmation` | 202 | `{status:'pending-confirmation', pendingId, [numberKey]}` | yes |
| `pending-confirmation-untrusted` | 202 | `{status:'pending-confirmation', reason:'untrusted-actor', [numberKey]}` | yes |

`[numberKey]` resolves to `mrNumber` (GitLab) or `prNumber` (GitHub), preserving
the public wire contract. The key was NOT renamed to a unified `number` key.

### Deliberately left inline (NOT mapper variants — out of the number-key reply duplication)
- Signature failure: `reply.status(401).send({ error })` — distinct `{error}` shape.
- Payload parse failure: `reply.status(400).send({ error: 'Invalid webhook payload' })`.
- Bypass-flow replies in the note/issue-comment hooks: `{status:'bypass-rejected', reason}`,
  `{status:'bypass-recorded'}` — bypass concern, not in the enumerated variant set.
- GitLab note-hook untrusted park: `{status:'pending-confirmation', reason:'untrusted-actor'}`
  WITHOUT a number key — a distinct shape from the numbered untrusted variant; kept verbatim.

## No-drift evidence (no existing assertion modified)

```
$ git status --short
 M src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts
 M src/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.ts
?? src/modules/platform-integration/interface-adapters/controllers/webhook/webhookReply.ts
?? src/tests/units/modules/platform-integration/interface-adapters/controllers/webhook/webhookReply.test.ts

$ git status --short | grep -E "^ M.*\.test\.ts"
NONE — no existing test file modified
```

Only the two controllers (production) are modified; the only new files are the
mapper and its test. Every pre-existing controller/acceptance reply assertion is
untouched and green.

Regression net re-run GREEN unchanged (7 files / 118 tests):
- `gitlab.controller.test.ts` (47), `github.controller.test.ts`,
  `gitlabIdempotency.controller.test.ts`,
  acceptance `46-github-followup-review-on-push`, `197-trusted-actor-provenance-gate`,
  `200-webhook-event-idempotency`, `73-process-webhook`.

## Test count

- New tests: 21 (in `webhookReply.test.ts`).

## Final verification

```
$ yarn verify   # typecheck + lint + format:check + test:ci
Test Files  476 passed (476)
     Tests  3960 passed (3960)
oxfmt --check src: All matched files use the correct format.
EXIT_CODE=0
```

Lint emits only pre-existing `warning`-level size-limit debt (tracked, non-blocking);
zero errors. The `no-shadow` lint error and the format failures flagged mid-task were
both fixed (inner spy renamed; `yarn format` applied).

## Quality gates

- `@/` alias + `.js` everywhere; no relative imports; no barrel.
- No `as Type`; no `any`; `pendingId: string | null` (null for absence).
- Dependency Rule: `webhookReply.ts` imports nothing inward-violating — it depends
  only on a structural reply target type. Interface-adapter (presentation) layer.
- Byte-for-byte parity proven by both the new mapper test and the unchanged
  controller/acceptance suites.

Status: OK Clean — `yarn verify` exit 0.
