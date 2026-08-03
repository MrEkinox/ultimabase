import { describe, expect, it } from 'vitest'

import { Pointer, Schema, snapshotPointerValue } from '../../index.js'

const userSchema = Schema.define({ className: 'PointerUser', fields: {} })
const otherSchema = Schema.define({ className: 'PointerOther', fields: {} })
const targetId = '0198f090-2a50-7000-8000-000000000034'

describe('Pointer', () => {
	it('keeps one immutable logical identity without loading its target', () => {
		const pointer = new Pointer(userSchema, targetId)

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
		const pointer = new Pointer(userSchema, targetId)

		expect(pointer.equals(new Pointer(userSchema, targetId))).toBe(true)
		expect(pointer.equals(new Pointer(userSchema, `${targetId}-other`))).toBe(
			false,
		)
		expect(pointer.equals(new Pointer(otherSchema, targetId))).toBe(false)
		expect(pointer.equals(pointer.toJSON())).toBe(false)
	})

	it('creates the same typed identity through its target schema', () => {
		const pointer = userSchema.pointer(targetId)

		expect(pointer).toBeInstanceOf(Pointer)
		expect(pointer.schema).toBe(userSchema)
		expect(pointer.id).toBe(targetId)
	})

	it('builds one ordinary target query scoped by the pointer id', () => {
		const pointer = userSchema.pointer(targetId)
		const query = pointer.query().select('id')

		expect(query.schema).toBe(userSchema)
		// The identity is private Runtime state and cannot be serialized or removed by hooks.
		expect(query.ast.where).toBeUndefined()
		expect(query.ast.selection.fields).toStrictEqual([
			{ kind: 'selected-field', field: 'id' },
		])
	})

	it('structurally shares trusted values at snapshot boundaries', () => {
		const pointer = new Pointer(userSchema, targetId)

		// A Pointer contains only frozen schema identity and an immutable string.
		expect(snapshotPointerValue(pointer, 'input.author')).toBe(pointer)
		expect(() =>
			snapshotPointerValue(pointer.toJSON(), 'input.author'),
		).toThrow(new TypeError('input.author must be a Pointer'))
	})

	it('rejects forged schemas, invalid ids, and subclass construction', () => {
		expect(() => {
			// @ts-expect-error -- Runtime construction protects JavaScript callers.
			new Pointer({}, targetId)
		}).toThrow(new TypeError('Pointer schema must be created by Schema.define'))
		expect(() => new Pointer(userSchema, '')).toThrow()

		class ExtendedPointer extends Pointer<typeof userSchema> {}

		expect(() => new ExtendedPointer(userSchema, targetId)).toThrow(
			new TypeError('Pointer cannot be subclassed'),
		)
	})
})
