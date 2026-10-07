# postgres-plugin rebuild

Reference snapshot: `0ae7767f7b75dd6c640ca547f9ff85b60f46e69d`.

Status: work in progress (checkpoint). Sections below are updated at every
checkpoint so an interruption never loses undocumented work.

## Production lines (`node tooling/measure-rebuild.mjs .`)

|        | Lines |
| ------ | ----- |
| Before | 9307  |
| After  | TBD   |

## Design summary (so far)

- `naming.ts` replaces `naming/identifier.ts`, `naming/index.ts`,
  `naming/foreign-key.ts` and `naming/relation.ts`.
- `required.ts` is one internal invariant helper (`required(value, message)`)
  replacing the repeated `if (x === undefined) throw new TypeError(message)`
  blocks. Messages are unchanged.
- `schema/contracts.ts` absorbs `schema/field.ts`.
- `schema/index-compiler.ts` absorbs `schema/drizzle-table-metadata.ts`.
- `schema/field-compiler.ts`: the 13-case switch became a `Map` of native
  column specifications; default validation, identity and finalization are
  shared.
- `schema/value-codec.ts`: the `jsonb` flag was always `true`, so the
  unreachable non-JSONB branches (temporal codec, native binary codec, plugin
  codec rejection) were removed. Nullability is applied once per codec.
- `schema/catalog.ts`: relation and pointer lookups use the compiled arrays
  (last registration wins, as with the former keyed maps).
- `schema/drizzle-relations.ts`: generated relation configuration lives in
  `Map`s and is converted with `Object.fromEntries`, so declared field names
  never reach a prototype-assignment pattern.
- `private-storage/compiler.ts` absorbs `private-storage/contracts.ts`.
- `query/filter-compiler.ts` absorbs `query/filter-contracts.ts`;
  `query/jsonb-operand.ts` replaces `query/jsonb-parameter.ts` and
  `query/plugin-field-containment-compiler.ts`; `query/relation-compiler.ts`
  absorbs `query/drizzle-relation-filter.ts`.

## Test edits (import specifiers only)

| Test file                        | Change                              |
| -------------------------------- | ----------------------------------- |
| `src/naming/foreign-key.test.ts` | `./foreign-key.js` → `../naming.js` |
| `src/naming/index.test.ts`       | `./index.js` → `../naming.js`       |
| `src/naming/relation.test.ts`    | `./relation.js` → `../naming.js`    |

## Pre-existing failures (untouched tree)

None. Baseline: unit+types 45 files / 169 tests, e2e 1 / 7, postgres-e2e
4 / 7; consumers unit 364 / 2034, postgres-e2e (all) 55 / 191, e2e (all)
47 / 219.
