# ADR-0223: Application field validation is an optional plugin

- Status: accepted
- Date: 2026-09-02
- Refines: ADR-0219, ADR-0221
- Depends on: ADR-0199, ADR-0211, ADR-0213, ADR-0214, ADR-0216, ADR-0219, ADR-0221

## Context

ADR-0219 replaced Core's closed field-constraint language with one synchronous
Standard Schema V1 validator on the direct field `validation` option. ADR-0221
then gave that application validator one exact meaning: reject a final mutation
candidate once after every input transformer, without replaying it during reads
or result materialization.

Those decisions fixed the developer contract and execution semantics, but they
left the application rule owned by Core. Core consequently publishes the
Standard Schema compatibility types, reserves and normalizes `validation`,
retains executable validators in field options, invokes them from its mandatory
final mutation stage, maps their issues, and detects validated arithmetic.
Every application carries that product behavior even when it declares no field
validator.

This ownership is broader than Core's trusted-kernel role. `required`,
nullability, canonical types, list and object shape, enum domains, pointers,
defaults, generators, immutable and generated rules, decimal precision and
scale, codecs, and structural snapshots describe framework data integrity.
A developer-supplied Standard Schema value adds an application policy over an
already canonical complete value. It can be optional without weakening Core's
structural authority.

The open plugin kernel already supports application-local direct field options,
opaque callback-bearing values, generated `this`-based option types,
deterministic application capabilities, callback attribution, and generic
Runtime behavior. The current behavior protocol does not, however, expose a
rejection-only target-aware boundary at ADR-0221's exact position. Its
`beforeOperation` and prepared-target observers run after value-dependent
enforcement, while input transformers may replace the operation. Reusing either
would change validation or Access ordering.

## Decision

### Core owns structure; the plugin owns application validation

Core keeps all mandatory structural responsibilities:

- required create presence, canonical nullability, and generated input types;
- scalar runtime types and canonical representations;
- lists, embedded objects, unknown-field rejection, enum domains, pointers,
  relations, and exact schema identity;
- defaults, generators, immutable and generated operations;
- decimal precision and scale, plugin-field snapshots, and storage codecs;
- repeatable structural validation plans and snapshots at mutation, adapter,
  materialization, inclusion, and result boundaries; and
- transaction, target preparation, cancellation, enforcement, and persistence
  orchestration.

The optional official `@ultimabase/validation-plugin` package owns only
application field validation:

- the direct `validation` option and `FieldValidationOption<TOptions>` public
  type;
- Standard Schema V1 shape and exact input/output compatibility checks;
- immutable identity retention for the opaque validator;
- application-local plan compilation and exact-once traversal;
- synchronous rejection-only execution and validator contract diagnostics;
- stable `field.validation` issue mapping and path prefixing; and
- selection and checking of projected complete arithmetic values that have a
  declared validator.

The package depends toward Plugin Kit, Core, Shared, and the types-only
`@standard-schema/spec` contract. Core never imports it or Plugin Kit. Plugin
Kit's independent Standard Schema support for parsing plugin configuration is
unchanged; it is not the field-validation engine.

`validationPlugin()` installs the option and behavior explicitly. Importing the
package alone installs nothing. The plugin exposes no provider contribution
protocol, global default, schema-wide validator, or second field option.
Community plugins remain free to implement different validation experiences
through the generic kernel rather than contributing to the official engine.

### The direct option is application-local

The plugin contributes `validation` as one direct opaque field option. Its
Typegen declaration uses `FieldValidationOption<this>` so the validator input
accepts and its output remains assignable to the field's complete canonical
non-null value. The existing readonly-container relaxation and `any` rejection
move with that type. Relation handles continue to reject the option.

Direct option completion and exact declaration compatibility are separate
type-only concerns. A schema-option Typegen descriptor may therefore name one
plugin-owned compatibility type in the same module as its public option type.
Typegen connects that inert reference to Core's generic declaration-merging
target, and field factories evaluate the resulting boolean checks against the
exact inferred options and scalar value. The validation plugin uses this hook
to reject incompatible or `any`-based Standard Schema contracts. Core neither
names `validation` nor imports Standard Schema, and the hook cannot retain or
execute a callback at Runtime.

Typegen emits the option only for an application graph containing
`validationPlugin()`. A Typegen-free JavaScript application may still declare
the option, but application compilation recognizes it only when the plugin is
installed. An untyped or stale declaration using `validation` without the
plugin fails as an unknown field option. A declaration with no `validation`
needs no plugin and uses Core structural validation alone.

The compiler retains the exact validator as owner-attributed opaque application
state. It never serializes the callback into compiler IR, Typegen output,
fingerprints, or adapter metadata, and it never invokes it during declaration,
static compilation, setup, or connection.

### A generic final mutation-input guard preserves ordering

Before extraction, Core adds one generic rejection-only Runtime behavior stage
after mandatory final structural mutation validation and before
value-dependent enforcement reevaluation. The stage receives the final
structurally validated logical mutation plus its stable singular target or
explicitly prepared bulk targets. A handler returns no replacement value: it
may only continue or reject.

The order becomes:

```text
normalization
→ initial Core structural validation
→ initial monotonic enforcement and target preparation
→ field and schema input resolution
→ target-aware prepared-operation transforms
→ mandatory final Core structural validation
→ optional final mutation-input guards
→ value-dependent enforcement reevaluation
→ observers and persistence
```

