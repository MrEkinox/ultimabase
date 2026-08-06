import { expectTypeOf, test } from 'vitest'

import {
	Pointer,
	Schema,
	type PointerJSON,
	type PointerValue,
	type InferQueryResult,
} from '../../index.js'

const userSchema = Schema.define({ className: 'PointerUser', fields: {} })
const otherSchema = Schema.define({ className: 'PointerOther', fields: {} })

test('preserves exact schema identity through construction and convenience', () => {
	const direct = new Pointer(userSchema, 'user-1')
	const convenient = userSchema.pointer('user-1')

	expectTypeOf(direct).toEqualTypeOf<Pointer<typeof userSchema>>()
	expectTypeOf(convenient).toEqualTypeOf<Pointer<typeof userSchema>>()
	expectTypeOf(direct.schema).toEqualTypeOf<typeof userSchema>()
	expectTypeOf(direct.id).toBeString()
	expectTypeOf(direct.toJSON()).toEqualTypeOf<
		Readonly<PointerJSON<'PointerUser'>>
	>()
	expectTypeOf(direct).toExtend<PointerValue>()
	expectTypeOf(direct.findOne({ select: { id: true } })).toEqualTypeOf<
		Promise<InferQueryResult<typeof userSchema, 'id'> | null>
	>()

	// @ts-expect-error -- The erased boundary remains nominal to Core Pointer values.
	const forged: PointerValue = { id: 'forged', toJSON: () => direct.toJSON() }
	void forged

	// @ts-expect-error -- A Pointer retains its exact target schema.
	const wrongTarget: Pointer<typeof otherSchema> = direct
	void wrongTarget
	void otherSchema
})

test('narrows unknown values without weakening the schema type', () => {
	const value: unknown = userSchema.pointer('user-1')

	if (Pointer.is(value)) {
		expectTypeOf(value).toEqualTypeOf<Pointer>()
	}
})
