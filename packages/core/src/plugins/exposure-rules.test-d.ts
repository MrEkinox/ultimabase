import { expectTypeOf, test } from 'vitest'

import { UltimaBase } from '../runtime/application/ultima-base.js'
import type { NativeExposureRules, SchemaExposeRule } from './exposure-rules.js'

// ADR-0347 amendment item 5: `.with` always offers Core's `expose`, even
// when no installed plugin declares a rule.
test('a factory without rule plugins accepts expose', () => {
	const declared = UltimaBase.Schema.define({
		className: 'TypedExposeDocument',
		fields: (field) => ({ title: field.string() }),
	})

	declared.with({ expose: true })
	declared.with({ expose: false })
	declared.with({ expose: { write: false, create: true, findOne: false } })
	declared.with({ expose: { all: true, count: true, deleteMany: false } })
	// @ts-expect-error -- expose takes a boolean or an object of booleans.
	declared.with({ expose: 'yes' })
	// @ts-expect-error -- each key takes a boolean.
	declared.with({ expose: { count: 1 } })
	// @ts-expect-error -- no installed plugin contributes this command.
	declared.with({ expose: { softDelete: true } })
	// @ts-expect-error -- plugin rule keys stay refused by name.
	declared.with({ rest: true })
})

test('names the native keys of the vocabulary', () => {
	expectTypeOf<keyof NativeExposureRules>().toEqualTypeOf<
		| 'all'
		| 'read'
		| 'write'
		| 'find'
		| 'count'
		| 'exists'
		| 'create'
		| 'update'
		| 'upsert'
		| 'delete'
		| 'findMany'
		| 'findOne'
		| 'createOne'
		| 'createMany'
		| 'updateOne'
		| 'updateMany'
		| 'upsertOne'
		| 'upsertMany'
		| 'deleteOne'
		| 'deleteMany'
	>()
	expectTypeOf<SchemaExposeRule>().toExtend<boolean | NativeExposureRules>()
})
