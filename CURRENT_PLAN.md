# Active plan: trusted open plugin kernel and optional official capabilities

- Status: active
- Started: 2026-08-11
- Objective owner: `@ultimabase/core`, `@ultimabase/plugin-kit`, `@ultimabase/typegen`, `@ultimabase/testing`, official plugins
- Milestones:
  - [14 — Trusted open plugin kernel](issues/1400-open-plugin-kernel/README.md)
  - [15 — Optional Hooks and Access plugins](issues/1500-optional-hooks-access/README.md)
- Previous completed plan: [Query execution and enforcement consolidation](docs/plans/completed/query-execution-and-enforcement-consolidation.md)
- Paused objectives:
  - [ACL hardening and developer-experience consolidation](docs/plans/paused/acl-hardening-and-developer-experience-consolidation.md)
  - [Generated schema authoring and type contracts](docs/plans/paused/generated-schema-authoring-and-type-contracts.md)

## Objective

Turn UltimaBase's deterministic plugin graph into a trusted open microkernel in
which official and community plugins can declare, transform, decorate, or
replace application capabilities through explicit privileges. Preserve a
no-Typegen JavaScript Runtime and exact generated TypeScript contracts without a
generated client. Then prove the public kernel by moving Hooks and Access into
optional official plugins while keeping Core master authority unchanged.

## Frozen constraints

- Installed plugins are trusted in-process Node.js code; the privilege system controls UltimaBase facades and reports powers but does not claim an OS sandbox.
- Every concrete privilege is resolved and reported before static declarations, Typegen, setup, connections, Runtime, or transports.
- `pluginPrivileges` defaults to allowing requested powers and supports cumulative global, plugin-ID, and exact-instance privilege and environment-claim denials; denied plugins fail together with one typed diagnostic.
- Capability tokens are namespaced, versioned, application-local, and declare `single`, `multiple`, or `pipeline` cardinality.
- Capability tokens declare `declaration` or `application` lifetime; resource-backed implementations materialize only during setup and dispose with their owner.
- `provide`, `require`, `decorate`, and `replace` retain owner provenance, graph order, version checks, and explicit conflict behavior.
- Plugin ownership uses a stable plugin ID plus optional explicit instance ID; repeated configured instances never rely on option comparison or concatenated string identity.
- Public string slots, plugin service registries, and generic contribution registries converge into typed capabilities before schema or Runtime expansion continues.
- Static plugin declarations are synchronous, pure, deterministic, infrastructure-free, and separated from secrets and runtime options.
- Developer schemas plus plugin additions and immutable patches form one authoritative compiled application graph.
- Cross-owner changes require explicit transform authority; duplicate or ambiguous changes never use silent last-writer-wins behavior.
- Option ownership conflicts are usage-driven; installed descriptors with no final schema or field occurrence have no effect.
- Static declaration and schema compilation publish one complete application graph or fail terminally without exposing partial plugin additions.
- Selectors observe the graph completed by earlier plugins and freeze targets before the current plugin's patches; Core identity fields require the complete compatible schema-compiler replacement delivered by issue 1418.
- Schema handle surfaces are application-local: conflicts within one graph fail before setup, while independent applications may bind different surfaces to one reusable class without process-global state. Dynamic plugin schemas remain reachable through `ultimabase.schema('Name')`.
- Typegen emits inert declaration contracts only. JavaScript and Runtime never depend on generated files or a generated client.
- Plugins may contribute Typegen references, structured declarations, or separately owned outputs only through the matching privilege and deterministic fingerprint.
- Typegen-owned output is limited to inert declarations and non-executable metadata; it never emits JavaScript or a Runtime client.
- Logical operations remain distinct from adapter persistence plans. Soft delete rewrites a physical plan without becoming a nested public update.
- Protected guards, filters, constraints, and field restrictions remain monotonic and cannot be broadened by ordinary middleware or persistence rewrites.
- Declaring a custom operation never exposes it through a transport automatically.
- Stable and dynamic operations execute through application handles; transport exposure additionally requires privilege, a compatible binding and wire codec, and explicit exposure configuration.
- Master authority and master-key elevation remain in Core. No dependency, Runtime replacement, persistence rewrite, Access provider, or transport inherits master authority.
- Persisted plugin contributions retain owner and version provenance. Removing a plugin never drops data automatically.
- Plugin upgrades contribute explicit logical migration intent; missing upgrade paths and orphaned removals never fall back to destructive synchronization.
- Core owns mandatory security and ownership primitives. Reusable ergonomics belong to `@ultimabase/plugin-kit`; conformance belongs to `@ultimabase/testing`.
- Official plugins use only public Core, plugin-kit, Typegen, and testing contracts. No private official-plugin path is allowed.
- No `any`, deep package import, mutable process-global registry, silent compatibility alias, or infrastructure dependency in Core is introduced.
- Handwritten production and test files obey reviewed size budgets; temporary exceptions are centralized, cannot grow, and are removed through focused maintenance issues.
- Every issue receives a dedicated commit and no push occurs without explicit user confirmation.

