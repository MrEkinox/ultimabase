import { UltimaBase } from '@ultimabase/core'
import { RequestContext } from '@ultimabase/core/plugin'
import { describe, expect, it } from 'vitest'

import { createAuthPrincipal, isAuthPrincipal } from './principal.js'
import {
	authClient,
	authPrincipal,
	authSession,
	createAuthSession,
	createSessionToken,
	isSessionToken,
	readSessionAuthenticatedAt,
	readSessionGeneration,
	recordSessionAuthentication,
} from './session.js'

const Account = UltimaBase.Schema.define({
	className: 'SessionAccount',
	fields: () => ({}),
})
const context = () =>
	RequestContext.anonymous({ requestId: 'auth-session', source: 'test' })

/** Calls one method with arguments its types refuse, as untyped callers can. */
const callUntyped = (
	target: object,
	name: string,
	...args: readonly unknown[]
): void => {
	const method: unknown = Reflect.get(target, name)
	if (typeof method !== 'function') throw new TypeError(`No ${name}`)
	Reflect.apply(method, target, args)
}
const sessionValues = {
	absoluteExpiresAt: '2026-11-16T10:00:00.000Z',
	authenticatedAt: '2026-10-17T10:00:00.000Z',
	createdAt: '2026-10-17T10:00:00.000Z',
	expiresAt: '2026-10-24T10:00:00.000Z',
	id: 'session-1',
	method: 'password',
	rotationVersion: 0,
}

describe('session tokens', () => {
	it('creates opaque tokens whose digest is stored instead', () => {
		const first = createSessionToken()
		const second = createSessionToken()
		expect(isSessionToken(first.token)).toBe(true)
		expect(first.token).not.toBe(second.token)
		expect(first.digest).toMatch(/^[0-9a-f]{64}$/u)
		expect(first.digest).not.toContain(first.token.slice(6))
		for (const value of [
			undefined,
			`ub_s1.${'a'.repeat(42)}`,
			`ub_s2.${'a'.repeat(43)}`,
			` ub_s1.${'a'.repeat(43)}`,
		]) {
			expect(isSessionToken(value)).toBe(false)
		}
	})
})

describe('request context values', () => {
	it('accept only package-owned principals and sessions', () => {
		const pointer = Account.pointer('0199325a-0c00-7000-8000-000000000001')
		const principal = createAuthPrincipal(pointer)
		const session = createAuthSession(sessionValues, 3)
		const authenticated = context()
			.withValue(authPrincipal, principal)
			.withValue(authSession, session)
		expect(authenticated.getValue(authPrincipal)).toBe(principal)
		expect(readSessionGeneration(session)).toBe(3)
		expect(isAuthPrincipal({ user: pointer })).toBe(false)
		expect(() => {
			callUntyped(context(), 'withValue', authPrincipal, { user: pointer })
		}).toThrow('Auth principal must be package-owned')
		expect(() => {
			callUntyped(
				context(),
				'withValue',
				authSession,
				Object.freeze({ ...sessionValues }),
			)
		}).toThrow('Auth session must be package-owned')
		expect(() => {
			callUntyped({ createAuthPrincipal }, 'createAuthPrincipal', {
				id: 'forged',
			})
		}).toThrow('Auth principal requires a Core Pointer')
	})

	it('carry the HTTP client with its address and user agent only', () => {
		const client = context().withValue(authClient, {
			address: '198.51.100.1',
			userAgent: null,
		})
		expect(client.getValue(authClient)).toStrictEqual({
			address: '198.51.100.1',
			userAgent: null,
		})
		for (const value of [
			{ address: 1, userAgent: null },
			{ address: undefined, userAgent: 2 },
			'198.51.100.1',
		]) {
			expect(() => {
				callUntyped(context(), 'withValue', authClient, value)
			}).toThrow('Auth client must carry an address and user agent')
		}
	})

	it('keep the latest credential proof of a session within its scope', () => {
		const session = createAuthSession(sessionValues, 0)
		const stored = Date.parse(sessionValues.authenticatedAt)
		expect(readSessionAuthenticatedAt(session)).toBe(stored)
		recordSessionAuthentication(session, stored + 2_000)
		recordSessionAuthentication(session, stored + 1_000)
		expect(readSessionAuthenticatedAt(session)).toBe(stored + 2_000)
	})
})
