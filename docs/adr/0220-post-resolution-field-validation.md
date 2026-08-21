# ADR-0220: Field validation follows input resolution

- Status: accepted
- Date: 2026-08-22
- Refines: ADR-0166, ADR-0219
- Depends on: ADR-0166, ADR-0219

## Context

ADR-0219 initially applied Standard Schema at every complete-value structural
boundary, including the first mutation pass before optional behavior input
transformers. ADR-0166 then applied the same validation again after field and
schema `resolveInput` plus target-aware prepared-operation transformations.

That order prevents a common explicit-normalization workflow. A lowercase slug
validator rejects `Hello World` before a Hook can rewrite it to `hello-world`;
an E.164 validator likewise rejects national phone input before an explicit
phone normalizer can canonicalize it. Requiring the same validator to accept
both the raw and canonical forms weakens the final stored-value contract.

The final revalidation was also an optional `RuntimeBehaviorStages` callback.
The official Hooks plugin supplied it, but an independent community behavior
provider could transform input without supplying the callback. A mandatory
Runtime integrity invariant must not depend on the transformer opting into its
own revalidation.

## Decision

### Initial mutation validation is structural

The first Core validation pass continues to resolve Core defaults and
generators and to enforce presence, nullability, scalar types, canonical scalar
snapshots, list and object shape, unknown fields, immutable and generated field
restrictions, relationship deltas, and unique upsert targets. It does not invoke
the optional application Standard Schema validator.

Access and target preparation therefore still receive structurally trusted,
immutable operation values. Developer callbacks never receive arbitrary
untyped input, and this decision does not move authorization or protected
constraints later in the pipeline.

### One mandatory final mutation validation belongs to Core

After every configured `transformInput`, `transformPreparedInput`, and
`transformPreparedOperation` stage, Core always runs one final mutation
validation. The pass does not replay defaults or generators. It reuses the
initial normalized operation to prevent transformations from replacing
generated update operations, authorized relation deltas, or unique upsert
target values.

This final pass repeats Core's structural snapshot and invokes Standard Schema
for every complete present non-null field value. It runs even when no behavior
transformed the operation, so defaulted, generated, and ordinary caller values
retain application validation. A failed candidate never reaches
value-dependent enforcement reevaluation, observers, or persistence.

The fixed order is:

```text
normalization
→ initial Core structural validation with defaults and generators
→ initial monotonic enforcement and target preparation
→ field and schema input resolution
→ target-aware prepared-operation transforms
→ mandatory final Core structural and Standard Schema validation
→ value-dependent enforcement reevaluation when input changed
→ observers and persistence
```

`RuntimePipelineStages` exposes the mandatory final stage to a selected Runtime
executor alongside initial structural validation. Runtime behavior providers no
longer expose `revalidateInput`; they contribute transforms only, while Core
owns the invariant that validates their combined output.

Because both public protocols change incompatibly, the
`ultimabase.runtime-executor` and `ultimabase.runtime-behaviors` capability
versions advance from `1.0.0` to `2.0.0`. Plugin authors importing the current
typed tokens receive the new contracts directly; no parallel legacy capability
or compatibility adapter remains during pre-release development.

### Result validation is unchanged

Adapter results, mutation materializations, included records, behavior result
replacements, and final selected results continue to execute Standard Schema at
their existing complete-value boundaries. Master authority bypasses Access and
ACL authorization only; it bypasses neither initial structural validation nor
final or result field validation.

## Consequences

- Hooks can explicitly normalize phone numbers, slugs, case, locales, and
  similar string values before one strict validator checks the stored form.
- Validators describe the final canonical application value instead of a union
  of raw accepted inputs and stored outputs.
- Community behavior authors cannot accidentally omit final validation and no
  longer need a validation callback beside their transform.
- Every mutation pays for one final structural pass. This predictable cost is
  accepted to keep the validation boundary independent from optional plugins.
- Standard Schema remains synchronous, rejection-only, repeatable, and unable
  to replace Core's canonical value.

## Non-goals

- Allowing a Standard Schema output to normalize or transform a field.
- Passing structurally invalid values to Hooks.
- Introducing different validators for raw and stored forms.
- Moving initial Access after developer transformations.
