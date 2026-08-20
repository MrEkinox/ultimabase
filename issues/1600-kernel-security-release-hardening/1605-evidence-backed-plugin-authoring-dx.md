# 1605: Add evidence-backed plugin authoring helpers

- Status: completed
- Milestone: 16
- Packages: `@ultimabase/plugin-kit`, official plugin packages, `@ultimabase/testing`
- Depends on: 1604
- ADR: ADR-0192, ADR-0202, ADR-0204

## Goal

Remove proven repetitive plugin-authoring boilerplate while keeping privileges,
ownership, peers, capabilities, and contribution identities explicit.

## Acceptance criteria

- [x] The open-kernel workflow and official plugins are audited for repetition shared by at least two current concrete consumers.
- [x] Exact plugin factory return types are inferred or expressed through one focused utility instead of maintaining large handwritten `FrameworkPlugin` tuples where inference can preserve the same editor contract.
- [x] Focused Hooks-extension or Access-provider helpers are added only where two compatible implementations repeat the same safe composition.
- [x] Operation, model-surface, and Typegen grouping gains a helper only if current consumers repeat all three steps with the same invariant.
- [x] Every helper keeps privilege names and reasons visible and delegates validation, ownership, provenance, and conflict handling to Core.
- [x] Language-service hover and autocomplete tests protect the reduced authoring surface from source and packed exports.
- [x] Rejected helper candidates and the missing evidence for them are recorded so the issue does not generalize for hypothetical plugins.

## Tests

- [x] Runtime tests prove helpers produce the same owner-attributed declarations and conflicts as their direct Core equivalents.
- [x] Compile-time tests prove exact options, instances, capabilities, peers, model commands, and Typegen contracts remain inferred.

## Audit evidence and decisions

- Seven official module-based plugins repeated public `FrameworkPlugin` return
  contracts or published a type too broad to retain their exact manifest:
  Hooks, Access, ACL permissions, ACL/PostgreSQL, Roles, PostgreSQL, and
  PgVector. They now use the type-only `PluginModuleInstance` mapping with named
  definition properties. Typegen keeps its already focused direct-Core type;
  adding a `plugin-kit` dependency solely to replace that small declaration was
  not justified.
- Privileges and reasons remain named constants at the factory boundary.
  Capability IDs, optional requirements, providers, peers, dependencies,
  environment claims, and setup exports remain explicit in each definition
  contract. The utility performs no Runtime work and every value still enters
  Core through `module.plugin()`.
- The existing `definePluginModule` Runtime test now compares its manifest,
  conflicts, peers, and exact instance identity against direct `definePlugin`
  output. Source and packed language-service tests cover the new type mapping;
  existing official-plugin type tests continue to cover options, populated
  capability tuples, application exports, model commands, and Typegen.
- `acl-permissions` moved its reviewed privilege tuple to its internal contract
  module, reducing the oversized Runtime file from 916 to 902 lines without
  performing the architectural split reserved for issue 1610.

## Rejected helper candidates

- No Hooks-extension helper was added. The audit found only one current
  compatible alternative Hooks implementation, in the open-kernel workflow,
  so there is no second repeated composition invariant.
- No Access-provider helper was added. There is no second current compatible
  Access implementation repeating the official provider wiring.
- No combined operation/model-surface/Typegen helper was added. All three steps
  occur together only in the open-kernel workflow; other operation or Typegen
  consumers repeat only individual steps already covered by focused helpers.
- No capability, peer, privilege, authority, or registry shortcut was added.
  Such helpers would hide security-relevant declarations or recreate a generic
  integration host without present consumers.

## Commands passed

- `yarn typecheck --force`, `yarn test`, `yarn lint`, `yarn format:check`,
  `yarn constraints`, and `yarn build` including attw and publint.
- `yarn test`: 339 files and 1,852 unit/type tests.
- `yarn test:pack:built`: 16 files and 77 packed-consumption tests, including
  the authoring language-service test against the built
  `@ultimabase/plugin-kit` declaration export.

## Out of scope

- Recreating generic registries, service lookup, or string slots.
- Hiding requested privileges or their reasons.
- Creating another Hooks or Access package.
