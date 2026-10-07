# @ultimabase/shared

Dependency-light primitives shared by foundational packages.

Allowed content includes branded identifiers, `MaybePromise`, immutable collection helpers, exhaustive checks, and runtime guards reused across foundational boundaries.

This package must not contain application services, schema definitions, query behavior, permissions, infrastructure code, or miscellaneous helpers without a clear cross-package purpose.

## Public primitives

- `Brand<TValue, TName>` distinguishes identifiers and other validated values that share one runtime representation. Schema, Query, Access, Core, and Runtime can define their own brands without coupling Shared to domain names.
- `MaybePromise<TValue>` is the common return contract for plugin factories, hooks, defaults, validators, and lifecycle callbacks.
- `assertNever(value)` enforces exhaustive handling for Schema, Query, operation, access-rule, hook, and plugin-state unions.
- `immutableArray(values)` creates a frozen copy for enum values, indexes, selections, and ordered registries.
- `immutableRecord(value)` creates a frozen copy for field maps, schema metadata, plugin definitions, and normalized options.
- `isPlainRecord(value)` and `isUnknownArray(value)` narrow untrusted containers without unsafe element or property types.
- `assertNonEmptyString(value, path)` and `assertOptionalBoolean(value, path)` protect JavaScript entry points while narrowing their inputs for TypeScript.

The immutable helpers are intentionally shallow. Nested values must be constructed immutably at their own boundary, which keeps behavior explicit and avoids a complex general-purpose deep-freeze implementation.
