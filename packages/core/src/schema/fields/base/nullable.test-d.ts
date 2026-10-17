import { expectTypeOf, test } from 'vitest'

import {
	UltimaBase,
	booleanField,
	enumField,
	intField,
	jsonField,
	objectField,
	stringField,
	type FieldTypeStateOf,
	type JsonDocument,
	type SchemaCreateData,
	type SchemaItem,
	type SchemaUpdateData,
} from '../../../index.js'

// ADR-0340: a default makes a stored field non-null unless it declares
// `nullable: true`; `nullable` exists only beside a default.

test('types a defaulted field as non-null and optional on create', () => {
	const done = booleanField({ default: false })
	expectTypeOf<FieldTypeStateOf<typeof done>>().toEqualTypeOf<{
		readonly create: 'optional'
		readonly object: 'required'
		readonly update: 'optional'
		readonly nullable: false
		readonly list: false
	}>()
	void done
	const listed = stringField({ default: ['draft'], list: true })
	expectTypeOf<
		FieldTypeStateOf<typeof listed>['nullable']
	>().toEqualTypeOf<false>()
	void listed
	const object = objectField({
		fields: { name: stringField() },
		default: { name: null },
	})
	expectTypeOf<
		FieldTypeStateOf<typeof object>['nullable']
	>().toEqualTypeOf<false>()
	void object
	const json = jsonField({ default: () => ({}) })
	expectTypeOf<
		FieldTypeStateOf<typeof json>['nullable']
	>().toEqualTypeOf<false>()
	void json
})

test('lets nullable: true keep a defaulted field nullable', () => {
	const status = enumField({
		values: ['draft', 'published'],
		default: 'draft',
		nullable: true,
	})
	expectTypeOf<FieldTypeStateOf<typeof status>>().toEqualTypeOf<{
		readonly create: 'optional'
		readonly object: 'required'
		readonly update: 'optional'
		readonly nullable: true
		readonly list: false
	}>()
	void status
	const counter = intField({ default: 0, nullable: false })
	expectTypeOf<
		FieldTypeStateOf<typeof counter>['nullable']
	>().toEqualTypeOf<false>()
	void counter
	// `required: true` beside a default adds nothing.
	const flag = booleanField({ default: false, required: true })
	expectTypeOf<
		FieldTypeStateOf<typeof flag>['nullable']
	>().toEqualTypeOf<false>()
	expectTypeOf<
		FieldTypeStateOf<typeof flag>['create']
	>().toEqualTypeOf<'optional'>()
	void flag
})

test('rejects nullable without a default or beside required', () => {
	// @ts-expect-error -- A field without a default is already nullable.
	stringField({ nullable: true })
	// @ts-expect-error -- `required` and `nullable` contradict each other.
	stringField({ default: 'x', nullable: true, required: true })
	// @ts-expect-error -- An auto-increment value is never null.
	intField({ autoIncrement: true, default: 1, nullable: true })
})

const Article = UltimaBase.Schema.define({
	className: 'NullableDefaultArticle',
	fields: (field) => ({
		title: field.string({ required: true }),
		published: field.boolean({ default: false }),
		channel: field.enum({
			values: ['web', 'store'],
			default: 'web',
			nullable: true,
		}),
		metadata: field.json({ default: {} }),
		note: field.string(),
	}),
})

test('derives non-null items and create or update inputs without null', () => {
	type Item = SchemaItem<typeof Article>
	type Create = SchemaCreateData<typeof Article>
	type Update = SchemaUpdateData<typeof Article>

	expectTypeOf<Item['published']>().toEqualTypeOf<boolean>()
	expectTypeOf<Item['metadata']>().toEqualTypeOf<JsonDocument>()
	expectTypeOf<Item['channel']>().toEqualTypeOf<'web' | 'store' | null>()
	expectTypeOf<Item['note']>().toEqualTypeOf<string | null>()

	expectTypeOf<Create['published']>().toEqualTypeOf<boolean | undefined>()
	expectTypeOf<Create['channel']>().toEqualTypeOf<
		'web' | 'store' | null | undefined
	>()
	expectTypeOf<Update['published']>().toEqualTypeOf<boolean | undefined>()

	// @ts-expect-error -- A defaulted field rejects explicit null on create.
	const nullOnCreate: Create = { title: 'Draft', published: null }
	// @ts-expect-error -- and on update.
	const nullOnUpdate: Update = { published: null }
	const clearedChannel: Create = { title: 'Draft', channel: null }
	void [Article, nullOnCreate, nullOnUpdate, clearedChannel]
})
