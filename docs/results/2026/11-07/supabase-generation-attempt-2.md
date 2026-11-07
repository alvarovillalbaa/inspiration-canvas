# Supabase child generation — attempt 2

The focused SDK-mock/static packet **passed**: seven fresh AI-helper identities,
lint for the corrected AI test, and the full 11-input focused type check. It
also validates 69 historical unit identities and ten unchanged lint inputs from
[attempt 1](supabase-generation-attempt-1.md). This is not a 76-case invocation
on the current source. Attempt 1 remains overall false; its seven older AI-test
results and failed type check are not carried.

- [Run 42350362702](https://github.com/alvarovillalbaa/inspiration-canvas/actions/runs/42350362702),
  job `128336980417`, workflow `410143444`, attempt 1 of this new run.
- Actual job: `2026-11-07 07:13:26–07:13:57 UTC` (31 seconds).
- Tested source `606b544fbb64a496bfe1f4c6782fb275a5fcc6f0`, native tree
  `061947ebafa3419f76b2ea066a58aa3717e9dd06`.
- Activation `3c9db1340cb34a338beb70c223a075c3b07949c4`, branch
  `qa/supabase-generation-20261107-2`.
- [Exact emitted result plus newline](supabase-generation-attempt-2.json):
  300,326 bytes, SHA-256
  `78227283bb30a315dc024af9f9b3383f6d988bc31f5da4e27ceb97a117df62bd`.
  The unique actual stdout marker was saved before interpreting the result.
  JSON without newline: 300,325 bytes, SHA-256
  `e1fd305d86247bab7412ae2d1d25f3028b36836b91660194f727fcb24b2c6b00`.

All seven foreground commands exited 0, including Vitest, changed-test ESLint,
and full scoped TypeScript. The fresh 3,056-byte Vitest JSON has SHA-256
`a55049d61dcd03d210de9d2e6076c1fa142a61415c874f0a596f58524609a507`;
it contains exactly the seven literal current AI identities, all passed, zero
failed/pending/todo, one test file, with retry 0 configured. The fixture now
provides a complete typed `MediaItem`; no cast, assertion, or type-check waiver
was added. No unrelated or carried tests were rerun.

The immutable first receipt remains 320,234 bytes with SHA-256
`031cd7f272bb5fd1a20595524e4e1d21e0cee434361132892808dc3ab977f950`.
Its original 21 repository, 25 coordinator, and 23 route identities supply the
69 carried cases. All 140 protected runtime/export rows match its mode, blob,
bytes and SHA-256; the sole changed row is `supabase-child-ai.test.ts`, now
4,831 bytes / `fd85a1588375101b9d2318161c4dc260922af13a6cde6906f982169c68cc6739`.
The union is 76 unique identities across the two source editions.

Independent decoding verified all 15 fresh original gzip captures (5,407 raw /
2,069 compressed bytes) and all 15 prior captures (32,899 / 6,091 bytes).
Every retained raw/compressed/observed length and digest matched, gzip reached
EOF without trailing data, and original unit JSON matched parsed results.
All 1,086 source leaves (9,847,624 bytes) match native Git mode/blob/bytes/hash;
five clean HEAD/index/working/ignored-state guards match vector
`1394cafa3795ad8ad517b822cd7da3cd686f5bec047fdaeca8ff83412fbf3b2b`.
All 141 exported inputs total 1,260,889 bytes. Node was `24.21.0`, pnpm `10.24.0`;
frozen dependency installation ignored lifecycle scripts.

All seven children were reaped with closed descriptors, both pipe EOFs, absent
original groups, no timeout/signals, and no owned or uncertain residuals.
Scratch identity and removal passed. Only the owned temporary workflow was
disabled; fresh API readback returned `disabled_manually`, update `07:15:00 UTC`.

Separately, Root reported Vercel candidate metadata at `07:14:50 UTC`: READY
deployment `dpl_H54wevJJAuR5LAF9n68qHWDC1JDr` for this exact source, target null.
This is packaging metadata, not page or hosted behavior evidence. Neither run
checks actual Supabase Auth/RLS, models/billing, provider storage, browser/UI,
request termination, or durability. See the [scope](../../../proposals/supabase-generation-checks.md).
This audit performed no source fix, retry, commit, retirement, or deployment.
