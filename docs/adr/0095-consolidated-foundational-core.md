# ADR-0095: Consolidated foundational Core package

- Status: accepted
- Date: 2026-08-02
- Refines: ADR-0001, ADR-0005, ADR-0016, ADR-0061, ADR-0089, ADR-0093, ADR-0094

## Context

UltimaBase originally published Schema, Query, Access, Core, and Runtime as five
foundational packages. Their dependency direction documented useful internal
responsibilities, but the packages are versioned together and form one
inseparable framework for application developers.

Native hooks exposed the concrete cost of the physical split. A schema-level
`beforeFind` handler needs the exact `Query<TSchema>` type, while Query already
depends on schema field inference. Keeping both packages would require a
circular dependency, module augmentation that only works when another package
has already been loaded, a duplicated structural Query interface, or another
published contracts package. Each workaround makes the public API or its
maintenance worse solely to preserve package boundaries.

Access contracts have the same problem after consolidation: Access currently
depends on Schema while Core depends on Access. Keeping it separate would
replace one cycle with another even though authority contracts are required by
every Runtime request.

The project is still pre-release. Compatibility wrappers would therefore add
imports, manifests, builds, archives, release coordination, and documentation
without protecting a stable consumer contract.

## Decision

`@ultimabase/core` owns the complete foundational framework API:

```text
@ultimabase/core
├── schema
├── query
├── access
├── application and plugins
└── runtime
```

These remain explicit internal domains with directed relative imports and
focused tests. Package consolidation does not allow Query code to execute
operations, Schema code to compile SQL, or Runtime code to import concrete
plugins. The root public entry point deliberately re-exports the supported API
from every domain; internal folders do not become public subpath exports.

`@ultimabase/shared` remains a separate dependency-free foundation for generic
runtime and TypeScript utilities. Database adapters, migrations, transports,
GraphQL integrations, HTTP servers, permission systems, roles, testing tools,
and community fields remain optional packages above Core.

The pre-release `@ultimabase/schema`, `@ultimabase/query`,
`@ultimabase/access`, and `@ultimabase/runtime` packages are removed rather than
retained as compatibility facades. Consumers import `Schema`, fields, `Query`,
authority contracts, `UltimaBase`, engines, and hook APIs from
`@ultimabase/core`.

Native hook declarations are owned directly by the schema domain. Because
Schema and Query now share one package, `new Schema({ hooks })` can contextually
expose the real `Query<TSchema>`, operation AST, and result contracts without a
cycle or a parallel interface. Inline field hooks remain value-focused and
their immutable callback storage stays outside `FieldDefinition` inference and
physical schema metadata. Runtime resolves both declaration capabilities
internally and composes them with plugin contributions.

## Consequences

The regular developer imports become cohesive:

```ts
import { Query, Schema, UltimaBase, stringField } from '@ultimabase/core'
```

Schema, Query, hooks, and Runtime can share exact private and public contracts
without circular workspace dependencies. One foundational package is built,
packed, versioned, documented, and tested instead of five synchronized
packages. Official plugins have fewer direct dependencies and cannot select
incompatible foundational versions.

The larger Core package makes internal discipline more important. Directory
ownership, public-export tests, dependency linting, and the architectural ADRs
continue to prohibit infrastructure imports and cross-domain execution leaks.
Bundle-size isolation is not a goal for the Node-only framework; optional
infrastructure remains isolated at the plugin package boundary where it has a
real dependency and installation cost.
