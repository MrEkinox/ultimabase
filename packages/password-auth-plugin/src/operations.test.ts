import {
	PluginError,
	SchemaRegistry,
	materializeSchemaModel,
} from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import {
	passwordAuthErrorCodes,
	passwordAuthOperations,
	passwordAuthRestBindings,
	rejectPasswordCredentials,
	rejectPasswordChange,
	rejectPasswordSession,
	rejectPasswordSignUp,
	toPasswordAuthenticationPayload,
} from './operations.js'
import { passwordAuthGraphqlBindings } from './graphql-operation-bindings.js'
import { createPasswordPrincipal } from './principal.js'
import { PasswordUserSchema } from './user-schema.js'
import {
	createPasswordSessionToken,
	digestPasswordSessionToken,
	isPasswordSessionToken,
} from './session.js'

describe('Password Auth operation contracts', () => {
	it('owns short REST paths independently from internal operation names', () => {
		for (const [name, path] of [
			['changePassword', '/auth/change-password'],
			['signUp', '/auth/sign-up'],
			['login', '/auth/login'],
			['refresh', '/auth/refresh'],
			['logout', '/auth/logout'],
			['logoutEverywhere', '/auth/logout-everywhere'],
		] as const) {
			expect(passwordAuthRestBindings[name].metadata).toMatchObject({ path })
			expect(passwordAuthRestBindings[name].operation).toBe(
				passwordAuthOperations[name],
			)
		}
	})

	it('snapshots only a persisted profile matching the authenticated identity', () => {
		const User = PasswordUserSchema.define({
			className: 'User',
			fields: () => ({}),
		})
		new SchemaRegistry([User]).resolveSchemaTargets()
		const id = '01991f00-0000-7000-8000-000000000101'
		const profile = materializeSchemaModel(User, { id, username: 'ada' })
		const result = {
			principal: createPasswordPrincipal(User.pointer(id)),
			session: {
				absoluteExpiresAt: '2026-10-19T00:00:00.000Z',
				expiresAt: '2026-09-26T00:00:00.000Z',
				id,
				token: createPasswordSessionToken().token,
			},
			user: profile,
		}
		const snapshot = passwordAuthOperations.login.result.snapshot(
			result,
			'result',
		)
		expect(snapshot.user).toBe(profile)
		expect(Object.isFrozen(snapshot)).toBe(true)
		expect(Object.isFrozen(snapshot.session)).toBe(true)
		// Wire responses share one profile identity while direct server results retain principal.
		const payload = toPasswordAuthenticationPayload(snapshot)
		expect(payload).toStrictEqual({ session: snapshot.session, user: profile })
		expect(Object.isFrozen(payload)).toBe(true)
		expect(payload).not.toHaveProperty('principal')
		expect(snapshot.principal.user.id).toBe(id)
		for (const invalid of [
			null,
			{ ...result, extra: true },
			{ ...result, principal: { user: result.principal.user } },
			{ ...result, session: null },
			...[
				{ ...result.session, extra: true },
				{ ...result.session, absoluteExpiresAt: 1 },
				{ ...result.session, expiresAt: null },
				{ ...result.session, id: undefined },
				{ ...result.session, token: 'invalid-token' },
			].map((session) => ({ ...result, session })),
		]) {
			expect(() =>
				passwordAuthOperations.login.result.snapshot(invalid, 'result'),
			).toThrow('Password Auth result')
		}
		for (const user of [
			null,
			undefined,
			{},
			1,
			materializeSchemaModel(User, {
				id: '01991f00-0000-7000-8000-000000000102',
			}),
		]) {
			expect(() =>
				passwordAuthOperations.login.result.snapshot(
					{ ...result, user },
					'result',
				),
			).toThrow('Password Auth result')
		}
		const prototype: unknown = Reflect.get(User, 'prototype')
		if (typeof prototype !== 'object' || prototype === null)
			throw new TypeError('Missing model prototype')
		const forged: unknown = Object.create(prototype, {
			toPointer: { value: () => result.principal.user },
		})
		expect(() =>
			passwordAuthOperations.login.result.snapshot(
				{ ...result, user: forged },
				'result',
			),
		).toThrow()
	})

	it('declares exact names, versions, transactions, and public errors', () => {
		expect(Object.isFrozen(passwordAuthOperations)).toBe(true)
		expect(passwordAuthOperations.signUp).toMatchObject({
			errors: [passwordAuthErrorCodes.signUpRejected],
			name: 'ultimabase.password-auth.sign-up',
			target: 'application',
			transaction: 'forbidden',
			version: '1.0.0',
		})
		expect(passwordAuthOperations.login).toMatchObject({
			errors: [passwordAuthErrorCodes.invalidCredentials],
			transaction: 'forbidden',
		})
		expect(passwordAuthOperations.logout).toMatchObject({
			errors: [passwordAuthErrorCodes.invalidSession],
			transaction: 'required',
		})
		expect(passwordAuthOperations.refresh).toMatchObject({
			errors: [passwordAuthErrorCodes.invalidSession],
			transaction: 'required',
		})
		expect(passwordAuthOperations.logoutEverywhere).toMatchObject({
			errors: [passwordAuthErrorCodes.invalidSession],
			transaction: 'required',
		})
		expect(passwordAuthOperations.changePassword).toMatchObject({
			errors: [
				passwordAuthErrorCodes.invalidSession,
				passwordAuthErrorCodes.passwordChangeRejected,
			],
			transaction: 'forbidden',
		})
		for (const operation of Object.values(passwordAuthOperations)) {
			expect(Object.isFrozen(operation)).toBe(true)
			expect(Object.isFrozen(operation.errors)).toBe(true)
		}
	})

	it('snapshots only exact immutable inputs', () => {
		const input = passwordAuthOperations.login.input.snapshot(
			{ password: 'secret', username: 'Ada' },
			'login',
		)
		expect(input).toStrictEqual({ password: 'secret', username: 'Ada' })
		expect(Object.isFrozen(input)).toBe(true)
		expect(() =>
			passwordAuthOperations.login.input.snapshot(
				{ extra: true, password: 'secret', username: 'Ada' },
				'login',
			),
		).toThrow('exactly username and password')
		expect(() =>
			passwordAuthOperations.refresh.input.snapshot({}, 'refresh'),
		).toThrow('must be null')
		const passwordChange = passwordAuthOperations.changePassword.input.snapshot(
			{
				currentPassword: 'current password value',
				newPassword: 'replacement password value',
			},
			'change-password',
		)
		expect(passwordChange).toStrictEqual({
			currentPassword: 'current password value',
			newPassword: 'replacement password value',
		})
		expect(() =>
			passwordAuthOperations.changePassword.input.snapshot(
				{ currentPassword: 'missing replacement' },
				'change-password',
			),
		).toThrow('exactly currentPassword and newPassword')
		// A result acknowledgement must not accept null or contradictory state either.
		for (const result of [
			null,
			{ revoked: false },
			{ revoked: true, extra: true },
		]) {
			expect(() =>
				passwordAuthOperations.logout.result.snapshot(result, 'logout'),
			).toThrow('must acknowledge session revocation')
		}
	})

	it('creates only the four uniform public failures', () => {
		for (const [create, code] of [
			[rejectPasswordSignUp, passwordAuthErrorCodes.signUpRejected],
			[rejectPasswordCredentials, passwordAuthErrorCodes.invalidCredentials],
			[rejectPasswordChange, passwordAuthErrorCodes.passwordChangeRejected],
			[rejectPasswordSession, passwordAuthErrorCodes.invalidSession],
		] as const) {
			try {
				create()
			} catch (error: unknown) {
				expect(error).toBeInstanceOf(PluginError)
				expect(error).toMatchObject({ code, internalDetails: undefined })
			}
		}
	})

	it('owns deterministic callback-free GraphQL bindings for every operation', () => {
		expect(Object.keys(passwordAuthGraphqlBindings).sort()).toStrictEqual([
			'changePassword',
			'login',
			'logout',
			'logoutEverywhere',
			'refresh',
			'signUp',
		])
		expect(passwordAuthGraphqlBindings.signUp).toMatchObject({
			metadata: {
				field: 'signUp',
				input: {
					kind: 'non-null',
					ofType: { kind: 'named', name: 'PasswordAuthSignUpInput' },
				},
				kind: 'graphql-operation-binding',
				result: {
					kind: 'non-null',
					ofType: { kind: 'named', name: 'PasswordAuthPayload' },
				},
				root: 'mutation',
			},
			operation: passwordAuthOperations.signUp,
			transport: {
				name: 'ultimabase.graphql.operation',
				version: '1.0.0',
			},
		})
		expect(passwordAuthGraphqlBindings.logout.metadata).not.toHaveProperty(
			'input',
		)
		for (const binding of Object.values(passwordAuthGraphqlBindings)) {
			expect(Object.isFrozen(binding.metadata)).toBe(true)
			expect(binding.metadata).not.toHaveProperty('decode')
			expect(binding.metadata).not.toHaveProperty('encode')
		}
	})
})

describe('opaque Password Auth session tokens', () => {
	it('uses 256 random bits and stores only a SHA-256 digest', () => {
		const first = createPasswordSessionToken()
		const second = createPasswordSessionToken()
		expect(isPasswordSessionToken(first.token)).toBe(true)
		expect(first.token).not.toBe(second.token)
		expect(first.digest).toMatch(/^[a-f0-9]{64}$/u)
		expect(first.digest).toBe(digestPasswordSessionToken(first.token))
		expect(first.digest).not.toContain(first.token)
		expect(isPasswordSessionToken('ub_s1.short')).toBe(false)
		expect(isPasswordSessionToken('foreign.' + 'a'.repeat(43))).toBe(false)
	})
})
