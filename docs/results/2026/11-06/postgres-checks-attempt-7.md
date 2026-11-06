# Comment repair: typing passed, delayed-read setup rejected

[Run 42145823146](https://github.com/alvarovillalbaa/inspiration-canvas/actions/runs/42145823146),
job `127656920004`, source `bc5d52ea4b10c339e1213538b25005c4e6003691`,
activation `6d3625299d98a66f36819d8a0527bbb747da98f3`, failed overall.
Controller: 6 November 2026, 01:44:51–01:46:50 UTC.

Narrow passed fully on the changed client source, without retries/errors.
Desktop typed exact multiline text, kept Ctrl/Meta+A selection inside the note,
received the actual 201/body acknowledgement and rendered its exact paragraph.
The delayed-read guard then correctly rejected the fixture because another GET
had begun after the held read (ordinal 4 versus 5). The write fence is not proved
by this invocation, and desktop reload acceptance remains open. The held response
was released in finally; owned UI deletion succeeded. No network/page/HTTP errors
were present. Existing assertions remain required.

Frozen install, scoped lint/types, original 55-unit/16-PostgreSQL receipt binding,
source/port/marked-database/process/stream/scratch cleanup passed. Client code is
explicitly separate from carried core evidence. Provider container stop succeeded.

The [original receipt](postgres-checks-attempt-7.json) is 61,425 bytes, SHA-256
`151b4ad411e7c153dce32f90fa8924c8c4caf70b385c97728af9ae54d08024d3`.
All sixteen streams decoded with matching lengths/digests. The workflow is
disabled and its QA branch retired before the next repair. No full desktop or
production acceptance is claimed.
