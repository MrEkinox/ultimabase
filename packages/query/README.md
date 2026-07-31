# @ultimabase/query

Transport-neutral Query and Operation AST contracts, normalization, cursor contracts, operators, and immutable query definitions.

The public `Query<TSchema>` class is unbound and reusable. Runtime binding produces an executable `BoundQuery<TSchema>`.

This package does not execute operations and must not import Core, Runtime, a database, or a transport.

## Query AST

`createQueryAst()` creates the immutable neutral state used by future query
builders and normalizers. The exact schema definition is retained so field
names stay typed through every later stage:

```ts
import { createQueryAst } from '@ultimabase/query'
import { defineSchema, stringField } from '@ultimabase/schema'

const postSchema = defineSchema({
	className: 'Post',
	fields: {
		title: stringField(),
	},
})

const ast = createQueryAst(postSchema)

// The initial AST has no clauses and contains no HTTP, GraphQL, or SQL data.
ast.selection.fields // readonly []
ast.where // undefined
```

The root separates schema, selection, filtering, ordering, and pagination into
discriminated nodes. This lets REST, GraphQL, and direct TypeScript callers
normalize into the same representation while adapters compile it later.

Mutable builders, query normalization, and cursors remain separate capabilities
that extend the neutral nodes without adding execution concerns to the package.

## Primitive filters

Filter nodes keep fields and operands correlated with the exact schema:

```ts
import type { QueryPrimitiveFilterNode } from '@ultimabase/query'

const filter = {
	kind: 'greater-than',
	field: 'createdAt',
	value: '2026-07-31T12:00:00.000Z',
} as const satisfies QueryPrimitiveFilterNode<typeof postSchema>
```

The built-in capability matrix is deliberately explicit:

| Operators                                       | Supported scalar field kinds                                                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `equal`, `not-equal`, `in`, `not-in`            | bigint, binary, boolean, date, date-time, decimal, enum, float, integer, JSON, string, time, UUID |
| ordered comparisons                             | bigint, date, date-time, decimal, float, integer, string, time                                    |
| `contains`, `starts-with`, `ends-with`, `regex` | string                                                                                            |
| `exists`                                        | every field                                                                                       |

Value operators apply only to non-list fields. Structured objects, lists, and
plugin field kinds expose `exists` until their owning capability defines
storage-independent operators. Nullable fields accept `null` for equality and
membership, but never for ordered comparisons.

Regex patterns remain inert data instead of executable `RegExp` instances:

```ts
const pattern = {
	source: '^ultima',
	flags: ['case-insensitive'],
} as const
```

Adapters map the semantic flags and always parameterize the source during
compilation.

## Logical filters

`and`, `or`, and `not` recursively compose primitive or plugin-owned leaf
filters. The normalizer produces one deterministic immutable structure:

```ts
import {
	normalizeLogicalFilter,
	type QueryPrimitiveFilterNode,
} from '@ultimabase/query'

const filter = normalizeLogicalFilter<
	QueryPrimitiveFilterNode<typeof postSchema>
>({
	kind: 'and',
	expressions: [
		{ kind: 'exists', field: 'title', exists: true },
		{
			kind: 'or',
			expressions: [
				{ kind: 'starts-with', field: 'title', value: 'Ultima' },
				{ kind: 'starts-with', field: 'title', value: 'Parse' },
			],
		},
	],
})
```

Normalization follows boolean identities:

| Input                          | Normalized result                |
| ------------------------------ | -------------------------------- |
| empty `and`                    | constant `true`                  |
| empty `or`                     | constant `false`                 |
| one-child group                | its child                        |
| nested groups of the same kind | one flat group in original order |
| `not(not(expression))`         | `expression`                     |

Neutral constants are removed and decisive constants collapse their group. A
mixed `and`/`or` structure is preserved because flattening it would change its
meaning. Caller-owned logical objects and arrays are never mutated. Leaf
factories remain responsible for snapshotting their own operator values.
