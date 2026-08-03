import { describe, expect, it } from 'vitest'

import {
	FrameworkError,
	ServiceRegistry,
	createServiceToken,
} from '../index.js'

interface DatabaseService {
	readonly application: string
}

const DatabaseServiceToken = createServiceToken<DatabaseService>(
	'ultimabase.database',
)

describe('ServiceRegistry', () => {
	it('provides and retrieves services through token identity', () => {
		const registry = new ServiceRegistry()
		const database = { application: 'primary' }

		registry.provide(DatabaseServiceToken, database)

		expect(registry.size).toBe(1)
		expect(registry.has(DatabaseServiceToken)).toBe(true)
		expect(registry.get(DatabaseServiceToken)).toBe(database)
		expect(registry.getOptional(DatabaseServiceToken)).toBe(database)
		expect(registry.ownerOf(DatabaseServiceToken)).toBeUndefined()
	})

	it('records the owner of services provided through plugin scope', () => {
		const registry = new ServiceRegistry()
		const pluginServices = registry.forPlugin('fixture.database')
		const database = { application: 'plugin-owned' }

		pluginServices.provide(DatabaseServiceToken, database)

		expect(pluginServices.size).toBe(1)
		expect(pluginServices.has(DatabaseServiceToken)).toBe(true)
		expect(pluginServices.get(DatabaseServiceToken)).toBe(database)
		expect(pluginServices.getOptional(DatabaseServiceToken)).toBe(database)
		expect(registry.ownerOf(DatabaseServiceToken)).toBe('fixture.database')
		expect(Object.isFrozen(pluginServices)).toBe(true)
	})

	it('resolves a provider-order-independent plugin requirement', () => {
		const registry = new ServiceRegistry()
		const requiredDatabase = registry
			.forPlugin('fixture.consumer')
			.require(DatabaseServiceToken)
		const database = { application: 'deferred' }

		registry
			.forPlugin('fixture.provider')
			.provide(DatabaseServiceToken, database)
		registry.validateRequirements()

		expect(requiredDatabase.debugName).toBe('ultimabase.database')
		expect(requiredDatabase.get()).toBe(database)
		expect(Object.isFrozen(requiredDatabase)).toBe(true)
	})

	it('reports the consumer when a required service remains absent', () => {
		const registry = new ServiceRegistry()

		registry.forPlugin('fixture.consumer').require(DatabaseServiceToken)

		expect(() => {
			registry.validateRequirements()
		}).toThrow(
			expect.objectContaining({
				code: 'SERVICE_NOT_FOUND',
				message: 'Required service not found: ultimabase.database',
				internalDetails: {
					requiredBy: 'fixture.consumer',
					service: 'ultimabase.database',
				},
			}),
		)
	})

	it('distinguishes optional absence from required lookup failures', () => {
		const registry = new ServiceRegistry()
		let thrown: unknown

		try {
			registry.get(DatabaseServiceToken)
		} catch (error: unknown) {
			thrown = error
		}

		expect(registry.has(DatabaseServiceToken)).toBe(false)
		expect(registry.getOptional(DatabaseServiceToken)).toBeUndefined()
		expect(thrown).toBeInstanceOf(FrameworkError)
		expect(thrown).toMatchObject({
			code: 'SERVICE_NOT_FOUND',
			message: 'Service not found: ultimabase.database',
			internalDetails: { service: 'ultimabase.database' },
		})
	})

	it('rejects duplicate provision without replacing the original service', () => {
		const registry = new ServiceRegistry()
		const original = { application: 'original' }

		registry.provide(DatabaseServiceToken, original)

		expect(() => {
			registry.provide(DatabaseServiceToken, { application: 'replacement' })
		}).toThrow(
			expect.objectContaining({
				code: 'SERVICE_ALREADY_PROVIDED',
				message: 'Service already provided: ultimabase.database',
			}),
		)
		expect(registry.size).toBe(1)
		expect(registry.get(DatabaseServiceToken)).toBe(original)
	})

	it.concurrent('keeps application registries isolated', async () => {
		const firstRegistry = new ServiceRegistry()
		const secondRegistry = new ServiceRegistry()

		await Promise.all([
			Promise.resolve().then(() => {
				firstRegistry.provide(DatabaseServiceToken, {
					application: 'first',
				})
			}),
			Promise.resolve().then(() => {
				secondRegistry.provide(DatabaseServiceToken, {
					application: 'second',
				})
			}),
		])

		expect(firstRegistry.get(DatabaseServiceToken).application).toBe('first')
		expect(secondRegistry.get(DatabaseServiceToken).application).toBe('second')
	})

	it('does not resolve a required-service reference from another registry', () => {
		const firstRegistry = new ServiceRegistry()
		const secondRegistry = new ServiceRegistry()
		const requiredDatabase = firstRegistry
			.forPlugin('fixture.consumer')
			.require(DatabaseServiceToken)

		secondRegistry.provide(DatabaseServiceToken, { application: 'second' })

		expect(() => {
			firstRegistry.validateRequirements()
		}).toThrow(expect.objectContaining({ code: 'SERVICE_NOT_FOUND' }))
		expect(() => requiredDatabase.get()).toThrow(
			expect.objectContaining({ code: 'SERVICE_NOT_FOUND' }),
		)
	})

	it('disposes standard resources once in reverse registration order', async () => {
		const disposalOrder: string[] = []
		const firstToken = createServiceToken<Disposable>('fixture.first')
		const sharedToken = createServiceToken<AsyncDisposable>('fixture.shared')
		const sharedAliasToken = createServiceToken<AsyncDisposable>(
			'fixture.shared-alias',
		)
		const first: Disposable = {
			[Symbol.dispose]: () => {
				disposalOrder.push('first')
			},
		}
		const shared: AsyncDisposable = {
			[Symbol.asyncDispose]: (): Promise<void> => {
				disposalOrder.push('shared')

				return Promise.resolve()
			},
		}
		const registry = new ServiceRegistry()

		registry.provide(firstToken, first)
		registry.provide(sharedToken, shared)
		registry.provide(sharedAliasToken, shared)

		await registry.dispose()
		await registry.dispose()

		expect(disposalOrder).toStrictEqual(['shared', 'first'])
		expect(registry.size).toBe(0)
		expect(registry.has(firstToken)).toBe(false)
		expect(registry.getOptional(sharedToken)).toBeUndefined()
		expect(() => {
			registry.provide(firstToken, first)
		}).toThrow(
			expect.objectContaining({
				code: 'SERVICE_REGISTRY_DISPOSED',
				message:
					'Cannot provide service after registry disposal: fixture.first',
			}),
		)
	})

	it('accepts externally managed primitive services', async () => {
		const PortToken = createServiceToken<number>('fixture.port')
		const registry = new ServiceRegistry()

		registry.provide(PortToken, 1337)

		expect(registry.get(PortToken)).toBe(1337)

		await registry.dispose()
	})

	it('protects JavaScript callers from forged tokens', () => {
		const registry = new ServiceRegistry()

		expect(() => {
			// @ts-expect-error -- Runtime coverage protects string-based service lookup.
			registry.get('ultimabase.database')
		}).toThrow(new TypeError('token must be created by createServiceToken'))
		expect(() => {
			// @ts-expect-error -- Private token markers prevent structural provision.
			registry.provide({ debugName: 'forged' }, { application: 'forged' })
		}).toThrow(new TypeError('token must be created by createServiceToken'))
		expect(() => registry.forPlugin('')).toThrow(
			new TypeError('pluginName must be a non-empty string'),
		)
	})
})
