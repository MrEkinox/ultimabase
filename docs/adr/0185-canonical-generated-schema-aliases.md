# ADR-0185: Generated schema aliases expose canonical values only

- Status: superseded
- Superseded by: ADR-0297 (Typegen removed in migration step 6.8b, 2026-10-13)
- Date: 2026-08-11
- Refines: ADR-0173, ADR-0177

## Context

Typegen emits canonical named values and operation inputs such as `TodoItem`,
`TodoCreateInput`, and `TodoWhereInput`. It also emits `TodoAccess` and
`TodoHooks` object types whose properties only point back to those existing
aliases.

Core does not consume those wrapper types. Exact schema Access and hook
callbacks are derived contextually from the module-augmented
`Schemas.<Name>` contract. The wrappers therefore duplicate public paths,
suggest that they describe complete callback inputs when they do not include
context or operation details, and enlarge every generated declaration.

## Decision

Typegen emits standalone aliases only for canonical schema values and public
operation inputs. It does not emit per-schema `*Access` or `*Hooks` wrappers.

Inline Access and hook declarations continue to receive exact contextual types
from Core. Extracted application code may name the canonical generated value it
needs directly, such as `TodoItem`, `TodoWhereInput`, or
`Schemas.Todo['inputs']['update']`.

The Typegen generator version changes with this declaration-surface removal so
an existing generated fingerprint cannot identify both output formats.

## Consequences

- Each generated schema fact retains one meaningful named value or registry
  path instead of an additional Access or hook wrapper path.
- Access and hook autocomplete, hover types, and runtime behavior remain
  unchanged.
- Application code that explicitly imported a generated `*Access` or `*Hooks`
  alias must use the corresponding canonical value or registry path.
- Removing the aliases is an intentional pre-release Typegen API change.
