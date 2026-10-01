import { expectTypeOf, test } from 'vitest'

import {
	type SchemaDraft,
	type SchemaPreparedDraft,
	type SchemaResult,
} from '../../index.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'

const LifecycleModel = UltimaBase.Schema.define({
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
	// Drafts cannot expose persisted commands through source-typed fields.
	expectTypeOf(draft).not.toHaveProperty('update')
	// @ts-expect-error -- The public constructor accepts no private construction key.
	new LifecycleModel({ title: 'Forged' }, Symbol('persisted'))

	expectTypeOf(prepared.get).toBeFunction()
	expectTypeOf(prepared.toJSON).toBeFunction()
	expectTypeOf(prepared).not.toHaveProperty('create')
	expectTypeOf(prepared).not.toHaveProperty('toPointer')

	expectTypeOf(persisted.fetch).toBeFunction()
	expectTypeOf(persisted.update).toBeFunction()
	expectTypeOf(persisted.toPointer).toBeFunction()
	expectTypeOf(persisted).not.toHaveProperty('create')
})
