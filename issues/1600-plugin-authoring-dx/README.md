# Milestone 16 — Community plugin authoring DX

- Status: ready
- Depends on: 1509

Make the common plugin-authoring path substantially smaller without weakening
the explicit ownership, privilege, application-isolation, Typegen, or adapter
boundaries proven by milestones 14 and 15. Core remains the low-level kernel;
`@ultimabase/plugin-kit` owns reusable ergonomics backed by concrete official
and proof-plugin usages.

Milestone 15 completed the Hooks and Access extraction in issue 1509. This
milestone is ready at issue 1601; its helpers must be tested against those final
public contracts rather than superseded native Core surfaces.

## Execution order

1. [ ] [1601 — Refine inactive host privileges](1601-refine-inactive-host-privileges.md)
2. [ ] [1604 — Infer public plugin instance types](1604-infer-plugin-instance-types.md)
3. [ ] [1603 — Accept Standard Schema plugin options](1603-standard-schema-plugin-options.md)
4. [ ] [1602 — Compose schema and model command authoring](1602-command-authoring-helpers.md)
5. [ ] [1605 — Publish a portable field-plugin authoring helper](1605-portable-field-plugin-helper.md)

## Frozen constraints

- Privileges and their human-readable reasons remain explicit in the manifest;
  helpers never grant, infer, or hide authority.
- Helpers compose existing public Core protocols and do not create a parallel
  registry, executable Typegen client, global plugin state, or private official
  plugin path.
- Model and schema commands remain application-local and execute through the
  same operation and `RequestEngine` pipeline.
- Portable field authoring remains separate from adapter storage, physical
  schema, query compilation, and migration contributions.
- New abstractions must remove duplication across current concrete consumers;
  they do not anticipate hypothetical plugin families.
