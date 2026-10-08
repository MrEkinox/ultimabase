# ADR-0290: Derive plugin privileges instead of restating them

- Status: accepted
- Date: 2026-10-08
- Refines: ADR-0191, ADR-0208, ADR-0270; applies ADR-0288 step 2
- Approval: user validated on 2026-10-08
- Implementation: commit 8b811f32 and its documentation follow-up

## Context

Core already derives every privilege a plugin needs from its contribution
kinds and capability protocols (ADR-0270). Authors must nevertheless restate
each derived privilege in `permissions` with a non-empty human reason; a
missing or unused reason fails plugin construction. Eleven official plugins
carry such maps. The reasons are informational: the application policy
(`pluginPrivileges`) allows or denies privileges, and a denial only refuses
startup. Environmental claims are self-declared and cannot be verified.

## Decision

- Privilege reasons become optional. Core derives the privilege list as today
  and reports it with a generated description of the contribution that needs
  it; an author may still add a reason.
- Two critical privileges keep an explicit declaration because they change
  who may act or what data a plugin owns: `authority:elevate` (Master
  queries) and `storage:private` (owner-private storage). A plugin that
  derives one of them without declaring it fails construction, as today.
- The application policy, the startup report and denial before any plugin
  callback runs are unchanged. `withPluginPrivileges` stays for callbacks that
  use an additional privileged facade.
- Conditional reasons (`when`) are removed: no plugin uses them.

## Preserved boundaries

No privilege implies another. Master stays unforgeable from transport input.
The report remains the single place where an operator sees what installed
plugins can do.
