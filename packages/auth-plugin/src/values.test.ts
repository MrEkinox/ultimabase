import { UltimaBase } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import { toAuthPayload } from './graphql.js'
import { createAuthPrincipal } from './principal.js'
import {
	acknowledgement,
	authenticationResult,
	listResult,
	nullInput,
	profileResult,
	stringFieldsInput,
} from './values.js'

const Account = UltimaBase.Schema.define({
	className: 'ValueAccount',
	fields: () => ({}),
})
const id = '0199325a-0c00-7000-8000-000000000001'
const token = `ub_s1.${'a'.repeat(43)}`

const result = (overrides: Readonly<Record<string, unknown>> = {}) => ({
	principal: createAuthPrincipal(Account.pointer(id)),
	session: Object.freeze({
		absoluteExpiresAt: '2026-11-16T10:00:00.000Z',
		expiresAt: '2026-10-24T10:00:00.000Z',
		id: 'session-1',
		token,
	}),
	user: Object.freeze({ id }),
	...overrides,
})

describe('operation values', () => {
	it('accepts exactly the null input of session-only operations', () => {
		expect(nullInput.snapshot(null, 'current')).toBeNull()
		expect(() => nullInput.snapshot({}, 'current')).toThrow(
			'current must be null',
		)
	})

	it('accepts exactly the named string fields', () => {
		const input = stringFieldsInput(['email', 'token'])
		const snapshot = input.snapshot(
			{ email: 'ada@example.test', token: 't' },
			'verify',
		)
		expect(snapshot).toStrictEqual({ email: 'ada@example.test', token: 't' })
		expect(Object.isFrozen(snapshot)).toBe(true)
		for (const value of [
			{ email: 'ada@example.test' },
			{ email: 'ada@example.test', token: 't', extra: 'x' },
			{ email: 1, token: 't' },
			'ada@example.test',
		]) {
			expect(() => input.snapshot(value, 'verify')).toThrow(
				'verify must contain exactly email, token',
			)
		}
	})

	it('accepts one exact acknowledgement', () => {
		const revoked = acknowledgement('revoked')
		expect(revoked.snapshot({ revoked: true }, 'logout')).toStrictEqual({
			revoked: true,
		})
		for (const value of [
			{ revoked: false },
			{ revoked: true, all: true },
			null,
		]) {
			expect(() => revoked.snapshot(value, 'logout')).toThrow(
				'logout must be { revoked: true }',
			)
		}
	})

	it('accepts only frozen profiles with an id', () => {
		const profile = Object.freeze({ id })
		expect(profileResult.snapshot(profile, 'current')).toBe(profile)
		for (const value of [{ id }, Object.freeze({ id: 1 }), null]) {
			expect(() => profileResult.snapshot(value, 'current')).toThrow(
				'current must be a User profile',
			)
		}
	})

	it('accepts only package principals whose profile and session match', () => {
		const snapshot = authenticationResult.snapshot(result(), 'login')
		expect(snapshot.session).toStrictEqual(result().session)
		expect(snapshot.user.id).toBe(id)
		for (const overrides of [
			{ principal: { user: Account.pointer(id) } },
			{ user: Object.freeze({ id: 'someone-else' }) },
			{ user: { id } },
			{ session: Object.freeze({ ...result().session, token: 'forged' }) },
			{ session: Object.freeze({ ...result().session, extra: 1 }) },
			{ extra: true },
		]) {
			expect(
				() => authenticationResult.snapshot(result(overrides), 'login'),
				Object.keys(overrides).join(),
			).toThrow('login must be an authentication result')
		}
	})

	it('accepts only frozen lists of frozen records', () => {
		const sessions = listResult('sessions')
		const items = Object.freeze([Object.freeze({ id: 's1' })])
		expect(sessions.snapshot({ sessions: items }, 'list')).toStrictEqual({
			sessions: [{ id: 's1' }],
		})
		for (const value of [
			{ sessions: [Object.freeze({ id: 's1' })] },
			{ sessions: Object.freeze([{ id: 's1' }]) },
			{ sessions: items, more: true },
			{ methods: items },
			null,
		]) {
			expect(() => sessions.snapshot(value, 'list')).toThrow(
				'list must be { sessions: [...] }',
			)
		}
	})

	it('keeps the profile and session of a GraphQL sign-in payload, never its principal', () => {
		const payload = toAuthPayload(result())
		expect(payload).toStrictEqual({ session: result().session, user: { id } })
		expect(toAuthPayload(null)).toBeNull()
	})
})