## Execution order

### Phase 1 — Manifests, privileges, and capability graph

1. [x] [1401 — Add plugin manifests and declared privileges](issues/1400-open-plugin-kernel/1401-plugin-manifests-and-privileges.md)
2. [x] [1403 — Add versioned capability tokens and requirements](issues/1400-open-plugin-kernel/1403-versioned-capability-tokens.md)
3. [x] [1402 — Enforce application privilege policy and startup reporting](issues/1400-open-plugin-kernel/1402-privilege-policy-and-reporting.md)
4. [x] [1404 — Compose capability providers, decorators, and replacements](issues/1400-open-plugin-kernel/1404-capability-composition.md)
5. [x] [1415 — Converge legacy services, slots, and setup registries](issues/1400-open-plugin-kernel/1415-converge-legacy-plugin-host.md)

### Phase 2 — Open static application compilation

6. [x] [1405 — Open the static plugin declaration host](issues/1400-open-plugin-kernel/1405-static-plugin-declaration-host.md)
7. [x] [1406 — Compile owned schema transformations and provenance](issues/1400-open-plugin-kernel/1406-schema-transformations-and-provenance.md)
8. [x] [1419 — Harden schema declaration correctness and atomicity](issues/1400-open-plugin-kernel/1419-schema-declaration-correctness-and-atomicity.md)
9. [x] [1420 — Align capability phases and declaration contracts](issues/1400-open-plugin-kernel/1420-capability-phase-and-contract-alignment.md)
10. [x] [1421 — Modularize schema declarations and enforce file budgets](issues/1400-open-plugin-kernel/1421-modularize-schema-declarations-and-enforce-file-budgets.md)
11. [x] [1422 — Define the callback-free schema compiler IR](issues/1400-open-plugin-kernel/1422-callback-free-schema-compiler-ir.md)
12. [x] [1423 — Run the canonical schema compiler through the public IR](issues/1400-open-plugin-kernel/1423-canonical-schema-compiler-ir.md)
13. [x] [1418 — Replace the complete schema compiler through a versioned capability](issues/1400-open-plugin-kernel/1418-schema-compiler-replacement-capability.md)
14. [x] [1407 — Add dynamic schemas, model extensions, and plugin operations](issues/1400-open-plugin-kernel/1407-dynamic-schemas-models-and-operations.md)
15. [ ] [1408 — Let plugins contribute exact Typegen contracts](issues/1400-open-plugin-kernel/1408-plugin-typegen-contributions.md)

### Phase 3 — Runtime, persistence, and community toolbox

16. [ ] [1409 — Assemble Runtime through public capability middleware](issues/1400-open-plugin-kernel/1409-runtime-capability-assembly.md)
17. [ ] [1410 — Separate logical operations from rewritable persistence plans](issues/1400-open-plugin-kernel/1410-rewritable-persistence-plans.md)
18. [ ] [1416 — Execute plugin operations and explicit transport bindings](issues/1400-open-plugin-kernel/1416-execute-plugin-operations-and-transport-bindings.md)
19. [ ] [1417 — Add adapter, codec, physical schema, and migration bridges](issues/1400-open-plugin-kernel/1417-adapter-codec-schema-migration-bridges.md)
20. [ ] [1411 — Publish the plugin authoring toolbox](issues/1400-open-plugin-kernel/1411-plugin-authoring-toolbox.md)
21. [ ] [1412 — Add plugin conformance testing utilities](issues/1400-open-plugin-kernel/1412-plugin-conformance-testing.md)
22. [ ] [1413 — Prove workflow, value-codec, and JavaScript plugins](issues/1400-open-plugin-kernel/1413-open-kernel-proof-plugins.md)
23. [ ] [1414 — Verify the trusted open plugin kernel](issues/1400-open-plugin-kernel/1414-open-plugin-kernel-verification.md)

### Phase 4 — Optional Hooks engine

22. [ ] [1501 — Move hook authoring contracts into hooks-plugin](issues/1500-optional-hooks-access/1501-hooks-plugin-authoring-contracts.md)
23. [ ] [1502 — Move hook execution into hooks-plugin](issues/1500-optional-hooks-access/1502-hooks-plugin-runtime.md)
24. [ ] [1503 — Prove no-Hooks and alternative-Hooks applications](issues/1500-optional-hooks-access/1503-hooks-optional-alternative-proof.md)

