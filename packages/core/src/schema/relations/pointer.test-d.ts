import { expectTypeOf, test } from 'vitest'

import { Pointer, type PointerJSON, type PointerValue } from '../../index.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'

const userSchema = UltimaBase.Schema.define({
	className: 'PointerUser',
	fields: () => ({}),
})
const otherSchema = UltimaBase.Schema.define({
	className: 'PointerOther',
	fields: () => ({}),
})

test('preserves exact schema identity through its schema', () => {
	const direct = userSchema.pointer('user-1')

	expectTypeOf(direct).toEqualTypeOf<Pointer<typeof userSchema>>()
	expectTypeOf(direct.schema).toEqualTypeOf<typeof userSchema>()
	expectTypeOf(direct.id).toBeString()
	expectTypeOf(direct.toJSON()).toEqualTypeOf<
		Readonly<PointerJSON<'PointerUser'>>
	>()
	expectTypeOf(direct).toExtend<PointerValue>()
	// @ts-expect-error -- Pointers no longer read their target (ADR-0310).
	void direct.findOne
	// @ts-expect-error -- Pointers no longer test their target (ADR-0310).
	void direct.exists

	// @ts-expect-error -- The erased boundary remains nominal to Core Pointer values.
	const forged: PointerValue = { id: 'forged', toJSON: () => direct.toJSON() }
	void forged

	// @ts-expect-error -- A Pointer retains its exact target schema.
	const wrongTarget: Pointer<typeof otherSchema> = direct
	void wrongTarget
	void otherSchema
})

test('creates Pointers only through their schema (ADR-0314)', () => {
	// @ts-expect-error -- The Pointer constructor is not public.
	void new Pointer(userSchema, 'user-1')
	// @ts-expect-error -- A schema creates its own Pointers; it takes no class name.
	void userSchema.pointer('PointerUser', 'user-1')
	expectTypeOf<Parameters<typeof userSchema.pointer>>().toEqualTypeOf<
		[id: string]
	>()
	// A class name still types a registered Pointer for annotations.
	expectTypeOf<Pointer<'PointerUser'>['id']>().toBeString()
})

test('narrows unknown values without weakening the schema type', () => {
	const value: unknown = userSchema.pointer('user-1')

	if (Pointer.is(value)) {
		expectTypeOf(value).toEqualTypeOf<Pointer>()
	}
})
