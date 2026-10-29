# Searchable media metadata controls

29 October 2026. Source published; static and hosted build checks passed.
The eight browser cases remain unrun, pending their separate approval.
Starting source: cab74d32a86e962529d4669181f2704107970272, clean locally and
matched by connected GitHub main before editing.

The complete returned [Notion brief](https://app.notion.com/p/3b6a1ee8bd06803e99d1cf6b0218c207)
explicitly requests “Combobox to category/subcategory/tags”. Its unverified
snapshot/last edit is 15 October 2026. The text was inspected again this turn;
the linked screenshot was not inspected and no pixel comparison is claimed.
The baseline had category/tag datalists and a plain subcategory field.

The new product controls compose the existing shadcn/Base UI combobox, popup,
input, chip and button primitives. Categories/subcategories expose searchable
existing values plus explicit creation and clearing. Tags are selected as an
array with removable chips, preserving exact case and literal commas. Typing
search text alone is not a saved selection. Draft changes still require the
existing Save info action and keep the same nullable string/string-array API.

The canvas now binds Info to its explicitly opened media ID. If that media is
removed, another selected item cannot inherit the old draft. Search state is
keyed by media ID. Subcategory suggestions come from the canvas's actual saved
values; no new hierarchy or automatic category reassignment is introduced.
The Info panel and popups have narrow-width bounds. Save catches errors, keeps
drafts available, prevents overlapping saves and bounds hosted requests to
thirty seconds. A timeout reports uncertainty and permits an explicit retry;
it does not claim the server rolled a write back.

Independent review found Base UI's implicit search-clear and closed-popup Escape
selection resets. The wrappers now cancel those metadata resets, restore the
single selected label on Escape and keep tag chips. The eight-case scope includes
abandoned empty/nonempty searches and Escape; these are authored expectations,
not observed browser results.

Files: main canvas integration, new metadata-combobox product component, a
focused eight-case browser fixture, README and owning proposal/results.
The [browser proposal](../../../proposals/metadata-combobox-checks.md) remains
inactive. Previous crop/browser approvals do not cover this new behavior.

The local Next guide directory is absent. Before editing, the official
[Next 16.2.9 use-client guide](https://github.com/vercel/next.js/blob/v16.2.9/docs/01-app/03-api-reference/01-directives/use-client.mdx)
and locked [Base UI 1.6 Root](https://github.com/mui/base-ui/blob/v1.6.0/packages/react/src/combobox/root/ComboboxRoot.tsx)
and [AriaCombobox source](https://github.com/mui/base-ui/blob/v1.6.0/packages/react/src/combobox/root/AriaCombobox.tsx)
were inspected. The current public Base UI docs describe a later version; no
newer createItems API or dependency upgrade was assumed. Existing TypeScript
5.9.3 is available read-only for syntax transpilation; parsing is not type proof.

Three changed/new TS/TSX files passed TypeScript 5.9.3 syntax transpilation and
29 local import targets resolved. The inactive workflow parsed with system Ruby
Psych; eight shell and three embedded Node blocks passed syntax-only checks,
and its runner-only Playwright configuration parsed. Whitespace checks passed.
A local targeted ESLint attempt could not start because the available read-only
environment lacks its TypeScript parser; no linter pass is claimed or dependency
installed. The proposed job includes focused lint with the existing frozen lock.

The [source inventory](metadata-controls-inventory.json) seals 175 application
inputs and all eight literal case names. All 1,011 unrelated tracked baseline
files remain unchanged, including bundled skills, backend, schemas, dependency
files, fundamental UI primitives and existing tests. Five local Markdown links
in the changed/new documentation resolve. Pinned Base UI
[Input](https://github.com/mui/base-ui/blob/v1.6.0/packages/react/src/combobox/input/ComboboxInput.tsx)
and [event cancellation](https://github.com/mui/base-ui/blob/v1.6.0/packages/react/src/internals/createBaseUIEventDetails.ts)
contracts support the source-level search-reset correction; they do not replace
the pending actual keyboard/browser acceptance.

Storage Guard refused local installation/build at 28.0 GiB free versus 34.0 GiB
required. No environment, browser, server, CI, backend/domain test, model call,
database, Auth/security, dependency, production-config or paid-service change
has been made. Existing SQLite/Convex/PostgreSQL direction, signed-in persistence
and provider behavior remain separately unfinished; metadata controls do not
complete the app or the full portfolio objective.

Source and the complete check proposal were published at
[`8214dc48832bfcb1e6718b17b9f208d1b603f4e0`](https://github.com/alvarovillalbaa/inspiration-canvas/commit/8214dc48832bfcb1e6718b17b9f208d1b603f4e0).
Connected GitHub ref/tree readback matched all 1,019 leaf paths, modes, types
and blob SHAs without truncation. Local main was clean and Actions count zero.
The [publication record](metadata-controls-publication.json) retains the tree
identity digest, source/deployment and delivery limits. One approval request
links that exact published eight-case/fifteen-minute temporary-CI proposal.
No active workflow was installed and no check was started from that request.

Production deployment
[`dpl_43gUtUrtq8pzCzKidvC8QGPJ3FGa`](https://vercel.com/my-team-4f230354/inspiration-canvas/43gUtUrtq8pzCzKidvC8QGPJ3FGa)
reached READY at 8214dc4 and owns the canonical alias. Bounded build logs record
successful compilation (18.9 seconds), TypeScript (8.7 seconds), all thirteen
static pages and completed deployment. The connector omitted 44 older log
items; no complete-log audit is claimed. Connected homepage/client GETs returned
200; independent unauthenticated HEAD also returned 200 and named this deployment
in its preload links.

The delivered page client is 90,284 UTF-8 bytes, SHA-256
`f6c6330c4c8c07094873d30bbf8e3e7106ded33f7e91a8989788bb6f52471cf9`.
It passed JavaScript syntax compilation without execution and contains creation,
tag-search, save-error and Escape-fence code. These are actual build/type/delivery
results; keyboard, touch, chip actions, save/reload and failure/retry behavior
remain unverified until browser execution. This evidence-only follow-up changes
none of the 175 sealed application inputs.
