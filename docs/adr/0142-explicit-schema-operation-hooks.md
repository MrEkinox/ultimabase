# ADR-0142: Explicit schema operation hooks

- Status: superseded by ADR-0163
- Date: 2026-08-06
- Refines: ADR-0089, ADR-0104, ADR-0141

## Context

Native schema declarations expose exact operation hooks such as
`beforeCreate`, `afterUpdate`, and `beforeRead`, while also exposing
`beforeOperation`, `afterOperation`, `beforeSave`, and `afterSave`. The broad
hooks add another layer to the lifecycle, make ordering harder to explain, and
duplicate behavior that a developer can place in the exact families they need.

A proposed object-spread utility could copy one callback into every exact
phase. TypeScript resolves a spread call before the surrounding schema has
contextually established its exact fields, so that design loses precise input
and result inference inside `Schema.define`. UltimaBase must not trade concise
syntax for weaker schema typing.

## Decision

Native schema declarations expose only the exact operation hooks:

- `beforeCreate` and `afterCreate`;
- `beforeUpdate` and `afterUpdate`;
- `beforeUpsert` and `afterUpsert`;
- `beforeDelete` and `afterDelete`; and
- `beforeRead` and `afterRead`.

The native schema phases `beforeOperation`, `afterOperation`, `beforeSave`, and
`afterSave` are removed without a replacement utility. Developers explicitly
declare each operation family whose business behavior they want to run.

Cross-family lifecycle phases remain where their semantics are distinct:
`resolveInput`, `validate`, `afterCommit`, and `onError` retain their compatible
family maps. Field-level `beforeSave` and `afterSave` also remain because they
represent one logical value lifecycle rather than a schema operation alias.

ADR-0070's low-level `beforeOperation` and `afterOperation` definitions remain
available to infrastructure plugins. They are not native `Schema.define`
phases. Runtime validates any low-level operation replacement at the common
boundary, including schema identity, terminal kind, selection, and pointer
inclusion.

## Consequences

- A schema operation crosses one native before phase and one native after phase.
- Hook ordering no longer nests generic schema aliases around exact phases.
- Reused behavior is ordinary developer code called from the explicit hooks.
- Inline schema callbacks retain exact field, operation, selection, inclusion,
  and result inference.
- Field save hooks and low-level plugin contributions are deliberately
  unaffected.
