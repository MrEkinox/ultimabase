import { Pointer, UltimaBase } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import { snapshotSignUpInput } from './user-creation.js'

const Profile = UltimaBase.Schema.define({
	className: 'SnapshotProfile',
	fields: (field) => ({ name: field.string() }),
})

describe('snapshotSignUpInput', () => {
	it('detaches plain data, bytes and pointers before credential work', () => {
		const bytes = new Uint8Array([1, 2, 3])
		const pointer = Profile.pointer('0198c000-0000-7000-8000-000000000001')
		const snapshot = snapshotSignUpInput(
			{
				avatar: bytes,
				nested: { list: [1, 'a'] },
				owner: pointer,
				password: 'x',
			},
			'sign-up',
			['password'],
		)
		bytes[0] = 9
		expect(Object.isFrozen(snapshot)).toBe(true)
		expect(snapshot.nested).toStrictEqual({ list: [1, 'a'] })
		expect(Pointer.is(snapshot.owner)).toBe(true)
		expect(snapshot.avatar).not.toBeInstanceOf(Uint8Array)
	})

	it('rejects missing method fields, cycles and non-plain values', () => {
		expect(() => snapshotSignUpInput({}, 'sign-up', ['password'])).toThrow(
			'sign-up must contain password beside User create fields',
		)
		const cyclic: Record<string, unknown> = { password: 'x' }
		cyclic.self = cyclic
		expect(() => snapshotSignUpInput(cyclic, 'sign-up', ['password'])).toThrow(
			'Cyclic sign-up input',
		)
		expect(() =>
			snapshotSignUpInput({ password: 'x', when: new Date() }, 'sign-up', [
				'password',
			]),
		).toThrow('Sign-up values must be plain data')
		expect(() =>
			snapshotSignUpInput({ password: 'x', run: () => undefined }, 'sign-up', [
				'password',
			]),
		).toThrow('Unsupported sign-up value')
	})
})
