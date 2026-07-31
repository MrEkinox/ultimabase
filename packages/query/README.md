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

This first contract intentionally does not define filter operators, mutable
builders, query normalization, or cursors. Those capabilities extend the
neutral nodes without adding execution concerns to the package.
