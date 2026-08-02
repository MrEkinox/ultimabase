import { SchemaRegistry } from '../schema/index.js'
import { describe, expect, it } from 'vitest'

import { createApplication } from '../application/framework-application.js'
import { definePlugin } from './definition.js'
import {
	defineDatabaseConstraintCompiler,
	isDatabaseConstraintCompilerDefinition,
} from './constraint-compilers.js'
import { PluginSetupRegistries } from './setup-registries.js'

const tenantCompiler = defineDatabaseConstraintCompiler({
	adapter: 'postgres',
	kind: 'fixture.tenant',
	version: 1,
})

describe('database constraint compiler definitions', () => {
	it('creates protected immutable adapter metadata', () => {
		expect(tenantCompiler).toStrictEqual({
			adapter: 'postgres',
			kind: 'fixture.tenant',
			version: 1,
		})
		expect(Object.isFrozen(tenantCompiler)).toBe(true)
		expect(isDatabaseConstraintCompilerDefinition(tenantCompiler)).toBe(true)
		expect(isDatabaseConstraintCompilerDefinition({ ...tenantCompiler })).toBe(
			false,
		)
	})

	it.each([
		[null, 'database constraint compiler options must be a plain object'],
		[
			{ adapter: 'postgres', kind: 'fixture.tenant', version: 1, extra: true },
			'database constraint compiler contains unknown key: extra',
		],
		[
			{ adapter: 'Postgres', kind: 'fixture.tenant', version: 1 },
			'database constraint compiler adapter must be a lowercase adapter identifier',
		],
		[
			{ adapter: 'postgres', kind: 'tenant', version: 1 },
			'database constraint compiler kind must use lowercase dot-separated namespace segments',
		],
		[
			{ adapter: 'postgres', kind: 'fixture.tenant', version: 0 },
			'database constraint compiler version must be a positive safe integer',
		],
		[
			{ adapter: 'postgres', kind: 'fixture.tenant', version: 1.5 },
			'database constraint compiler version must be a positive safe integer',
		],
	] as const)('rejects invalid metadata %#', (options, message) => {
		expect(() => defineDatabaseConstraintCompiler(options as never)).toThrow(
			message,
		)
	})
})

describe('PluginConstraintCompilerRegistry', () => {
	it('derives ownership and preserves semantic registration order', () => {
		const setupRegistries = new PluginSetupRegistries(new SchemaRegistry())
		const first = setupRegistries.forPlugin('fixture.first')
		const second = setupRegistries.forPlugin('fixture.second')
		const nextVersion = defineDatabaseConstraintCompiler({
			adapter: 'postgres',
			kind: 'fixture.tenant',
			version: 2,
		})
		const sqliteCompiler = defineDatabaseConstraintCompiler({
			adapter: 'sqlite',
			kind: 'fixture.tenant',
			version: 1,
		})

		first.constraintCompilers.register(tenantCompiler)
		second.constraintCompilers.register(nextVersion)
		second.constraintCompilers.register(sqliteCompiler)

		const contributions = first.constraintCompilers.values()
		expect(first.constraintCompilers.size).toBe(3)
		expect(contributions).toStrictEqual([
			{ definition: tenantCompiler, ownerPlugin: 'fixture.first' },
			{ definition: nextVersion, ownerPlugin: 'fixture.second' },
			{ definition: sqliteCompiler, ownerPlugin: 'fixture.second' },
		])
		expect(Object.isFrozen(first.constraintCompilers)).toBe(true)
		expect(Object.isFrozen(contributions)).toBe(true)
		expect(contributions.every(Object.isFrozen)).toBe(true)
	})

	it('rejects semantic duplicates with deterministic owner diagnostics', () => {
		const setupRegistries = new PluginSetupRegistries(new SchemaRegistry())
		const first = setupRegistries.forPlugin('fixture.first')
		const second = setupRegistries.forPlugin('fixture.second')
		const duplicate = defineDatabaseConstraintCompiler({
			adapter: 'postgres',
			kind: 'fixture.tenant',
			version: 1,
		})

		first.constraintCompilers.register(tenantCompiler)

		expect(() => {
			second.constraintCompilers.register(duplicate)
		}).toThrow(
			expect.objectContaining({
				code: 'PLUGIN_CONFLICT',
				internalDetails: {
					adapter: 'postgres',
					constraintKind: 'fixture.tenant',
					kind: 'duplicate-database-constraint-compiler',
					pluginNames: ['fixture.first', 'fixture.second'],
					version: 1,
				},
			}),
		)
		expect(first.constraintCompilers.values()).toStrictEqual([
			{ definition: tenantCompiler, ownerPlugin: 'fixture.first' },
		])
	})

	it('rejects forged definitions and registrations after setup closes', () => {
		const setupRegistries = new PluginSetupRegistries(new SchemaRegistry())
		const registry =
			setupRegistries.forPlugin('fixture.owner').constraintCompilers

		expect(() => {
			registry.register({ ...tenantCompiler })
		}).toThrow(
			'Database constraint compiler must be created by defineDatabaseConstraintCompiler',
		)

		setupRegistries.closeSetup()
		expect(() => {
			registry.register(tenantCompiler)
		}).toThrow(
			'Database constraint compilers can only be registered during plugin setup',
		)
		// Completed setup remains readable by later adapter lifecycle phases.
		expect(registry.values()).toStrictEqual([])
	})

	it.concurrent(
		'keeps identical compiler identities application-isolated',
		async () => {
			const plugin = definePlugin({
				name: 'fixture.compiler-owner',
				setup: ({ constraintCompilers }) => {
					constraintCompilers.register(tenantCompiler)

					return { constraintCompilers }
				},
			})
			const [first, second] = await Promise.all([
				createApplication({ schemas: [], plugins: [plugin] }),
				createApplication({ schemas: [], plugins: [plugin] }),
			])

			const firstValues = first
				.getPlugin('fixture.compiler-owner')
				.constraintCompilers.values()
			const secondValues = second
				.getPlugin('fixture.compiler-owner')
				.constraintCompilers.values()

			expect(firstValues).toStrictEqual(secondValues)
			expect(firstValues).not.toBe(secondValues)

			await Promise.all([first.dispose(), second.dispose()])
		},
	)

	it('fails duplicate application setup before infrastructure starts', async () => {
		const createCompilerPlugin = (name: string) =>
			definePlugin({
				name,
				setup: ({ constraintCompilers }) => {
					constraintCompilers.register(tenantCompiler)
				},
			})

		await expect(
			createApplication({
				schemas: [],
				plugins: [
					createCompilerPlugin('fixture.first'),
					createCompilerPlugin('fixture.second'),
				],
			}),
		).rejects.toMatchObject({
			code: 'PLUGIN_CONFLICT',
			internalDetails: {
				pluginNames: ['fixture.first', 'fixture.second'],
			},
		})
	})
})
