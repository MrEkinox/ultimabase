import { expectTypeOf, test } from 'vitest'

import {
	UltimaBase,
	booleanField,
	dateTimeField,
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

// ADR-0340: `required` is the one word for nullability. A default makes a
// stored field required unless it declares `required: false`.

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

test('lets required: false keep a defaulted field nullable', () => {
	const status = enumField({
		values: ['draft', 'published'],
		default: 'draft',
		required: false,
	})
	expectTypeOf<FieldTypeStateOf<typeof status>>().toEqualTypeOf<{
		readonly create: 'optional'
		readonly object: 'required'
		readonly update: 'optional'
		readonly nullable: true
		readonly list: false
	}>()
	void status
	// `required: true` beside a default is the default value and changes nothing.
	const flag = booleanField({ default: false, required: true })
	expectTypeOf<
		FieldTypeStateOf<typeof flag>['nullable']
	>().toEqualTypeOf<false>()
	expectTypeOf<
		FieldTypeStateOf<typeof flag>['create']
	>().toEqualTypeOf<'optional'>()
	void flag
	const optionalObject = objectField({
		fields: { name: stringField() },
		default: { name: null },
		required: false,
	})
	expectTypeOf<
		FieldTypeStateOf<typeof optionalObject>['nullable']
	>().toEqualTypeOf<true>()
	void optionalObject
})

test('keeps generated values required and removes nullable', () => {
	const sequence = intField({ autoIncrement: true })
	expectTypeOf<
		FieldTypeStateOf<typeof sequence>['nullable']
	>().toEqualTypeOf<false>()
	void sequence
	// @ts-expect-error -- An auto-increment value is never null.
	intField({ autoIncrement: true, required: false })
	// @ts-expect-error -- An auto-increment value is never null.
	intField({ autoIncrement: true, default: 1, required: false })
	// @ts-expect-error -- An autoNow value is never null.
	dateTimeField({ autoNow: true, required: false })
	// @ts-expect-error -- `nullable` is not a field option.
	stringField({ default: 'x', nullable: true })
	// @ts-expect-error -- `nullable` is not a field option.
	stringField({ nullable: true })
})

const Article = UltimaBase.Schema.define({
	className: 'RequiredDefaultArticle',
	fields: (field) => ({
		title: field.string({ required: true }),
		published: field.boolean({ default: false }),
		channel: field.enum({
			values: ['web', 'store'],
			default: 'web',
			required: false,
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
