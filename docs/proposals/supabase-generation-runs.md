# Supabase generation-run repository prerequisite

7 November 2026. Repository source is implemented; runtime verification is
pending. This is a prerequisite for the existing [child-media requirement](../ai.md),
not acceptance of a connected hosted generation workflow. This isolated repository
scope left the `/api/generate-child` Supabase 501 refusal untouched; the combined
request coordinator and route wiring have a separate contract. No provider, account
or production setting was changed. Existing metadata, transfer and local PostgreSQL
results stay separate.

The [authenticated repository](../../lib/db/supabase-repository.ts) now exposes:

- `createGenerationRunForUser(client, userId, input): Promise<GenerationRun | null>`
- `getGenerationRunForUser(client, userId, runId): Promise<GenerationRun | null>`
- `updateGenerationRunForUser(client, userId, runId, patch, options?): Promise<GenerationRun | null>`

The caller supplies the existing authenticated Supabase client and its verified
server-side user ID. No service-role client, global administrator, new identity
mapping, migration, policy or dependency is introduced. The returned DTO matches
the [local GenerationRun](../../lib/types.ts); it adds no owner/token fields.

Create checks an owned canvas and every selected parent, requiring at least two
distinct parents owned by the actor in that same canvas. A missing/foreign parent
is never silently filtered out. It snapshots the original ordered parent array,
prompt/status/canvas before the first await, then creates a server-generated ID
with owner/canvas/parents/timestamps fixed by the repository. Missing or foreign
scope returns null before an insert. Invalid shapes throw a generic input error.
Identifiers remain text, accepting nonblank strings up to 1024 characters without
NUL; no UUID-only rule is added. Prompts retain the request schema’s 4000-character
bound. Parent cardinality remains at least two distinct IDs, without a new maximum.

Read checks run ownership and the current owned canvas. It does not revalidate
parent existence: parent JSON can outlive deleted parent rows. Update permits
only `status`, `prompt`, `resultMediaItemId` and `error`; identity, owner, canvas,
parent and timestamp fields cannot be patched. Undefined-only/empty patches read
without changing the timestamp. Non-null result assignment freshly checks an
owned media row in the same canvas. Clearing the result explicitly is supported.
An owned run can still record a failure/error after a parent has been deleted.
Stored rows must retain an exact distinct selection of at least two valid text
parent IDs, a known status and valid basic field types/timestamps. Malformed stored
data throws a generic invalid-run error; no parent entry is filtered or repaired.

Optional `{ expectedStatus }` snapshots one of pending/running/complete/failed
and adds a status predicate to the actual owner/run/canvas-filtered UPDATE.
A mismatch returns null, with no fallback write. This lets a coordinator avoid
overwriting a committed completion after a lost acknowledgement. It is row-status
CAS, not a revision counter, transition state machine or exactly-once coordinator.
Without that option, callers retain ordinary patch behavior. Empty patches only
compare the observed read status and perform no conditional database write.

All lookups and the mutation are separate authenticated PostgREST requests.
Existing RLS checks row owner; it does not enforce composite parent/canvas/result
binding. A parent or result may be deleted/retargeted after validation, and another
writer can bypass these application helpers. The update’s expected canvas filter
refuses a run moved elsewhere before its write, but does not make all dependencies
atomic or prevent ABA/other field races. No stronger transactional claim is made.

The next coordinator must freshly revalidate all owned parents before AI/storage
work, define request/session authority and lost-acknowledgement recovery, and avoid
blind failed-state writes. Durable background credentials, idempotent object/run
recovery and any stronger database binding remain separate design decisions.
No raw credential should become a workflow argument or stored generation field.

The [21 authored unit cases](../../tests/unit/supabase-generation-runs.test.ts)
use a T2 in-memory PostgREST boundary fake. They cover owner/canvas/all-parent
scope, DTO/order, mutable-field validation, owned result assignment, errors,
deleted-parent failure recording, malformed stored rows, captured inputs, retarget refusal and status
match/mismatch/competing completion. They do not execute real Auth/RLS/SQL/storage,
prove database race semantics, call a model or establish browser/hosted acceptance.
Only static source/syntax/whitespace/link checks are authorized during preparation;
test execution requires the separately reviewed bounded CI packet.
