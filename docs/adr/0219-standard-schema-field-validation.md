# ADR-0219: Field constraints use Standard Schema

- Status: accepted
- Date: 2026-08-21
- Refines: ADR-0028, ADR-0031, ADR-0039, ADR-0041, ADR-0072, ADR-0133, ADR-0166, ADR-0176, ADR-0211
- Refined by: ADR-0220, ADR-0221
- Depends on: ADR-0039, ADR-0041, ADR-0166, ADR-0211

## Context

UltimaBase currently owns a closed nested field-validation language. Every
value field may place `required` under `validation`; selected built-in kinds
add length, range, pattern, finite-number, decimal-shape, or UUID-version
properties. Core normalizes that language, publishes its types, evaluates its
constraints, and assigns one machine code to every built-in branch.

That contract makes each additional validation feature a Core change even when
the feature does not define a logical field kind, canonical representation, or
storage shape. It also gives community field authors a different validation
extension path through `definePluginField(..., { normalizeValidation })`.
Applications that already use Zod, Valibot, ArkType, or another Standard Schema
implementation must restate their rules in UltimaBase's smaller vocabulary.

The nested object also mixes three responsibilities that cannot be delegated
to the same opaque validator:

- `required` defines create-time presence and derived persisted nullability;
- decimal `precision` and `scale` are inspected by PostgreSQL when it selects
  `numeric(p, s)` storage and remain structural decimal limits at Runtime; and
- length, ranges, regular expressions, finite-number checks, and UUID versions
  are additional application constraints over an already canonical value.

Standard Schema V1 provides one validator-neutral protocol and exact inferred
input and output types. ADR-0211 already accepts it for synchronous plugin
option parsing, but that boundary deliberately allows defaults and
transformations. Field validation has a different contract: Core already owns
defaults, generators, canonical snapshots, Hooks input transformation, and
adapter result normalization. A field validator must only accept or reject the
value Core produced.

UltimaBase is still in pre-release development. Keeping the old validation
object beside Standard Schema would create two authorities and make every
field, plugin, example, and generated editor contract carry compatibility
logic with no release requirement.

## Current production inventory

The migration audit is responsibility-based so moving a symbol to another file
cannot preserve the superseded contract accidentally.

### Public field contracts

`fields/base/contract.ts` defines `FieldValidationOptions`, the generic
validation parameter on `FieldOptionsBase` and `FieldOptions`, nested
`validation` metadata, required inference, `FieldOptionsWithoutNullable`, and
`ResolveFieldTypegenState`. `fields/base/factory.ts` and the object and pointer
factories repeat a compact `validation.required` shape so literal presence is
visible in editor signatures. System fields also materialize an internal
required validation record.

The public built-in validation language is:

| Field kinds                                       | Current nested keys                 | Migration                         |
| ------------------------------------------------- | ----------------------------------- | --------------------------------- |
| every stored value field, including plugin fields | `required`                          | direct Core `required` option     |
| `string`                                          | `length.min`, `length.max`, `match` | Standard Schema                   |
| `binary`                                          | `length.min`, `length.max`          | Standard Schema                   |
| `int`, `bigint`                                   | `range.min`, `range.max`            | Standard Schema                   |
| `float`                                           | `finite`, `range.min`, `range.max`  | Standard Schema                   |
| `decimal`                                         | `precision`, `scale`                | direct Core structural options    |
| `decimal`                                         | `range.min`, `range.max`            | Standard Schema                   |
| `date`, `dateTime`, `time`                        | `range.min`, `range.max`            | Standard Schema                   |
| `uuid`                                            | `version`                           | Standard Schema                   |
| `boolean`, `enum`, `json`, `object`, `pointer`    | no additional key                   | Standard Schema remains available |
| `relation`                                        | no validation value                 | remains unsupported               |

`schema/index.ts`, and therefore the root Core export, currently publishes
`FieldValidationOptions`; every built-in `*ValidationOptions` alias or
interface; every `*RangeValidationOptions` and length alias; the shared
`ValidationIssue` family; `validateScalarFieldConstraints`; and
`fieldUsesTemporalTimezone`. The closed option and range aliases plus
`validateScalarFieldConstraints` are removed. The issue shape and structural
plan types remain public. `fieldUsesTemporalTimezone` remains because timezone
representation is structural and PostgreSQL's value codec consumes it; it is
relocated away from the deleted constraint evaluator if necessary.

`definePluginField` currently accepts a plugin-owned validation type and an
optional `normalizeValidation` callback through `PluginFieldNormalizers`.
`@ultimabase/pg-vector-plugin` uses the common presence-only alias, while
official Access, ACL, and Roles declarations create required fields and Roles
also uses a string length constraint. Plugin field structural configuration
already belongs in the plugin's direct field options and snapshot callback.
The validation generic and `normalizeValidation` path are therefore removed;
plugin fields receive the same Standard Schema property as built-in fields.

