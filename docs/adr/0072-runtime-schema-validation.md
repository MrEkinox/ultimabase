# ADR-0072: Runtime executes declared schema validation

- Status: accepted
- Date: 2026-08-01
- Refines: ADR-0039, ADR-0040, ADR-0041, ADR-0064

## Decision

Runtime provides `createRuntimeValidationStage(options)` as the structural
validation phase of the mandatory operation pipeline. The stage compiles and
caches each schema's create and update plans, traverses their object and list
nodes, and sends every scalar leaf through Schema's public
`snapshotScalarFieldValue` boundary.

Schema exposes `validateScalarFieldConstraints(field, value, path)` as the
shared low-level evaluator for built-in declarative constraints. The evaluator
reads the retained field definition rather than reconstructing scalar schemas
inside Runtime. Plugin fields continue to own value normalization through their
registered snapshot capability and may expose further behavior through their
own plugins.

One clock instant is read for each mutation operation. Runtime projects that
instant through the application timezone and reuses the projections for every
`autoNow` and system timestamp in singular or bulk input. Static defaults and
factory results are traversed through the same structural and scalar snapshot
boundaries as caller values. A runtime default factory executes once for each
created object; adapter-specific defaults and auto-increment values remain
absent for the database adapter to resolve.

Create branches use create plans, update branches use update plans, and each
upsert validates both independently. Update replacement values receive their
full field constraints. Increment and decrement operands are validated as
scalar values, while constraints on the resulting persisted value remain a
database responsibility because Runtime does not load the current value.

Failures use `FrameworkError` with code `VALIDATION_ERROR` and immutable
transport-neutral issues containing stable codes and property/array paths.
Structural validation never branches on access mode, so master authority does
not bypass it.

## Consequences

REST, GraphQL, jobs, internal calls, and master operations now share identical
normalization behavior before permission plugins and hooks. Defaults never
mutate caller-owned input, mutable scalar values such as binary data are
detached, and bulk temporal values cannot drift within one operation.

Application assembly must install the stage in the pipeline's mandatory
`structuralValidation` position. UUID v7 identifier generation remains the
next Runtime concern and does not change the validation bypass policy.
