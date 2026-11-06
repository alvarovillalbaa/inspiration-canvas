# Saving a temporary canvas

The account-save flow copies the temporary files, positions, sizes, rotation,
stacking, crop, title, categories, tags, description and comments. It does not
generate or analyse media. `lib/canvas/transfer.ts` checks that every source blob
is available before sending a request, then requires a receipt for every item and
comment. An unavailable blob, timeout, HTTP error or incomplete receipt keeps the
transfer pending. The dialog exposes the error and keeps the Save action available.

`POST /api/canvas/[id]/import` accepts one multipart `file` and one JSON `item`.
Only the existing authenticated Supabase path is accepted. The destination is
read through the existing user-scoped repository before any storage write; no
service-role client, new grant, policy change or migration is used.

Media and comment primary keys derive from the authenticated owner, destination
and original temporary identities. The storage key also binds the validated
file bytes, filename and complete normalized snapshot. Retries reuse those keys.
A duplicate insertion is read back only for PostgreSQL's `23505` unique conflict;
other failures propagate. Changed source content at the same identity returns
409 and keeps recovery data. A replay of the original snapshot does not overwrite
later account metadata edits. Each comment must match the saved identity, target
and body before the endpoint acknowledges it.

Storage and row creation are not one transaction. An interrupted operation may
leave its deterministic object or a partly imported item; retry resumes it.
There is no destructive rollback that could delete another request's work.

After all receipts, a separate browser receipt hides only that exact source
snapshot for that destination. The original localStorage state and IndexedDB
blobs stay until their existing four-hour expiry. Saving does not extend that
expiry. New or concurrent local edits remain pending. A failed local receipt
write is also retryable. This is a one-time copy, not synchronization: editing
the source after a partial import may require reviewing its saved account copy.

Auth/load generation guards prevent an older load or transfer completion from
restoring the signed-in UI after a newer sign-out or account transition.

## Verification scope

The focused checks cover authored transfer orchestration and the import service
and route with mocked persistence/storage boundaries, plus scoped lint and type
checks. They do not prove a live Supabase login, RLS execution, storage durability,
browser UI, physical devices, provider calls or PostgreSQL migration. The existing
crop and metadata receipts remain separate. The temporary CI template is
`docs/proposals/temporary-transfer-checks.workflow.yml.example`; it uses a public
Ubuntu runner for at most 15 minutes, a frozen dependency lock and disposable
files, with providers disabled and no database/server/browser started.

All 29 focused checks, scoped types and lint exited successfully on the first
run. The [result and raw receipt](results/2026/11-06/temporary-transfer-checks.md)
record the retained lint warning, exact source, mocked boundaries and cleanup.

The broader local PostgreSQL convergence remains unfinished: the current local
SQLite/libSQL and Neon transport paths have not been replaced by this repair.