### Phase 5 — Optional Access engine

25. [ ] [1504 — Move Access authoring and plans into access-plugin](issues/1500-optional-hooks-access/1504-access-plugin-authoring-plans.md)
26. [ ] [1505 — Move Access execution into access-plugin](issues/1500-optional-hooks-access/1505-access-plugin-runtime.md)
27. [ ] [1506 — Adapt ACL, roles, and PostgreSQL policy integrations](issues/1500-optional-hooks-access/1506-policy-provider-migration.md)
28. [ ] [1507 — Prove no-Access, alternative-Access, and Core Master](issues/1500-optional-hooks-access/1507-access-optional-alternative-proof.md)
29. [ ] [1508 — Remove superseded native Hooks and Access surfaces](issues/1500-optional-hooks-access/1508-native-hooks-access-removal-audit.md)
30. [ ] [1509 — Verify optional official capability extraction](issues/1500-optional-hooks-access/1509-optional-capabilities-verification.md)

## Supervision checkpoints

- After 1402: review the complete privilege vocabulary, default policy, startup report, capability-conditioned Typegen privileges, and failure diagnostics before exposing privileged facades.
- After 1404: review capability identity, version compatibility, cardinality, decoration, replacement, and dependency semantics before changing schema compilation.
- After 1415: verify every public slot, service, and generic setup registry has one privilege-aware replacement before opening schema declarations.
- During 1406: stop on any silent cross-owner mutation, nondeterministic selector, global schema leak, or automatic destructive removal.
- During 1419: reject unused-option conflicts, instance-erasing identities, partial schema publication, retryable failed applications, or order-sensitive JSON selectors.
- During 1420: preserve setup-only peer composition while preventing pre-setup compilers and application factories from reading the wrong requirement phase.
- During 1421: accept only behavior-neutral module moves, decreasing file-size exceptions, unchanged public exports, and no duplicated compiler invariant.
- During 1422 and 1423: reject executable IR values, cross-application artifact references, canonical compiler bypasses, or behavior drift before replacement is enabled.
- During 1418: reject any partial compiler hook, parallel registry, canonical-first transform, or replacement output that bypasses Core ownership, identity, provenance, or portability validation.
- After 1408: demonstrate first generation, stale regeneration, plugin-contributed complex types, and JavaScript operation without Typegen; no generated Runtime client is accepted.
- During 1410: preserve logical operation semantics, protected constraints, automatic transaction behavior, itemized batches, and adapter target restrictions.
- After 1417: demonstrate direct and fake-transport operation execution, adapter capability negotiation, raw lease safety, upgrade provenance, and no-Typegen JavaScript before publishing convenience helpers.
- After 1412: review the public plugin-kit and conformance API from a community author's perspective before official plugins depend on it.
- After 1414: milestone 15 cannot start until workflow, value-codec, JavaScript, privilege denial, application isolation, packed exports, and complete PostgreSQL proofs pass.
- During 1501 through 1507: stop on any official-plugin private import, hidden Core dispatcher, neutral placeholder, master relocation, or community-inaccessible capability.
- Before 1508: prove no-Hooks, alternative-Hooks, no-Access, alternative-Access, ACL, roles, PostgreSQL, and trusted Master behavior through built public package exports.
- After 1509: archive this plan only when both milestone READMEs, ADR refinement links, documentation, examples, and paused-objective resume points reflect the delivered architecture.

## Completion gate

- Every issue and dependency is complete with a dedicated commit.
- Core exposes one versioned privilege and capability kernel with deterministic application-local ownership and structured inspection.
- The capability kernel is the only public cross-plugin host; string slots, plugin service registries, and generic contribution registries are gone.
- Plugins can add and transform schemas, fields, options, models, operations, Typegen contracts, middleware, codecs, constraints, and persistence plans through public APIs.
- JavaScript runs the proof applications without Typegen; TypeScript receives exact source and packed autocomplete without a generated client.
- `@ultimabase/plugin-kit` removes proven official/community authoring duplication without hiding privileges or ownership.
- `@ultimabase/testing` validates deterministic declarations, privilege enforcement, lifecycle cleanup, Typegen parity, application isolation, JavaScript fallback, and packed exports.
- Hooks and Access are absent from Core's public product vocabulary and exist as optional official plugins with alternative-engine proofs.
- ACL, roles, authentication-facing context contracts, PostgreSQL constraints, master behavior, automatic transactions, and protected monotonicity retain their accepted guarantees.
- Repository typecheck, tests, lint, formatting, constraints, build, package archives, coverage, and complete PostgreSQL E2E pass.
