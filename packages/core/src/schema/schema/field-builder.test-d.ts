import { expectTypeOf, test } from 'vitest'

import {
	Schema,
	type EmbeddedFieldBuilder,
	type EmbeddedObjectFieldBuilderOptions,
	type FieldValue,
} from '../../index.js'

test('declares circular relationships by schema name without local annotations', () => {
	const User = Schema.define({
		className: 'NamedCircularUser',
		fields: (field) => ({
			posts: field.relation({
				mappedBy: 'author',
				target: 'NamedCircularPost',
			}),
		}),
	})
	const Post = Schema.define({
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

test('rejects value-level target callbacks from the application FieldBuilder', () => {
	const Target = Schema.define({
		className: 'CallbackTarget',
		fields: () => ({}),
	})

	Schema.define({
		className: 'CallbackSource',
		fields: (field) => ({
			// @ts-expect-error -- Application relationships use stable schema names.
			target: field.pointer({ target: () => Target }),
		}),
	})
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
