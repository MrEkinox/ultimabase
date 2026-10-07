import { expectTypeOf, test } from 'vitest'

import {
	type Pointer,
	type SchemaDraft,
	type SchemaPreparedDraft,
	type SchemaResult,
} from '../../index.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'

const LifecycleModel = UltimaBase.Schema.define({
	className: 'LifecycleModelTypeContract',
	fields: (field) => ({
		summary: field.string(),
		title: field.string({ required: true }),
	}),
})
declare const prepared: SchemaPreparedDraft<typeof LifecycleModel>
declare const persisted: SchemaResult<typeof LifecycleModel>

test('keeps composed model commands readonly and result selections exact', async () => {
	// Models expose immutable snapshots, including their persistence methods.
	// @ts-expect-error -- Public fields cannot be reassigned.
	persisted.title = 'Changed'
	const updateCommand = persisted.update
	// @ts-expect-error -- Flattening is not required to keep commands readonly.
	persisted.update = updateCommand
	const snapshotCommand = persisted.toJSON
	// @ts-expect-error -- Snapshot helpers remain readonly too.
	persisted.toJSON = snapshotCommand
	expectTypeOf(persisted.toPointer()).toEqualTypeOf<
		Pointer<typeof LifecycleModel>
	>()

	const selected = await persisted.update({
		data: { title: 'Updated' },
		select: { title: true },
	})
	expectTypeOf(selected.title).toBeString()
	expectTypeOf(selected.id).toBeString()
	expectTypeOf(selected).not.toHaveProperty('summary')
	expectTypeOf(selected.get('title')).toBeString()
	// @ts-expect-error -- Snapshot reads cannot recover omitted fields.
	selected.get('summary')
	// @ts-expect-error -- Mutation payloads keep their exact field types.
	void selected.update({ data: { title: 42 } })
	const fetchCommand = selected.fetch
	// @ts-expect-error -- Selected commands also remain readonly.
	selected.fetch = fetchCommand

	// A new command can select a field absent from its immutable receiver.
	const fetched = await selected.fetch({ select: { summary: true } })
	expectTypeOf(fetched.summary).toEqualTypeOf<string | null>()
	expectTypeOf(fetched).not.toHaveProperty('title')
	const deleted = await selected.delete({ select: { title: true } })
	expectTypeOf(deleted.title).toBeString()
})

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
