# 3501: Replace the phase bridge with one native plan

- Status: completed
- Milestone: 35
- Depends on: 3405
- ADR: ADR-0271

## Goal

Compile the public contribution list once into Core's native immutable plugin
plan and let the lifecycle manager own the resulting application resource.

## Acceptance criteria

- [x] `compilePluginDefinition()` and its phase-bucket option model are removed.
- [x] Each operation, capability, permission, and relationship is normalized
      once before plugin effects.
- [x] The lifecycle manager stores and invokes the exact application resource;
      no compiler-owned resource map or synthetic setup/hooks pair remains.
- [x] Graphs, manifests, declarations, exports, ordering, cleanup, Typegen,
      transports, and JavaScript-without-Typegen behavior retain parity.
- [x] Application resources without public exports may omit `exports`.
- [x] Public hover and diagnostics use contribution-first vocabulary.

## Handoff

- Documentation impact: both. Core's package contract and the public plugin
  authoring guides now describe the native plan and lifecycle-only resources.
- Removed the definition compiler, synthetic setup/hooks lifecycle types,
  operation capability merge pass, and resource `WeakMap`.
- `PluginInstance` and `FrameworkPlugin` now use one named contract instead of
  positional internal-bucket generics; official plugin aliases retain their
  exact identity, exports, environment, peer, privilege, and capability types.
- Focused runtime and type tests pass. Full validation is recorded by issue
  3502.
