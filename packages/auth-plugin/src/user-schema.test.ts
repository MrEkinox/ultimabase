import { stringField, UltimaBase } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import {
	ScriptedTestDatabase,
	testDatabasePlugin,
} from '../../../tooling/vitest/test-database.js'
import { defineAuthMethod } from './method.js'
import { authPlugin } from './plugin.js'

/** One application class with a method that owns `secret` and the email. */
const createApp = () =>
	UltimaBase.use(
		authPlugin({
			methods: [
				defineAuthMethod({
					name: 'fixture',
					contributions: () => [],
					userEmail: true,
					userFields: () => ({ secret: stringField() }),
				}),
			],
		}),
	)

/** Returns what `work` throws. */
const thrown = (work: () => unknown): unknown => {
	try {
		work()
	} catch (error: unknown) {
		return error
	}
	throw new TypeError('Nothing was thrown')
}

/** Calls `define` with options its types refuse, as untyped callers can. */
const defineUntyped = (options: unknown): void => {
	const { UserSchema } = createApp()
	const define: unknown = Reflect.get(UserSchema, 'define')
	if (typeof define !== 'function') throw new TypeError('No define')
	Reflect.apply(define, UserSchema, [options])
}

describe('App.UserSchema.define', () => {
	it('rejects malformed options', () => {
		expect(() => {
			defineUntyped('User')
		}).toThrow('UserSchema options must be a plain object')
		expect(() => {
			defineUntyped({ className: 'User', colour: 'red' })
		}).toThrow('Unknown UserSchema option: colour')
		expect(() => {
			defineUntyped({ className: 42 })
		}).toThrow('className must be a non-empty string')
		expect(() => {
			defineUntyped({ className: 'User', fields: {} })
		}).toThrow('fields must be a function')
		expect(() => createApp().UserSchema.define({ className: '' })).toThrow(
			'className must be a non-empty string',
		)
	})

	it('accepts one User schema per plugin instance', () => {
		const App = createApp()
		const User = App.UserSchema.define({ className: 'OnlyUser' })
		expect(User.className).toBe('OnlyUser')
		expect(App.UserSchema.define({ className: 'OnlyUser' }).className).toBe(
			'OnlyUser',
		)
		expect(() => App.UserSchema.define({ className: 'OtherUser' })).toThrow(
			'authPlugin accepts one User schema; OnlyUser is already declared',
		)
	})

	it('reserves the fields the methods and the foundation own', () => {
		for (const name of ['secret', 'email', 'emailVerified', 'password']) {
			const App = createApp()
			expect(
				thrown(() =>
					App.UserSchema.define({
						className: 'ReservedUser',
						fields: (field) => ({ [name]: field.string() }),
					}),
				),
				name,
			).toMatchObject({ cause: { message: `Reserved User field: ${name}` } })
		}
		expect(
			thrown(() => {
				defineUntyped({ className: 'ArrayUser', fields: () => [] })
			}),
		).toMatchObject({
			cause: { message: 'ArrayUser.fields must return an object' },
		})
	})

	it('requires the application to register its User schema', async () => {
		const App = UltimaBase.use(
			testDatabasePlugin(new ScriptedTestDatabase(), {
				id: 'fixture.auth-database',
			}),
			authPlugin({
				methods: [
					defineAuthMethod({ name: 'fixture', contributions: () => [] }),
				],
			}),
		)
		const ultimabase = new App({ logger: false, schemas: [] })
		try {
			await expect(ultimabase.start()).rejects.toThrow(
				'authPlugin needs one User schema',
			)
		} finally {
			await ultimabase.dispose()
		}
	})
})
