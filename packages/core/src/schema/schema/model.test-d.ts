import { expectTypeOf, test } from 'vitest'

import {
	Schema,
	type SchemaDraft,
	type SchemaPreparedDraft,
	type SchemaResult,
} from '../../index.js'

const LifecycleModel = Schema.define({
	className: 'LifecycleModelTypeContract',
	fields: (field) => ({ title: field.string() }),
})
declare const prepared: SchemaPreparedDraft<typeof LifecycleModel>
declare const persisted: SchemaResult<typeof LifecycleModel>

test('keeps model lifecycle commands distinct across public states', () => {
	const draft = new LifecycleModel({ title: 'Draft' })

	expectTypeOf(draft).toExtend<SchemaDraft<typeof LifecycleModel>>()
	expectTypeOf(draft.create).toBeFunction()
	expectTypeOf(draft.upsert).toBeFunction()
	// The no-Typegen field fallback is unknown, never a callable persisted command.
	expectTypeOf(draft.update).toBeUnknown()
	// @ts-expect-error -- The public constructor accepts no private construction key.
	new LifecycleModel({ title: 'Forged' }, Symbol('persisted'))

	expectTypeOf(prepared.get).toBeFunction()
	expectTypeOf(prepared.toJSON).toBeFunction()
	expectTypeOf(prepared.create).toBeUnknown()
	expectTypeOf(prepared.toPointer).toBeUnknown()

	expectTypeOf(persisted.fetch).toBeFunction()
	expectTypeOf(persisted.update).toBeFunction()
	expectTypeOf(persisted.toPointer).toBeFunction()
	expectTypeOf(persisted.create).toBeUnknown()
})
