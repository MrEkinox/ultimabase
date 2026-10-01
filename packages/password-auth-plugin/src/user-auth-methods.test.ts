import { Schema } from '@ultimabase/core'
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
			for (const method of [
				'changePassword',
				'current',
				'logout',
				'logoutEverywhere',
				'login',
				'refresh',
				'signUp',
			]) {
				expect(Object.getOwnPropertyDescriptor(schema, method)).toMatchObject({
					enumerable: false,
					writable: false,
					configurable: false,
				})
				expect(draft).not.toHaveProperty(method)
			}
		}
	})
	it('requires the sole active started application before credential work', async () => {
		await expect(PasswordUser.signUp(credentials)).rejects.toMatchObject({
			code: 'MISSING_EXECUTION_CONTEXT',
		})
		await expect(PasswordUser.login(credentials)).rejects.toMatchObject({
			code: 'MISSING_EXECUTION_CONTEXT',
		})
		await expect(PasswordUser.refresh('token')).rejects.toMatchObject({
			code: 'MISSING_EXECUTION_CONTEXT',
		})
	})
	it('rejects removed JavaScript application-selection options', async () => {
		const signUpWithOptions = PasswordUser.signUp.bind(PasswordUser) as (
			input: typeof credentials,
			options: unknown,
		) => Promise<unknown>
		for (const options of [
			null,
			[],
			{ useMasterKey: true },
			{ context: {} },
			{ ultimabase: {} },
			{ [Symbol('option')]: true },
		]) {
			await expect(signUpWithOptions(credentials, options)).rejects.toThrow(
				'do not accept application options',
			)
		}
		const logoutWithOptions = PasswordUser.logout.bind(PasswordUser) as (
			token: string,
			options: unknown,
		) => Promise<unknown>
		await expect(
			logoutWithOptions('token', { ultimabase: {} }),
		).rejects.toThrow('do not accept application options')
		const logoutEverywhereWithOptions = PasswordUser.logoutEverywhere.bind(
			PasswordUser,
		) as (options: unknown) => Promise<unknown>
		await expect(
			logoutEverywhereWithOptions({ ultimabase: {} }),
		).rejects.toThrow('do not accept application options')
	})
})
