import { expectTypeOf, test } from 'vitest'

import {
	type EmbeddedFieldBuilder,
	type EmbeddedObjectFieldBuilderOptions,
	type FieldValue,
	type FieldBuilder,
	type FieldTypegenStateOf,
} from '../../index.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'

test('declares circular relationships by schema name without local annotations', () => {
	const User = UltimaBase.Schema.define({
		className: 'NamedCircularUser',
		fields: (field) => ({
			posts: field.relation({
				mappedBy: 'author',
				target: 'NamedCircularPost',
			}),
		}),
	})
	const Post = UltimaBase.Schema.define({
		className: 'NamedCircularPost',
		fields: (field) => ({
			author: field.pointer({
				target: 'NamedCircularUser',
				required: true,
			}),
		}),
	})

	expectTypeOf(User.className).toEqualTypeOf<'NamedCircularUser'>()
	expectTypeOf(Post.className).toEqualTypeOf<'NamedCircularPost'>()
})

test('accepts deferred target thunks and keeps the targets typed (ADR-0297)', () => {
	const Author = UltimaBase.Schema.define({
		className: 'ThunkAuthor',
		fields: (field) => ({
			name: field.string({ required: true }),
			posts: field.relation({ target: () => Post, mappedBy: 'author' }),
		}),
	})
	const Post = UltimaBase.Schema.define({
		className: 'ThunkPost',
		fields: (field) => ({
			title: field.string({ required: true }),
			author: field.pointer({ target: () => Author, required: true }),
			parent: field.pointer({ target: () => Post }),
		}),
	})
	const posts = Post.findMany({
		select: { title: true },
		include: {
			author: { select: { name: true } },
			parent: { select: { title: true } },
		},
	})
	const authors = Author.findMany({
		select: { name: true },
		include: { posts: { select: { title: true } } },
	})

	expectTypeOf(posts)
		.resolves.items.toHaveProperty('author')
		.exclude<null>()
		.toHaveProperty('name')
		.toEqualTypeOf<string>()
	expectTypeOf(posts)
		.resolves.items.toHaveProperty('parent')
		.exclude<null>()
		.toHaveProperty('title')
		.toEqualTypeOf<string>()
	expectTypeOf(authors)
		.resolves.items.toHaveProperty('posts')
		.items.toHaveProperty('title')
		.toEqualTypeOf<string>()
	void Post.findMany({ where: { author: { is: { name: { eq: 'Ada' } } } } })
	// @ts-expect-error -- Filters through a thunk target still reject unknown fields.
	void Post.findMany({ where: { author: { is: { nam: { eq: 'Ada' } } } } })
})

test('keeps every supported built-in option on the embedded builder', () => {
	const embedded = undefined as unknown as EmbeddedFieldBuilder
	const objectOptions: EmbeddedObjectFieldBuilderOptions = {
		fields: (child) => ({ label: child.string() }),
	}

	embedded.bigint({ default: 1n, description: 'count', immutable: true })
	embedded.binary({ default: [new Uint8Array([1])], list: true })
	embedded.boolean({ default: true, required: true })
	embedded.date({ autoNow: true, required: true })
	embedded.dateTime({ autoNow: true, timezone: false })
	embedded.decimal({ precision: 12, scale: 2 })
	const status = embedded.enum({
		default: 'draft',
		required: true,
		values: ['draft', 'published'] as const,
	})
	embedded.float({ default: 1.5 })
	embedded.int({ default: 1 })
	embedded.json({ default: { active: true } })
	embedded.string({ default: 'Ada' })
	embedded.time({ autoNow: true, timezone: true })
	embedded.uuid({ required: true })
	const nested = embedded.object({
		fields: (child) => ({
			labels: child.string({ list: true, required: true }),
			status,
		}),
		required: true,
	})
	expectTypeOf(objectOptions.fields).toBeFunction()
	expectTypeOf(nested.kind).toEqualTypeOf<'object'>()

	expectTypeOf<FieldValue<typeof status>>().toEqualTypeOf<
		'draft' | 'published'
	>()
	expectTypeOf<FieldValue<typeof nested>>().toEqualTypeOf<{
		readonly labels: readonly string[]
		readonly status: 'draft' | 'published'
	}>()
})

test('rejects every Core option without embedded occurrence semantics', () => {
	const embedded = undefined as unknown as EmbeddedFieldBuilder

	// @ts-expect-error -- Portable indexes require a stored root field.
	embedded.string({ indexed: true })
	// @ts-expect-error -- Disabled root metadata remains outside this context.
	embedded.boolean({ indexed: false })
	// @ts-expect-error -- Integer sequences require a dedicated stored column.
	embedded.int({ autoIncrement: true })
	// @ts-expect-error -- The option is absent rather than accepted as disabled.
	embedded.bigint({ autoIncrement: false })
	// @ts-expect-error -- Recursively embedded objects cannot request an index.
	embedded.object({ fields: () => ({}), indexed: 'unique' })
	// @ts-expect-error -- System generation is never developer embedded metadata.
	embedded.dateTime({ generatedOn: 'create' })
})

test('preserves enum domains, defaults and immutability in both builder contexts', () => {
	const root = undefined as unknown as FieldBuilder
	const embedded = undefined as unknown as EmbeddedFieldBuilder
	const list = root.enum({
		values: ['draft', 'published'],
		default: ['draft'],
		list: true,
		immutable: true,
		indexed: 'unique',
	})
	const nested = embedded.enum({
		values: { Draft: 'draft', Published: 'published' },
		required: true,
	})

	expectTypeOf(list.kind).toEqualTypeOf<'enum'>()
	expectTypeOf(nested.kind).toEqualTypeOf<'enum'>()
	expectTypeOf<FieldValue<typeof list>>().toEqualTypeOf<
		readonly ('draft' | 'published')[]
	>()
	expectTypeOf<
		FieldTypegenStateOf<typeof list>['create']
	>().toEqualTypeOf<'optional'>()
	expectTypeOf<
		FieldTypegenStateOf<typeof list>['update']
	>().toEqualTypeOf<'forbidden'>()
	expectTypeOf<FieldValue<typeof nested>>().toEqualTypeOf<
		'draft' | 'published'
	>()
	expectTypeOf<
		FieldTypegenStateOf<typeof nested>['create']
	>().toEqualTypeOf<'required'>()

	// @ts-expect-error -- Enum defaults must remain inside the inferred domain.
	root.enum({ values: ['draft', 'published'], default: 'unknown' })
	// @ts-expect-error -- A list default must be a list of exact enum values.
	embedded.enum({ values: ['draft'], list: true, default: 'draft' })
	// @ts-expect-error -- Embedded enum options must never acquire root indexes.
	embedded.enum({ values: ['draft'], indexed: false })
	// @ts-expect-error -- Empty embedded domains fail at the values option.
	embedded.enum({ values: [] })
})
