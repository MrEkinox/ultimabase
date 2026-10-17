import { describe, expect, it } from 'vitest'

import { defineAuthMethod } from './method.js'
import { authPlugin } from './plugin.js'

const method = (name: string) =>
	defineAuthMethod({ name, contributions: () => [] })

/** Calls a factory with a value its types refuse, as untyped callers can. */
const callUntyped = (factory: unknown, value: unknown): void => {
	if (typeof factory !== 'function') throw new TypeError('No factory')
	Reflect.apply(factory, undefined, [value])
}

describe('authPlugin options', () => {
	it('carries its id for ultimabase.plugin(authPlugin)', () => {
		expect(authPlugin.pluginId).toBe('@ultimabase/auth-plugin')
		expect(
			authPlugin({ methods: [method('fixture')] }).manifest.identity.pluginId,
		).toBe('@ultimabase/auth-plugin')
	})

	it('requires distinct methods created by defineAuthMethod', () => {
		expect(() => authPlugin({ methods: [] })).toThrow(
			'authPlugin methods must list at least one method',
		)
		expect(() =>
			authPlugin({ methods: [{ kind: 'auth-method', name: 'forged' }] }),
		).toThrow('created by an auth method')
		expect(() =>
			authPlugin({ methods: [method('same'), method('same')] }),
		).toThrow('distinct names')
	})

	it('validates linking, events and unknown options', () => {
		const methods = [method('fixture')]
		expect(() => authPlugin({ linking: 'email' as never, methods })).toThrow(
			"linking must be 'verified-email' or 'manual'",
		)
		expect(() =>
			authPlugin({
				events: { afterNothing: () => undefined } as never,
				methods,
			}),
		).toThrow('unknown event: afterNothing')
		expect(() =>
			authPlugin({ events: { afterLogin: 'audit' } as never, methods }),
		).toThrow('events.afterLogin must be a function')
		expect(() => authPlugin({ methods, user: 'User' } as never)).toThrow(
			'authPlugin contains unknown option: user',
		)
		expect(() => {
			callUntyped(authPlugin, { events: 'audit', methods })
		}).toThrow('authPlugin events must be a plain object')
		expect(() => {
			callUntyped(authPlugin, { methods: [null] })
		}).toThrow('created by an auth method')
	})

	it('requires cookie mode to declare the HTTP plugin as a peer', () => {
		const methods = [method('fixture')]
		expect(authPlugin({ methods }).peers ?? []).toHaveLength(0)
		expect(
			authPlugin({ http: { cookie: { name: '__Host-session' } }, methods })
				.peers,
		).toMatchObject([{ pluginId: '@ultimabase/http-plugin' }])
	})
})

describe('defineAuthMethod', () => {
	it('rejects unknown options and missing contributions', () => {
		expect(() =>
			defineAuthMethod({
				name: 'fixture',
				contributions: () => [],
				secret: true,
			} as never),
		).toThrow('auth method contains unknown option: secret')
		expect(() => defineAuthMethod({ name: 'fixture' } as never)).toThrow(
			'auth method contributions must be a function',
		)
		expect(() =>
			defineAuthMethod({ name: '', contributions: () => [] }),
		).toThrow('auth method name')
		expect(() => {
			callUntyped(defineAuthMethod, 'password')
		}).toThrow('auth method must be a plain object')
	})
})
