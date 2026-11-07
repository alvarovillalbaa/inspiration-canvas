# Supabase child generation — attempt 1

Overall **failed**. The 76 selected authored unit identities passed and scoped
ESLint passed; the focused TypeScript command exited 2. This is not acceptance
of the complete source packet or a hosted generation journey.

- [Run 42349234680](https://github.com/alvarovillalbaa/inspiration-canvas/actions/runs/42349234680),
  job `128333612983`, workflow `410136020`, attempt 1.
- Actual job: `2026-11-07 06:57:50–06:58:29 UTC` (39 seconds).
- Tested source `a62f7e9541df4ab1919bd1662be7708e0190e042`, native tree
  `a60a4fb92ea93ed252562605d65cd3432c401d97`; the checkout log confirms this source.
- Activation `acc1604bdcf3ce8ea9f87eda0bd8e3cf9daf4a80`, branch
  `qa/supabase-generation-20261107-1`.
- [Exact emitted result plus newline](supabase-generation-attempt-1.json):
  320,234 bytes, SHA-256
  `031cd7f272bb5fd1a20595524e4e1d21e0cee434361132892808dc3ab977f950`.
  The unique actual stdout marker was retained before interpreting the result.
  Original JSON excluding newline: 320,233 bytes, SHA-256
  `04d1c8bde4aa3c6e7cef1bb6e22dc0afdcca242efe564762830259218d2426e5`.

The failure is `TS2352` at `tests/unit/supabase-child-ai.test.ts:14`: the authored
parent fixture casts an incomplete object to `MediaItem`, missing `canvasId`,
`url`, `storageDriver`, `storageKey`, and other required fields. This diagnostic
is retained in command 6 stdout. The controller retained `passed:false` and
`AssertionError` at its strict command-exit gate; no assertion or type check was
waived and no rerun was started.

Independent audit decoded all 15 original gzip captures (seven stdout/stderr
pairs and the original Vitest JSON), totaling 32,899 raw and 6,091 compressed
bytes. Every stream matched raw/compressed/observed lengths and SHA-256, ended
at gzip EOF without trailing data, and remained within recorded caps. The
28,825-byte Vitest JSON SHA-256 is
`a173da91f84307dfd9c0832825316b039603fae724fcf84c6498d170a53fb377`.
Its exact 21 repository, 25 coordinator, 23 route, and 7 AI-helper identities
match both the pinned manifest and immutable-source AST literals: 76 passed,
zero failed/pending/todo, four files; retry 0 is configured. Seven foreground
commands ended `[0,0,0,0,0,0,2]`; pnpm frozen install ignored lifecycle scripts.

All 1,084 source leaves (9,511,943 bytes) independently match native Git
mode/blob/bytes/SHA-256. Four full HEAD/index/working/ignored-state guards match
vector `31045c1981f03996fb69ea772d0f0254af55015cb917727ad2c543f2d161c204`:
before export, after install, cleanup barrier, and after scratch removal. The
after-checks guard was not reached. All 141 exported inputs (1,260,336 bytes)
match their source rows. Node was `24.21.0`, pnpm `10.24.0`.

All seven children were reaped with descriptors closed, both pipe EOFs, absent
original process groups, no timeout/TERM/KILL, no remaining owned or uncertain
processes, and no cleanup signals. Scratch UID/inode/nonce identity matched and
scratch removal passed. Only the owned workflow was disabled after terminal;
fresh API readback returned `disabled_manually` with workflow update time
`06:59:44 UTC`.

These are mocked SDK/auth/storage boundary checks, not real Supabase/RLS,
provider/model billing, database, browser, platform-duration, or durable-worker
proof. No old tests, build, server, or provider journey ran. See the
[scope proposal](../../../proposals/supabase-generation-checks.md). No source
fix, retry, commit, branch retirement, or deployment was performed by this audit.

## Publication follow-up

The original 3,518-byte audit above is preserved (SHA-256
`1902ec5faaa09991ccebb6815dc11bb880f382788697ac141c00717c858f45e0`).
Receipt commit `44c74f60a59bc18381545288738c4b8867015118` is published on
`work/supabase-child-generation-20261107`. The owned QA branch was retired at
`e9684eb0f3d094cf45b42216747c9e0a8a98f3e8`, whose tree exactly matches that
receipt commit and contains no active attempt-1 workflow. Atomic publication
and fresh remote-ref readback both succeeded. Main and production remain at
`3d0f0d12bd5a4ccfa1cc921a7f8ff193f2802383`.

The follow-up corrects the authored parent fixture with all required `MediaItem`
fields. All seven test bodies and their consumed summary inputs remain
unchanged. A separate bounded check is being prepared for those seven cases,
the changed test's lint and the complete original focused type-check scope;
the 69 unchanged contracts will retain their first-run evidence. This failed
overall attempt remains failed.