### Normalization, plans, and issue codes

`fields/base/options.ts` owns the common and per-kind key allowlists, nested
unknown-key diagnostics, `normalizeCommonValidation`, required reads,
nullability, and create-presence decisions. The built-in factories delegate to
the normalizers under `fields/constraints/length.ts`, `numeric.ts`, `range.ts`,
and `temporal.ts`; string, float, decimal, and UUID add local normalization.
Those application-constraint normalizers and their public types disappear.
Direct `required`, `precision`, and `scale` receive focused root normalization.

ADR-0039's `ScalarValidationPlan`, `ObjectValidationPlan`,
`ArrayValidationPlan`, `SchemaValidationPlan`, and `SchemaValidationPlans`
remain. They still retain exact field identity, presence, nullability, object
children, list structure, and unknown-field policy. Standard Schema does not
become a second plan representation and no executable validator is copied into
a callback-free plan node.

`plans/scalar-validation.ts` currently evaluates the closed constraint DSL.
Its length, range, pattern, finite, decimal, temporal, and UUID-version branches
are removed. These issue codes are removed with those branches:

- `string.length.min`, `string.length.max`, and `string.match`;
- `binary.length.min` and `binary.length.max`;
- every built-in `*.range.min` and `*.range.max` code;
- `float.finite`; and
- `uuid.version`.

`field.required`, `field.null`, `field.forbidden`, `field.unknown`, array and
object type codes, scalar type or canonical-format codes, `enum.value`,
`pointer.type`, `upsert.target`, and plugin-kind structural invalid codes
remain. UUID syntax becomes an unconditional UUID scalar snapshot invariant
rather than depending on the presence of a validation object. Decimal
`decimal.precision` and `decimal.scale` remain structural issue codes backed by
the direct decimal shape options. Standard Schema rejections use the one new
closed Core issue code `field.validation`; vendor-specific issue properties do
not widen the public code union. ADR-0031's namespaced plugin codes remain for
plugin-owned structural snapshot failures, not Standard Schema issues.

### Runtime execution boundaries

`runtime/validation/runtime-validation.ts` currently snapshots scalar leaves,
applies built-in constraints, traverses complete fields, resolves defaults and
generated values, validates create and upsert branches, validates replacement
updates, structurally snapshots arithmetic operands, revalidates transformed
mutations, and validates selected result records. The Runtime behavior boundary
then applies the same record snapshot to:

- pre-hydration database results;
- selected results returned or replaced by behavior;
- complete create, update, and delete materializations;
- included pointer and relation records; and
- final mutation outcomes.

The initial mutation stage and ADR-0166's one post-transformation structural
revalidation remain the authoritative input boundaries. A Standard Schema
validator also runs whenever an existing boundary produces a complete
canonical non-null field value. Replacement updates validate their complete
replacement. Increment and decrement operands receive only their scalar
structural snapshot because they are deltas, not the final field value; the
persisted result and mutation materialization validate the resulting complete
value. Reads and adapter results continue to validate stored data. Master
authority bypasses none of these boundaries.

### Adapter, compiler, Typegen, and documentation consumers

`@ultimabase/postgres-plugin` uses `compileValidationPlans` to enumerate fields
and nullability. That remains valid. Its `schema/field-compiler.ts` is the only
production adapter reader of nested constraint data: `readDecimalConfig`
extracts `validation.precision` and `validation.scale`. It migrates to direct
decimal options. No adapter reads length, range, pattern, finite, or UUID
version constraints. The temporal codec consumes the retained structural
timezone helper.

The public schema compiler IR already encodes non-JSON option values as nominal
application-local artifacts. It must retain a validator through the exact
field artifact without serializing, invoking, cloning, or exposing its
`~standard.validate` callback to a replacement compiler.

Typegen's `TypegenFieldSnapshot` records field kind, value shape, description,
operation presence, list state, plugin value references, and relationships. It
does not serialize the current constraint object. The Standard Schema validator
is likewise omitted from generated declarations and fingerprints. Direct
`required` changes the compact operation state and therefore the generated
contract. Decimal precision and scale do not change TypeScript value shape and
remain absent from Typegen snapshots; PostgreSQL's physical schema owns their
storage effect.

Active examples requiring migration are the root README, Core's package README
and schema/runtime guides, every file under `packages/core/examples/schema`
that declares `validation`, the Todo backend source and README, and the ACL,
Roles, PostgreSQL, and pg-vector package READMEs. Production declarations in
Access, ACL, Roles, pg-vector, Core system fields, and plugin schema patches
also migrate. Tests and E2E fixtures using the old syntax are part of the
removal audit even when their only constraint is required presence.

## Decision

### Separate presence, structural shape, and application validation

