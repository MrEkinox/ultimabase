import { expectTypeOf, test } from 'vitest'

import {
	type CreateInput,
	type Model,
	type Pointer,
	type SchemaPreparedDraft,
	type SchemaResult,
	type UpdateInput,
} from '../../index.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'

const Author = UltimaBase.Schema.define({
	className: 'PlainResultAuthor',
	fields: (field) => ({ name: field.string({ required: true }) }),
})

const LifecycleModel = UltimaBase.Schema.define({
	className: 'LifecycleModelTypeContract',
	fields: (field) => ({
		author: field.pointer({ target: () => Author }),
		summary: field.string(),
		title: field.string({ required: true }),
		views: field.int({ default: 0 }),
	}),
})
declare const prepared: SchemaPreparedDraft<typeof LifecycleModel>
declare const persisted: SchemaResult<typeof LifecycleModel>

// ADR-0310: results are frozen plain data without methods.
test('types results as readonly data without methods', async () => {
	// @ts-expect-error -- Public fields cannot be reassigned.
	persisted.title = 'Changed'
	expectTypeOf(persisted).not.toHaveProperty('update')
	expectTypeOf(persisted).not.toHaveProperty('toJSON')
	expectTypeOf(persisted).not.toHaveProperty('relation')
	expectTypeOf(persisted.title).toBeString()
	expectTypeOf(prepared).not.toHaveProperty('get')
	expectTypeOf(prepared.title).toBeString()

	const selected = await LifecycleModel.findOneOrThrow({
		select: { title: true },
	})
	expectTypeOf(selected).toEqualTypeOf<{
		readonly id: string
		readonly title: string
	}>()

	// @ts-expect-error -- A schema has no constructor (ADR-0310).
	void new LifecycleModel({ title: 'Draft' })
})

test('names results and inputs by schema type', async () => {
	const complete = await LifecycleModel.findOneOrThrow()

	expectTypeOf(complete).toEqualTypeOf<Model<typeof LifecycleModel>>()
	expectTypeOf<
		NonNullable<Model<typeof LifecycleModel>['author']>
	>().toExtend<Pointer>()
	expectTypeOf<
		NonNullable<Model<typeof LifecycleModel>['author']>['id']
	>().toBeString()
	expectTypeOf<CreateInput<typeof LifecycleModel>['title']>().toBeString()
	// Create and update data include nested link writes (ADR-0308).
	const data: CreateInput<typeof LifecycleModel> = {
		title: 'Linked',
		author: { connect: '0198f090-2a50-7000-8000-000000000001' },
	}
	void LifecycleModel.createOne({ data })
	const patch: UpdateInput<typeof LifecycleModel> = {
		author: null,
		views: { increment: 1 },
	}
	void LifecycleModel.updateOne({
		where: { id: '0198f090-2a50-7000-8000-000000000002' },
		data: patch,
	})
	// `CreateInput` and `UpdateInput` are exactly the `data` of `createOne` and
	// `updateOne` (ADR-0310).
	expectTypeOf<CreateInput<typeof LifecycleModel>>().toEqualTypeOf<
		Parameters<typeof LifecycleModel.createOne>[0]['data']
	>()
	expectTypeOf<UpdateInput<typeof LifecycleModel>>().toEqualTypeOf<
		Parameters<typeof LifecycleModel.updateOne>[0]['data']
	>()
	// @ts-expect-error -- Update data keeps exact field types.
	const invalid: UpdateInput<typeof LifecycleModel> = { title: 42 }
	// @ts-expect-error -- Update data names at least one field.
	const empty: UpdateInput<typeof LifecycleModel> = {}
	void invalid
	void empty
})
