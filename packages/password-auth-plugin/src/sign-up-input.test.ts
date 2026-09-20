import { describe, expect, it } from 'vitest'
import { passwordAuthOperations } from './operations.js'
import {
	restorePasswordSignUpValue,
	snapshotPasswordSignUpInput,
} from './sign-up-input.js'

const credentials = {
	username: 'Ada',
	password: 'correct horse battery staple',
}

describe('schema signup input snapshots', () => {
	it('detaches nested data and binary values before asynchronous execution', () => {
		const avatar = new Uint8Array([1, 2, 3])
		const input = {
			...credentials,
			profile: { names: ['Ada'], avatar },
			serial: 42n,
		}
		const snapshot = snapshotPasswordSignUpInput(input, 'input')
		input.profile.names.push('changed')
		avatar[0] = 99
		expect(Object.isFrozen(snapshot)).toBe(true)
		const restored = restorePasswordSignUpValue(snapshot)
		expect(restored).toEqual({
			...credentials,
			profile: { names: ['Ada'], avatar: new Uint8Array([1, 2, 3]) },
			serial: 42n,
		})
		// A second snapshot retains the opaque bytes, and every restoration gets a copy.
		expect(
			restorePasswordSignUpValue(
				snapshotPasswordSignUpInput(snapshot, 'input'),
			),
		).toEqual(restored)
		expect(restorePasswordSignUpValue(snapshot)).not.toBe(restored)
	})
	it('rejects executable or cyclic data and leaves login credentials exact', () => {
		const cycle: Record<string, unknown> = {}
		cycle.self = cycle
		for (const profile of [
			cycle,
			() => undefined,
			Symbol('invalid'),
			new Map(),
		]) {
			expect(() =>
				snapshotPasswordSignUpInput({ ...credentials, profile }, 'input'),
			).toThrow()
		}
		expect(() =>
			passwordAuthOperations.login.input.snapshot(
				{ ...credentials, displayName: 'Ada' },
				'input',
			),
		).toThrow()
		expect(() =>
			snapshotPasswordSignUpInput({ username: 'Ada' }, 'input'),
		).toThrow()
	})
})
