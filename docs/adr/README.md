# Architecture decision records

Status values are `proposed`, `accepted`, `deprecated`, and `superseded`.

Accepted records:

- [ADR-0001: Monorepo and package direction](0001-monorepo-and-package-direction.md)
- [ADR-0002: Static schemas and typed extensions](0002-static-schemas-and-typed-extensions.md)
- [ADR-0003: Global plugin graph with nested composition](0003-global-plugin-graph.md)
- [ADR-0004: One operation engine](0004-one-operation-engine.md)
- [ADR-0005: Immutable class-based public API](0005-immutable-class-api.md)
- [ADR-0006: Access-control plugins](0006-access-control-plugins.md)
- [ADR-0007: PostgreSQL and Drizzle boundary](0007-postgres-drizzle-boundary.md)
- [ADR-0008: Database-specific migration plugins](0008-database-specific-migrations.md)
- [ADR-0009: HTTP servers are plugins](0009-http-server-plugins.md)
- [ADR-0010: GraphQL Core and Yoga](0010-graphql-core-and-yoga.md)
- [ADR-0011: Node ESM toolchain](0011-node-esm-toolchain.md)
- [ADR-0012: Vitest and PostgreSQL isolation](0012-vitest-postgres-isolation.md)
- [ADR-0013: Access modes and master authority](0013-access-modes-and-master.md)
- [ADR-0014: Data naming and system fields](0014-data-conventions.md)
- [ADR-0015: Hook order and transaction boundary](0015-hook-order-and-transactions.md)
- [ADR-0016: Controlled public exports](0016-controlled-public-exports.md)
- [ADR-0019: Operation-specific schema inference](0019-operation-specific-schema-inference.md)
- [ADR-0021: Field list metadata](0021-field-list-metadata.md)
- [ADR-0022: Generator-neutral type identities](0022-generated-type-identities.md)
- [ADR-0023: Portable UUID fields](0023-portable-uuid-fields.md)
- [ADR-0024: Separate integer and float fields](0024-separate-numeric-fields.md)
- [ADR-0025: Exact bigint fields](0025-exact-bigint-fields.md)
- [ADR-0026: Explicit temporal field representations](0026-explicit-temporal-representations.md)
- [ADR-0027: Native binary values](0027-native-binary-values.md)
- [ADR-0028: Exact decimal strings](0028-exact-decimal-strings.md)
- [ADR-0029: Plugin-defined logical fields](0029-plugin-defined-logical-fields.md)
- [ADR-0030: Runtime schema declaration boundaries](0030-runtime-schema-declaration-boundaries.md)
- [ADR-0031: Plugin validation issue codes](0031-plugin-validation-issue-codes.md)
- [ADR-0032: Object list update replacement](0032-object-list-update-replacement.md)
- [ADR-0033: Field factory provenance and snapshot capabilities](0033-field-factory-provenance.md)
- [ADR-0034: Object defaults use create-input presence](0034-object-default-create-presence.md)
- [ADR-0036: Colocated package tests](0036-colocated-package-tests.md)
- [ADR-0037: Shared guards and Schema normalization primitives](0037-schema-normalization-primitives.md)
- [ADR-0038: Static and runtime field defaults](0038-static-and-runtime-field-defaults.md)
- [ADR-0039: Structural validation plans reference declared fields](0039-structural-validation-plans.md)
- [ADR-0040: Explicit temporal autoNow generation](0040-explicit-temporal-auto-now.md)
- [ADR-0041: Public field snapshot boundary](0041-public-field-snapshot-boundary.md)
- [ADR-0042: Framework error boundary](0042-framework-error-boundary.md)
- [ADR-0043: Typed service token identity](0043-typed-service-token-identity.md)
- [ADR-0044: Isolated service registries](0044-isolated-service-registry.md)
- [ADR-0045: Static typed plugin definitions](0045-static-typed-plugin-definitions.md)
- [ADR-0046: Plugin normalization and exclusive slots](0046-plugin-normalization-and-exclusive-slots.md)
- [ADR-0047: Deterministic plugin graph resolution](0047-deterministic-plugin-graph-resolution.md)
- [ADR-0048: Owner-scoped plugin setup registries](0048-owner-scoped-plugin-setup-registries.md)
- [ADR-0049: Deterministic plugin lifecycle](0049-deterministic-plugin-lifecycle.md)
- [ADR-0050: Isolated FrameworkApplication boundary](0050-isolated-framework-application.md)
- [ADR-0051: Plugin-owned extension handlers](0051-plugin-owned-extension-handlers.md)
- [ADR-0052: Typed transport-neutral Query AST](0052-typed-transport-neutral-query-ast.md)
- [ADR-0053: Field-kind filter capabilities](0053-field-kind-filter-capabilities.md)
- [ADR-0054: Deterministic logical filter normalization](0054-logical-filter-normalization.md)
- [ADR-0055: Deterministic query clause normalization](0055-deterministic-query-clause-normalization.md)
- [ADR-0056: Protected opaque Query cursors](0056-protected-opaque-query-cursors.md)
- [ADR-0057: Independent Query limit and pagination position](0057-independent-query-limit.md)
- [ADR-0058: Immutable unbound Query builder](0058-immutable-unbound-query-builder.md)
- [ADR-0059: Terminal Operation AST](0059-terminal-operation-ast.md)
- [ADR-0060: Typed atomic update expressions](0060-typed-atomic-update-expressions.md)
- [ADR-0061: Neutral BoundQuery facade](0061-neutral-bound-query-facade.md)
- [ADR-0062: Request context security boundary](0062-request-context-security-boundary.md)
- [ADR-0063: Portable database adapter boundary](0063-portable-database-adapter-boundary.md)

Superseded records:

- [ADR-0017: Composite fields and PostgreSQL storage](0017-composite-fields-and-postgres-storage.md), superseded by ADR-0021.
- [ADR-0018: Default value boundaries](0018-default-value-boundaries.md), superseded by ADR-0038.
- [ADR-0020: Compiled validation plans](0020-compiled-validation-plans.md), superseded by ADR-0039.
- [ADR-0035: Schema domain-oriented internal layout](0035-schema-domain-layout.md), superseded by ADR-0036.

New decisions receive the next number. Do not rewrite history; supersede a record.