Providers compose sequentially in deterministic plugin graph order through the
existing Runtime behavior capability and require the existing
`runtime:intercept` privilege. The behavior capability advances to `3.0.0`; no
legacy parallel protocol remains. No provider means no composed guard or
placeholder allocation. The boundary is generic and does not name Standard
Schema, fields, or the official validation package.

Core's canonical Runtime invokes the guard for anonymous and Master mutations.
Master bypasses authorization policy only. Validation failures, validator
contract failures, transactions, hooks, database constraints, and integrity
maintenance remain active.

### Single-pass and arithmetic semantics do not change

For every create, update, and upsert candidate, the installed plugin validates
each complete present non-null declared field occurrence once after all input
resolution. It preserves deterministic nested object and list order, passes
Core's immutable canonical value to Standard Schema, rejects promises and
observable transformations, discards equal cloned output, and retains the
issue and diagnostic rules from ADR-0219 and ADR-0221.

Reads, adapter output, materializations, inclusions, behavior result
replacements, mutation outcomes, and final projections execute only Core
structural snapshots. They never invoke the optional application validator.

Core continues to own canonical update-expression and numeric semantics. The
plugin reuses those semantics to validate a projected complete arithmetic value
from stable prepared targets while retaining the original logical and physical
atomic delta. It requests bulk targets only when the compiled application has a
validator on an affected arithmetic field. The existing targetless upsert and
unprepared bulk branches fail closed rather than validate a delta, load targets
implicitly, or skip validation.

The runtime wire code remains `field.validation` so transports and clients do
not need a behavioral migration. Its explicit product-facing type moves to the
plugin; Core's generic `AnyValidationIssueCode` continues to admit namespaced
plugin issues while its closed structural `ValidationIssueCode` no longer owns
application validation.

### Extraction is atomic and pre-release

Issue 2202 first establishes and verifies the generic Runtime boundary while
the current Core implementation remains authoritative. Issue 2203 then moves
the entire Standard Schema field-validation vertical in one change: package,
option, public types, compiler, Runtime execution, arithmetic handling, issue
ownership, dependencies, tests, examples, generated declarations, and docs.

The same change removes Core's superseded `validation` key, Standard Schema
field types and dependency, application-validation execution mode, exports,
tests, and documentation. There is no implicit plugin installation,
compatibility alias, deprecated Core option, or dual execution path. UltimaBase
is pre-release, and a partial compatibility layer would create two authorities.

## Consequences

- Core remains useful and structurally safe without application validation.
- Developers pay for Standard Schema field behavior only when they explicitly
  install the plugin.
- `required` stays universally available and continues to control presence and
  nullability independently from optional validation.
- The direct `validation` syntax and its accepted Runtime meaning remain stable
  for applications that install the plugin.
- Generated TypeScript contracts accurately show whether an application owns
  the option; JavaScript receives the same application-compilation guard.
- The plugin can be replaced by a community alternative without creating a Core
  extension route or an official provider ecosystem.
- The Runtime kernel gains one narrow, reusable rejection-only mutation
  boundary and no validation-product vocabulary.
- Applications currently using `validation` must add `validationPlugin()` when
  the extraction lands.

## Rejected alternatives

### Keep `validation` in Core

This keeps one optional application policy in every field contract and Runtime
even though Core already has an application-local plugin option system and
generic behavior kernel.

### Move `required` into the plugin

Required presence determines create input and persisted nullability and is a
structural schema invariant. Making it optional would change model shape and
weaken applications that do not install validation behavior.

### Reuse `beforeOperation` or a prepared-target observer

Those stages run after value-dependent enforcement and have different observer
semantics. Reusing them would violate the accepted ordering or force Access to
evaluate values before application validation.

### Define a validation-specific Core capability

A named validator registry or provider protocol would preserve concrete product
vocabulary in Core and encourage plugins to contribute to the official engine.
The rejection-only Runtime behavior boundary is sufficient.

### Infer plugin installation from field syntax

Implicit installation makes imports or declarations mutate the application
graph and prevents Typegen and Runtime from reporting exact configured
capabilities. Application configuration remains explicit.

### Preserve a deprecated Core option

Two owners for `validation` would collide during schema compilation and require
permanent compatibility logic. The pre-release extraction removes the old
owner atomically.

## Required implementation and verification

Issue 2202 adds the generic guard boundary and proves ordering, composition,
privilege enforcement, cancellation, callback attribution, Master execution,
application isolation, and absent-provider cost.

Issue 2203 creates the complete package and performs a responsibility-based
removal audit across Core field contracts, normalizers, compiler IR, Runtime,
Typegen, errors, manifests, tests, examples, and documentation. It must preserve
source, built, packed-package, JavaScript, Typegen-free, Zod, Valibot, nested
field, plugin-field, and arithmetic behavior.

Issue 2204 proves the full installed and absent plugin paths, including
PostgreSQL Testcontainers, and records exact completion evidence.

## Non-goals

- Async validation, database uniqueness, remote calls, or validation on reads.
- Standard Schema output adoption, coercion, defaults, stripping, or other input
  transformation.
- Moving field structure, storage metadata, codecs, protected constraints, or
  database constraints out of Core.
- Adding concrete validator-vendor dependencies.
- Adding global, schema-wide, provider-contributed, or automatically installed
  validation behavior.
