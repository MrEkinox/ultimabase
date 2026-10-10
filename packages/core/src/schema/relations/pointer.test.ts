import { describe, expect, it } from 'vitest'

import { Pointer, snapshotPointerValue } from '../../index.js'
import { createPointer } from './pointer.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'

const userSchema = UltimaBase.Schema.define({
	className: 'PointerUser',
	fields: () => ({}),
})
const otherSchema = UltimaBase.Schema.define({
	className: 'PointerOther',
	fields: () => ({}),
})
const targetId = '0198f090-2a50-7000-8000-000000000034'

describe('Pointer', () => {
	it('keeps one immutable logical identity without loading its target', () => {
		const pointer = userSchema.pointer(targetId)

		expect(pointer.schema).toBe(userSchema)
		expect(pointer.id).toBe(targetId)
		expect(pointer.toJSON()).toStrictEqual({
			type: 'pointer',
			className: 'PointerUser',
			id: targetId,
		})
		expect(JSON.stringify(pointer)).toBe(
			`{"type":"pointer","className":"PointerUser","id":"${targetId}"}`,
		)
		expect(Object.isFrozen(pointer)).toBe(true)
		expect(Object.isFrozen(pointer.toJSON())).toBe(true)
		expect(Pointer.is(pointer)).toBe(true)
		expect(Pointer.is(pointer.toJSON())).toBe(false)
	})

	it('compares exact schema identity together with the target id', () => {
		const pointer = userSchema.pointer(targetId)

		expect(pointer.equals(userSchema.pointer(targetId))).toBe(true)
		expect(pointer.equals(userSchema.pointer(`${targetId}-other`))).toBe(false)
		expect(pointer.equals(otherSchema.pointer(targetId))).toBe(false)
		expect(pointer.equals(pointer.toJSON())).toBe(false)
	})

	it('creates the same typed identity through its target schema', () => {
		const pointer = userSchema.pointer(targetId)

		expect(pointer).toBeInstanceOf(Pointer)
		expect(pointer.schema).toBe(userSchema)
		expect(pointer.id).toBe(targetId)
	})

	it('keeps id, schema, equals and toJSON only (ADR-0310)', () => {
		const pointer = userSchema.pointer(targetId)

		expect('findOne' in pointer).toBe(false)
		expect('exists' in pointer).toBe(false)
		expect(typeof pointer.equals).toBe('function')
		expect(pointer.toJSON()).toStrictEqual({
			className: userSchema.className,
			id: targetId,
			type: 'pointer',
		})
	})

	it('structurally shares trusted values at snapshot boundaries', () => {
		const pointer = userSchema.pointer(targetId)

		// A Pointer contains only frozen schema identity and an immutable string.
		expect(snapshotPointerValue(pointer, 'input.author')).toBe(pointer)
		expect(() =>
			snapshotPointerValue(pointer.toJSON(), 'input.author'),
		).toThrow(new TypeError('input.author must be a Pointer'))
	})

	it('rejects direct construction, forged schemas, invalid ids, and subclasses', () => {
		// ADR-0314: only a schema creates its Pointers.
		expect(() => {
			Reflect.construct(Pointer, [userSchema, targetId])
		}).toThrow(
			new TypeError(
				'Pointer cannot be constructed directly: use Schema.pointer(id), for example Todo.pointer(id)',
			),
		)
		expect(() => createPointer({} as never, targetId)).toThrow(
			new TypeError('Pointer schema must be created by App.Schema.define'),
		)
		expect(() => userSchema.pointer('')).toThrow()

		// @ts-expect-error -- The constructor is private (ADR-0314).
		class ExtendedPointer extends Pointer<typeof userSchema> {}
		expect(() => {
			Reflect.construct(ExtendedPointer, [userSchema, targetId])
		}).toThrow(TypeError)
	})
})
