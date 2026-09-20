import { UltimaBase, Schema } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'
import { PasswordUser, PasswordUserSchema } from './index.js'

const credentials = {
	username: 'Ada',
	password: 'correct horse battery staple',
}

describe('Password User static authentication boundary', () => {
	it('defines immutable methods without changing schema identity or model instances', () => {
		const User = PasswordUserSchema.define({
			className: 'User',
			fields: () => ({}),
		})
		for (const schema of [User, PasswordUser]) {
			expect(Schema.is(schema)).toBe(true)
			expect(Object.isFrozen(schema)).toBe(true)
			const draft = new schema({ username: 'ada' })
			expect(draft).toBeInstanceOf(schema)
			for (const method of ['signUp', 'login', 'refresh', 'logout']) {
				expect(Object.getOwnPropertyDescriptor(schema, method)).toMatchObject({
					enumerable: false,
					writable: false,
					configurable: false,
				})
				expect(draft).not.toHaveProperty(method)
			}
		}
	})
	it('requires an active or explicit started application before credential work', async () => {
		await expect(PasswordUser.signUp(credentials)).rejects.toMatchObject({
			code: 'MISSING_EXECUTION_CONTEXT',
		})
		const ultimabase = new UltimaBase({ schemas: [], plugins: [] })
		try {
			await expect(
				PasswordUser.login(credentials, { ultimabase }),
			).rejects.toThrow('started UltimaBase')
		} finally {
			await ultimabase.dispose()
		}
		await expect(PasswordUser.refresh('token', { ultimabase })).rejects.toThrow(
			'started UltimaBase',
		)
	})
	it('rejects malformed JavaScript options and forged application identities', async () => {
		for (const options of [
			null,
			[],
			{ useMasterKey: true },
			{ context: {} },
			{ [Symbol('option')]: true },
		]) {
			await expect(
				PasswordUser.signUp(credentials, options as never),
			).rejects.toThrow('accept only ultimabase')
		}
		await expect(
			PasswordUser.logout('token', { ultimabase: {} as never }),
		).rejects.toThrow('UltimaBase instance')
	})
})
