# 2203: Extract the Standard Schema validation vertical

- Status: completed
- Milestone: 22
- Packages: `@ultimabase/core`, `@ultimabase/plugin-kit`, `@ultimabase/typegen`, `@ultimabase/validation-plugin`
- Depends on: 2202
- ADR: ADR-0223

## Goal

Atomically move the direct field `validation` contract and complete Standard
Schema mutation behavior from Core into the real optional
`@ultimabase/validation-plugin` package.

## Acceptance criteria

- [x] Create `packages/validation-plugin` as a complete publishable official
      plugin, not an empty placeholder, and expose `validationPlugin()`.
- [x] The plugin contributes the direct opaque field option with generated
      `FieldValidationOption<this>` typing for exact scalar, list, object,
      pointer, presence, and plugin-defined field values.
- [x] Relation handles reject `validation`, incompatible Standard Schema input
      or output types fail at compile time, and `any` cannot satisfy the public
      contract.
- [x] Declaration normalization validates Standard Schema V1 shape and retains
      the exact validator identity without invoking, cloning, serializing, or
      exposing its callback through compiler IR or Typegen.
- [x] The application-local compiler traverses complete final mutation values in
      deterministic field, nested-object, and list occurrence order.
- [x] Runtime validation stays synchronous, rejection-only, and exact-once;
      equal cloned output is discarded while transformations, promises,
      malformed results, and thrown validator failures keep focused diagnostics.
- [x] Standard Schema failures retain the stable `field.validation` wire code
      and path-prefixing behavior, with its product-facing type owned by the
      plugin rather than Core's closed structural issue-code union.
- [x] The plugin requests prepared bulk targets only when validated arithmetic
      needs them, reuses Core's canonical update-expression projection semantics,
      and preserves current singular, targetless upsert, and bulk fail-closed
      behavior without replacing atomic deltas.
- [x] Core's final mutation stage becomes structural-only and retains `required`,
      nullability, canonical types, lists and objects, enum, pointer and relation
      identity, defaults, generators, immutable and generated rules, decimal
      shape, structural plans, and repeatable result snapshots.
- [x] Remove Core's `validation` option key, Standard Schema field compatibility
      types, validator normalization and execution, application-validation mode,
      product issue-code ownership, tests, examples, exports, and direct
      `@standard-schema/spec` dependency when no remaining Core consumer needs it.
- [x] Plugin Kit's independent Standard Schema plugin-option parser remains
      unchanged and Core does not import Plugin Kit or the validation plugin.
- [x] Every existing schema, fixture, example, and application using
      `validation` explicitly installs the plugin; applications using only Core
      structural validation do not.
- [x] Typegen's generator version and committed generated artifacts are updated
      when the application graph or generated option registry changes.
- [x] Package, architecture, schema, Runtime, and developer documentation clearly
      distinguish the optional plugin from Core structural validation.

## Tests

- [x] Colocated runtime and type tests cover the public plugin factory, direct
      option, Standard Schema compatibility, immutable retention, traversal,
      issue mapping, contract failures, and application isolation.
- [x] Core regression tests prove `required` and every structural boundary work
      without the plugin and that stale or JavaScript `validation` declarations
      fail compilation when it is absent.
- [x] Runtime ordering tests prove installed validation runs after input
      resolution and before enforcement reevaluation for anonymous and Master
      requests.
- [x] Focused Typegen, source-export, built-export, packed-package, JavaScript,
      and Typegen-free tests cover installed and absent plugin paths.

## Out of scope

- Concrete dependencies on Zod, Valibot, ArkType, or another validator vendor.
- Async validation, database uniqueness, normalization, read validation, or
  automatic migration of stored values.
- A validation provider ecosystem, schema-wide validator, plugin default, or
  implicit installation from field syntax.
- Moving Core structural validation or field metadata into the plugin.

## Completion evidence

- `yarn constraints` passed.
- `yarn check:issues` passed: 1 file and 9 tests.
- `yarn typecheck` passed with no type errors.
- `yarn test` passed after the complete package build: 348 files and 1,699
  tests, including TypeScript type tests.
- `yarn lint` passed with only the repository's reviewed file-size warnings.
- `yarn format:check` passed.
- `yarn build` passed for every workspace; each public package passed publint
  and Are The Types Wrong.
- Focused installed and absent-plugin public E2E verification passed: 7 files
  and 25 tests covering packed Core types, direct community options, manifests,
  optional exports, JavaScript without Typegen, and generated declarations.
- The Core production audit found no Standard Schema dependency, field
  validator executor, `validation` option owner, application-validation mode,
  or `field.validation` ownership. Remaining textual references are deliberate
  plugin documentation and negative audit terms.