Every stored value field receives these common concepts:

```ts
const Task = Schema.define({
	className: 'Task',
	fields: (field) => ({
		title: field.string({
			required: true,
			validation: z.string().min(1).max(200),
		}),
		progress: field.float({
			validation: z.number().finite().min(0).max(1),
		}),
		budget: field.decimal({
			precision: 12,
			scale: 2,
			validation: acceptedBudget,
		}),
	}),
})
```

`required` is direct Core metadata. It is the only developer-authored presence
constraint and remains the source for required create input and non-null model
inference. Defaults and guaranteed Core or adapter generation retain their
existing omission and non-null effects; a validator cannot change either.
Relation handles continue to reject `required` and `validation` because they
are not stored field values.

Decimal `precision` and `scale` are direct Core field-shape options. Core
validates their positive precision, non-negative scale, and `scale <= precision`
relationship. Runtime enforces the maximum digits and fractional digits, and
PostgreSQL uses the same values for physical numeric storage. They are not
opaque application constraints.

Enum domains, list shape, object children, temporal timezone representation,
pointer targets and referential actions, defaults, generators, immutability,
indexes, descriptions, and plugin-owned structural options remain direct field
metadata. Standard Schema cannot define or override them.

### One synchronous Standard Schema validator

The optional `validation` property accepts one Standard Schema V1 value. Core
depends directly on the types-only `@standard-schema/spec` package because the
protocol appears in Core's public declarations. Core does not import Plugin
Kit, select a concrete validator, re-export a vendor, or create another
package.

At declaration time Core verifies that the supplied object or function exposes
`~standard` version 1, a string vendor identity, and a callable `validate`.
It retains the exact validator by identity inside the immutable field options.
It does not spread, deep-freeze, serialize, or invoke the validator during
schema declaration, static compilation, Typegen, fingerprinting, or adapter
setup.

The field option type enforces both Standard Schema inferred directions:

- the validator input must accept the field's complete canonical non-null
  value; readonly-only differences in Core-owned list, JSON, and embedded
  object containers are ignored so ordinary Zod and other mutable-container
  schemas remain usable;
- the validator output must be assignable to that same canonical field value;
  and
- `any` cannot satisfy either direction or leak through the public API.

Readonly relaxation does not widen nominal scalar values such as Pointer or a
plugin-defined class. Runtime always passes an immutable canonical snapshot.
Validators are pure readers: mutating input is unsupported and may fail because
Core freezes containers. The output compatibility rule permits narrower or
branded results but never changes the field's model type.

### Validate complete canonical values without adopting output

Core first applies the field-owned scalar snapshot and recursively completes
list and object structure. Missing and null values remain Core states and do
not invoke Standard Schema. For a present non-null field, the validator receives
the complete canonical value:

- a scalar validator receives the canonical scalar;
- a list validator receives the complete readonly array once, not each element
  as independent field validation;
- an object validator receives the complete canonical object after child
  snapshots and child validators succeed; and
- a JSON validator receives the complete canonical JSON document.

Nested object fields validate child values in deterministic declaration and
occurrence order before the containing object's validator. List order is
preserved. A validator that wants element constraints expresses them through
its own array schema. Plugin-defined fields use the same complete-value rule;
their `snapshotValue` remains the prior structural boundary.

Core calls `~standard.validate` directly and requires an immediate Standard
Schema result. A promise or promise-like value is a contract failure. On
success, Core compares the returned value with the original canonical snapshot
using deep canonical equality across primitives, bigint, arrays, records,
native bytes, pointers, and plugin-owned scalar snapshots. Equal cloned
containers are accepted so schema libraries may construct output records.
Core discards even an equal validator output and retains its own snapshot.
Coercion, defaults, stripping, key insertion, trimming, or any other observable
change is a contract failure even when the inferred output type remains
assignable.

Standard Schema failures append one immutable UltimaBase issue per reported
issue. Every issue uses code `field.validation`, preserves the standardized
message, and prefixes the validator-relative path with the Runtime field path.
String and numeric segments remain exact. Standard Schema symbol segments are
converted with their stable string representation because transport-safe Core
paths contain only strings and numbers. Vendor-specific codes, metadata, or
properties are ignored.

An empty Standard Schema failure list becomes one `field.validation` issue with
a stable Core fallback message because the protocol permits an empty array but
Runtime still needs an actionable failure. Malformed validators, malformed
results or issues, promise-like results, thrown exceptions, invalid issue
paths, and changed successful values are validator contract failures rather
than caller validation failures. They raise a focused internal framework error
with the field path and original cause in trusted diagnostics; they are not
converted into `field.validation` issues that would incorrectly blame
operation input.

