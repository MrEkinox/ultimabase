import { describe, expect, it } from 'vitest'

import { definePlugin } from '../index.js'

describe('definePlugin', () => {
	it('creates immutable static definitions without running callbacks', () => {
		let setupCalls = 0
		let hookCalls = 0
		const dependencies = ['services']
		const hooks = {
			connect: () => {
				hookCalls += 1
			},
		}
		const plugin = definePlugin({
			name: 'fixture.database',
			slot: 'database-adapter',
			version: '1.0.0',
			dependencies,
			optionalDependencies: ['cache'],
			conflicts: ['fixture.other-database'],
			setup: () => {
				setupCalls += 1

				return { dialect: 'postgres' as const }
			},
			hooks,
		})

		dependencies.push('late-dependency')

		expect(setupCalls).toBe(0)
		expect(hookCalls).toBe(0)
		expect(plugin).toMatchObject({
			name: 'fixture.database',
			slot: 'database-adapter',
			version: '1.0.0',
			dependencies: ['services'],
			optionalDependencies: ['cache'],
			conflicts: ['fixture.other-database'],
		})
		expect(plugin.setup).toBeTypeOf('function')
		expect(plugin.hooks?.connect).toBe(hooks.connect)
		expect(Object.isFrozen(plugin)).toBe(true)
		expect(Object.isFrozen(plugin.dependencies)).toBe(true)
		expect(Object.isFrozen(plugin.optionalDependencies)).toBe(true)
		expect(Object.isFrozen(plugin.conflicts)).toBe(true)
		expect(Object.isFrozen(plugin.hooks)).toBe(true)
	})

	it('retains immutable nested plugin definitions by identity', () => {
		const child = definePlugin({ name: 'fixture.child' })
		const nestedPlugins = [child]
		const parent = definePlugin({
			name: 'fixture.parent',
			plugins: nestedPlugins,
		})

		nestedPlugins.pop()

		expect(parent.plugins).toStrictEqual([child])
		expect(parent.plugins?.[0]).toBe(child)
		expect(Object.isFrozen(parent.plugins)).toBe(true)
	})

	it('protects JavaScript callers from malformed plugin metadata', () => {
		expect(() => {
			// @ts-expect-error -- Runtime coverage protects null plugin options.
			definePlugin(null)
		}).toThrow(new TypeError('plugin options must be a plain object'))
		expect(() => definePlugin({ name: '' })).toThrow(
			new TypeError('name must be a non-empty string'),
		)
		expect(() => definePlugin({ name: 'fixture', slot: '' })).toThrow(
			new TypeError('slot must be a non-empty string'),
		)
		expect(() => definePlugin({ name: 'fixture', version: '' })).toThrow(
			new TypeError('version must be a non-empty string'),
		)
		expect(() => {
			definePlugin({
				name: 'fixture',
				// @ts-expect-error -- Setup metadata must remain callable.
				setup: 'later',
			})
		}).toThrow(new TypeError('setup must be a function'))
		expect(() => {
			definePlugin({
				name: 'fixture',
				// @ts-expect-error -- Dependency metadata must remain an array.
				dependencies: 'services',
			})
		}).toThrow(new TypeError('dependencies must be an array'))
		expect(() => {
			definePlugin({
				name: 'fixture',
				// Runtime validation also protects JavaScript callers from empty names.
				optionalDependencies: [''],
			})
		}).toThrow(
			new TypeError('optionalDependencies[0] must be a non-empty string'),
		)
		expect(() => {
			definePlugin({
				name: 'fixture',
				// @ts-expect-error -- Conflict metadata must contain strings.
				conflicts: [42],
			})
		}).toThrow(new TypeError('conflicts[0] must be a non-empty string'))
		expect(() => {
			definePlugin({
				name: 'fixture',
				// @ts-expect-error -- Hooks must retain their object shape.
				hooks: [],
			})
		}).toThrow(new TypeError('hooks must be a plain object'))
		expect(() => {
			definePlugin({
				name: 'fixture',
				// @ts-expect-error -- Lifecycle hook names form a closed contract.
				hooks: { initialize: () => undefined },
			})
		}).toThrow(new TypeError('Unknown plugin lifecycle hook: initialize'))
		expect(() => {
			definePlugin({
				name: 'fixture',
				// @ts-expect-error -- Lifecycle hook values must remain callable.
				hooks: { connect: true },
			})
		}).toThrow(new TypeError('hooks.connect must be a function'))
		expect(() => {
			definePlugin({
				name: 'fixture',
				// @ts-expect-error -- Nested metadata must remain an array.
				plugins: {},
			})
		}).toThrow(new TypeError('plugins must be an array'))
		expect(() => {
			definePlugin({
				name: 'fixture',
				// @ts-expect-error -- Nested definitions require Core provenance.
				plugins: [{ name: 'forged' }],
			})
		}).toThrow(new TypeError('plugins[0] must be created by definePlugin'))
	})
})
