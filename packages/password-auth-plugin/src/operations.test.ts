import { PluginError } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import {
	passwordAuthErrorCodes,
	passwordAuthOperations,
	rejectPasswordCredentials,
	rejectPasswordSession,
	rejectPasswordSignUp,
} from './operations.js'
import { passwordAuthGraphqlBindings } from './graphql-operation-bindings.js'
import {
	createPasswordSessionToken,
	digestPasswordSessionToken,
	isPasswordSessionToken,
} from './session.js'

describe('Password Auth operation contracts', () => {
	it('declares exact names, versions, transactions, and public errors', () => {
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
	})

	it('creates only the three uniform public failures', () => {
		for (const [create, code] of [
			[rejectPasswordSignUp, passwordAuthErrorCodes.signUpRejected],
			[rejectPasswordCredentials, passwordAuthErrorCodes.invalidCredentials],
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
			'login',
			'logout',
			'refresh',
			'signUp',
		])
		expect(passwordAuthGraphqlBindings.signUp).toMatchObject({
			metadata: {
				field: 'signUp',
				input: {
					kind: 'non-null',
					ofType: { kind: 'named', name: 'PasswordAuthCredentialsInput' },
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
