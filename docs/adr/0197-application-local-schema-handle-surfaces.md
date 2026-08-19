# ADR-0197: Schema handle surfaces are application-local

- Status: accepted
- Date: 2026-08-12
- Supersedes: ADR-0187 cross-application surface compatibility only
- Refines: ADR-0192
- Depends on: ADR-0187, ADR-0192
- Refined by: ADR-0201

## Context

ADR-0187 required an early error when one reusable schema class received
incompatible public plugin surfaces across applications. ADR-0192 subsequently
placed every application-conditional command and query extension on an
application-owned handle rather than on that class or its prototype.

Enforcing the earlier cross-application rule would require Core to remember a
surface fingerprint for each schema class at process scope. Compilation would
then depend on which unrelated application happened to compile first. That
mutable global ledger conflicts with application isolation and with ADR-0187's
own prohibition on process-global schema, model, or Typegen registries.

## Decision

Schema and model handle surfaces are compatible within one compiled application
graph, not across independent applications. Core rejects duplicate, reserved,
undeclared, or otherwise conflicting commands and query extensions before setup
inside that graph.

The same exported schema class may be reused by another application with a
different final handle surface. Each application owns its compiled descriptors,
handles, operation bindings, generated declarations, and Runtime execution.
Neither application mutates the shared class or prototype, and neither records
compatibility state in a process-global ledger.

This decision changes only application-conditional handle surfaces. The
application-local schema definition and field-materialization compatibility
rules accepted by ADR-0175 remain unchanged.

## Consequences

- Application compilation is independent of process history and test order.
- Different applications may intentionally expose different commands for the
  same stable schema package.
- Typegen describes the selected application's handles rather than imposing one
  process-wide surface on a reusable class.
- Conflicts inside one application still fail deterministically before setup.

## Rejected alternatives

### A private process-global `WeakMap`

Weak keys avoid retaining schema classes, but the map remains mutable global
state and makes compilation depend on previously created applications.

### An explicitly shared compatibility registry

This would add a developer-managed coordination API without protecting a
current invariant: handles are already isolated and never mutate the shared
class. A future cross-application deployment contract may introduce an explicit
artifact only after demonstrating that need.

## Non-goals

- Relaxing conflicts within one application graph.
- Allowing application plugins to mutate schema classes or prototypes.
- Changing schema field declarations, persisted provenance, or migration rules.