Validators may execute at initial mutation validation, ADR-0166's final
post-resolution validation, adapter and behavior result boundaries,
materialization validation, and included-result snapshotting. They have no
exact-once guarantee and must be synchronous, deterministic, side-effect-free,
and safe to repeat. Async uniqueness, database lookups, authorization, and
business workflows remain Hooks, protected constraints, or dedicated plugins.

### Opaque identity, application isolation, and generated artifacts

Each declared field retains exactly its supplied validator. Core keeps no
process-global validator registry, result cache, mutable execution state, or
cross-field deduplication. Reusing one schema class intentionally reuses its
immutable declared metadata; separately declared fields and applications are
never rebound to another field's validator. Any mutable state intentionally
captured by a developer-supplied validator remains that validator's
responsibility and violates the documented purity contract if it affects
repeatability.

The schema compiler IR represents the opaque `validation` value as a nominal
application-local option artifact and also retains the exact field artifact.
A replacement compiler can preserve the references but cannot resolve or
execute them. Typegen omits the validator from its callback-free snapshot,
declarations, outputs, and SHA-256 fingerprint because it changes neither the
generated model nor operation types. JavaScript and Typegen-free applications
execute the same validator from the compiled application graph.

### Atomic removal sequence

Implementation proceeds without a compatibility period:

1. move required presence, inference, system fields, pointer compatibility,
   plugin declarations, and all callers to direct `required`;
2. move decimal precision and scale plus PostgreSQL compilation to direct
   structural options and audit every adapter reader;
3. add the common Standard Schema boundary, complete-value Runtime execution,
   issue mapping, and contract-failure handling while deleting the closed DSL,
   its normalizers, evaluator, codes, types, exports, examples, and plugin
   `normalizeValidation` path in the same issue;
4. prove two independent Standard Schema implementations, Typegen and packed
   declarations, JavaScript and Typegen-free execution, and the Todo developer
   experience; then
5. run a repository-wide source, declaration, archive, documentation, Runtime,
   Typegen, and PostgreSQL removal audit.

There is no deprecated overload, validation-object adapter, renamed constraint
bag, custom callback parallel to Standard Schema, or decoder for old compiled
metadata.

## Required verification

Issues 2002 through 2006 must cover:

- Runtime source tests for direct presence, nullability, defaults, generators,
  UUID structure, decimal shape, every built-in canonical family, plugin
  fields, full lists and objects, nested issue paths, update replacement,
  arithmetic outcomes, transformed input, adapter results, materializations,
  repeated execution, master authority, and application isolation;
- compile-time and language-service tests against source and packed exports for
  focused `required`, `precision`, `scale`, validator input, validator output,
  readonly container, `any`, pointer, plugin field, and incompatible-validator
  diagnostics;
- negative Runtime tests for async results, throws, malformed protocols,
  malformed results and issues, coercion, defaults, stripping, same-type
  transformations, mutation attempts, and validator output adoption;
- Typegen tests proving opaque omission, stable fingerprints, exact generated
  models, a schema absent from the generated registry, and isolation between
  applications with different validators;
- Zod and one independently implemented Standard Schema library across scalar,
  list, object, temporal, decimal, enum, JSON, binary, pointer, and plugin-field
  examples;
- PostgreSQL compiler, synchronization, migration, Runtime, and Testcontainers
  coverage for direct decimal shape and complete result validation;
- JavaScript, Typegen-free, Todo, public E2E, package archive, public export,
  deep-import, dependency-constraint, and documentation coverage; and
- the repository gates `yarn constraints`, `yarn check:issues`,
  `yarn typecheck`, `yarn test`, `yarn lint`, `yarn format:check`, `yarn build`,
  `yarn test:pack`, and the justified PostgreSQL E2E suites.

## Consequences

- Developers use their existing validator ecosystem instead of waiting for a
  Core-specific constraint option.
- Core owns fewer application rules while retaining structural data authority,
  deterministic execution, stable issues, and adapter-neutral storage.
- Built-in and community fields share one validation contract without a Core
  import from Plugin Kit or a dependency on a concrete validator.
- Standard Schema transformations remain useful for plugin option parsing under
  ADR-0211 but are explicitly rejected for canonical field validation.
- Validation may cost more than the closed scalar evaluator and may run more
  than once. That cost is opt-in per field and preserves the existing safety
  boundaries rather than adding a faster bypass.
- Changing only an opaque validator does not regenerate TypeScript declarations;
  changing direct presence still does, and changing decimal shape remains a
  database-schema concern.

## Non-goals

- Async validation, uniqueness queries, authorization, or business workflows.
- Applying Standard Schema defaults, coercions, transformations, or output
  types to persisted values.
- Replacing field snapshots, validation plans, Hooks `resolveInput`, protected
  constraints, or adapter codecs.
- Selecting or re-exporting Zod, Valibot, ArkType, or another concrete library.
- Introducing a validation plugin, a compatibility package, or a new Core
  capability.
