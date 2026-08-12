# Milestone 14 — Trusted open plugin kernel

- Status: active

Replace the closed setup contribution surface with a trusted, privilege-aware,
versioned capability kernel. Plugins may declare and transform application
contracts, extend Typegen, compose Runtime behavior, and rewrite physical
persistence through public deterministic protocols. JavaScript remains usable
without Typegen, and official plugins use the same public authoring toolbox as
community packages.

## Execution order

1. [x] [1401 — Add plugin manifests and declared privileges](1401-plugin-manifests-and-privileges.md)
2. [x] [1403 — Add versioned capability tokens and requirements](1403-versioned-capability-tokens.md)
3. [x] [1402 — Enforce application privilege policy and startup reporting](1402-privilege-policy-and-reporting.md)
4. [x] [1404 — Compose capability providers, decorators, and replacements](1404-capability-composition.md)
5. [x] [1415 — Converge legacy services, slots, and setup registries](1415-converge-legacy-plugin-host.md)
6. [x] [1405 — Open the static plugin declaration host](1405-static-plugin-declaration-host.md)
7. [x] [1406 — Compile owned schema transformations and provenance](1406-schema-transformations-and-provenance.md)
8. [ ] [1419 — Harden schema declaration correctness and atomicity](1419-schema-declaration-correctness-and-atomicity.md)
9. [ ] [1420 — Align capability phases and declaration contracts](1420-capability-phase-and-contract-alignment.md)
10. [ ] [1421 — Modularize schema declarations and enforce file budgets](1421-modularize-schema-declarations-and-enforce-file-budgets.md)
11. [ ] [1418 — Replace the complete schema compiler through a versioned capability](1418-schema-compiler-replacement-capability.md)
12. [ ] [1407 — Add dynamic schemas, model extensions, and plugin operations](1407-dynamic-schemas-models-and-operations.md)
13. [ ] [1408 — Let plugins contribute exact Typegen contracts](1408-plugin-typegen-contributions.md)
14. [ ] [1409 — Assemble Runtime through public capability middleware](1409-runtime-capability-assembly.md)
15. [ ] [1410 — Separate logical operations from rewritable persistence plans](1410-rewritable-persistence-plans.md)
16. [ ] [1416 — Execute plugin operations and explicit transport bindings](1416-execute-plugin-operations-and-transport-bindings.md)
17. [ ] [1417 — Add adapter, codec, physical schema, and migration bridges](1417-adapter-codec-schema-migration-bridges.md)
18. [ ] [1411 — Publish the plugin authoring toolbox](1411-plugin-authoring-toolbox.md)
19. [ ] [1412 — Add plugin conformance testing utilities](1412-plugin-conformance-testing.md)
20. [ ] [1413 — Prove workflow, value-codec, and JavaScript plugins](1413-open-kernel-proof-plugins.md)
21. [ ] [1414 — Verify the trusted open plugin kernel](1414-open-plugin-kernel-verification.md)

The frozen constraints, supervision checkpoints, and cross-milestone resume
order live in [`CURRENT_PLAN.md`](../../CURRENT_PLAN.md).
