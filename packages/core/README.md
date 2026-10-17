# @ultimabase/core

The UltimaBase kernel: immutable schemas, one query and operation engine,
transactions, Master authority and the plugin graph. Every other capability,
including the database, is a plugin.

## Installation

```sh
npm install @ultimabase/core
```

It has no peer dependencies. A running application also needs a database plugin
such as `@ultimabase/postgres-plugin`.

## Example

Schemas are declared on a configured factory `App`, from the tested
[`examples/modeling`](../../examples/modeling/README.md) application:

<!-- region ../../examples/modeling/src/catalog.ts#author,book -->

```ts
export const Author = App.Schema.define({
	className: 'Author',
	fields: (field) => ({
		firstName: field.string({ required: true }),
		lastName: field.string({ required: true }),
		// Computed for each result that selects it, never stored. Inside
		// `fields`, dependency values are typed `unknown`: convert them.
		displayName: field.virtual({
			output: (output) => output.string(),
			select: { firstName: true, lastName: true },
			resolve: ({ item }) =>
				`${String(item.firstName)} ${String(item.lastName)}`,
		}),
		// Inverse side: the books whose `author` pointer targets this author.
		books: field.relation({ target: () => Book, mappedBy: 'author' }),
	}),
})

/** One field of each built-in value kind, and two composite indexes. */
export const Book = App.Schema.define({
	className: 'Book',
	fields: (field) => ({
		title: field.string({ required: true }),
		isbn: field.string({
			description: 'ISBN-13 without hyphens',
			immutable: true,
			indexed: 'unique',
			required: true,
		}),
		author: field.pointer({ target: () => Author, required: true }),
		price: field.decimal({ precision: 10, scale: 2, required: true }),
		genre: field.enum({ values: Genre, required: true }),
		format: field.enum({
			values: ['paperback', 'hardcover', 'ebook'],
			default: 'paperback',
		}),
		tags: field.string({ list: true }),
		pages: field.int(),
		weightKg: field.float(),
		publishedOn: field.date(),
		published: field.boolean({ default: false }),
		cover: field.binary(),
		details: field.json(),
	}),
	indexes: [
		// An author never has two books with the same title.
		{ fields: ['author', 'title'], unique: true },
		// Serves "the latest books of a genre".
		{ fields: ['genre', 'createdAt'] },
	],
})
```

<!-- endregion -->

## Documentation

- [Quick Start](../../apps/website/content/docs/1.0.0/quick-start.mdx)
- [Manual Installation](../../apps/website/content/docs/1.0.0/manual-installation.mdx)
- [Application](../../apps/website/content/docs/1.0.0/core/application.mdx)
- [Data Modeling](../../apps/website/content/docs/1.0.0/core/data-modeling/schemas.mdx)
- [Reading Data](../../apps/website/content/docs/1.0.0/core/reading-data/overview.mdx)
- [Writing Data](../../apps/website/content/docs/1.0.0/core/writing-data/create.mdx)
- [Runtime](../../apps/website/content/docs/1.0.0/core/runtime/runtime-pipeline.mdx)
- [Security Foundations](../../apps/website/content/docs/1.0.0/core/security-foundations/security-model.mdx)
- [Build a Plugin](../../apps/website/content/docs/1.0.0/plugins/build-a-plugin/index.mdx)
