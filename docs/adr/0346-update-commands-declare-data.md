# ADR-0346: Update commands declare their data

- Status: accepted
- Date: 2026-10-18
- Refines: ADR-0316 (plugin facade, `command()`); applies ADR-0288
- Approval: defect found by the plugin-kit own-tests pass; fix chosen by the user on 2026-10-18

## Context

`command({ authority, effect: 'update' })` accepted a missing `data` and wrote `{}`. Core refuses every update schema
mutation that does not return one non-empty data object, so such a command failed on every run with
`PLUGIN_OPERATION_INVALID`, and the caller saw only "The requested operation could not be completed.". Fixtures in
plugin-kit and Access tests declared commands like this and could never have run.

## Decision

`command()` refuses an update without `data` when it is declared, with the message
`update commands must declare data: the values each row receives`, as it already refuses a delete with `data`. The
`data` option documents that it is required for updates and forbidden for deletes. The static type is unchanged.

## Consequences

- A plugin author learns the mistake when the plugin is defined, not when a user calls the command.
- Test fixtures that declared data-less updates now declare the field they write.
- **Documentation impact:** both: the Build a Plugin page and this record.
