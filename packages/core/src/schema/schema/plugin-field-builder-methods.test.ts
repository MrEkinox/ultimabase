import { describe, expect, it } from 'vitest'

import {
	createApplication,
	defineFieldBuilderMethod,
	definePlugin,
	definePluginField,
	Schema,
	type FieldBuilder,
	type FieldBuilderMethodDefinition,
	type FieldOptions,
} from '../../index.js'

interface FixtureFieldOptions extends FieldOptions<string> {
	readonly marker?: string
	readonly nested?: Readonly<{ readonly label: string }>
}

type FixtureFieldBuilderMethod = (
	options?: FixtureFieldOptions,
) => ReturnType<typeof alphaField>

type FixtureFieldBuilder = FieldBuilder & {
	readonly alpha: FixtureFieldBuilderMethod
	readonly beta: FixtureFieldBuilderMethod
}

const fixtureBuilder = (field: FieldBuilder): FixtureFieldBuilder =>
	field as FixtureFieldBuilder

const alphaField = (options: FixtureFieldOptions = {}) =>
	definePluginField('fixture.alpha', options, {
		snapshotValue: (value) => String(value),
	})

const betaField = (options: FixtureFieldOptions = {}) =>
	definePluginField('fixture.beta', options, {
		snapshotValue: (value) => String(value),
	})

const alphaMethod = defineFieldBuilderMethod({
	factory: alphaField,
	fieldKind: 'fixture.alpha',
	name: 'alpha',
	typegen: {
		methodType: 'AlphaFieldBuilderMethod',
		module: '@fixture/alpha-plugin',
		valueType: 'AlphaValue',
	},
})

const betaMethod = defineFieldBuilderMethod({
	factory: betaField,
	fieldKind: 'fixture.beta',
	name: 'beta',
	typegen: {
		methodType: 'BetaFieldBuilderMethod',
		module: '@fixture/beta-plugin',
		valueType: 'BetaValue',
	},
})

const alphaPlugin = () =>
	definePlugin({
		version: '0.0.0',
		core: '^0.0.0',
		pluginId: 'fixture.alpha-plugin',
		declareFields: (fields) => {
			fields.register(alphaMethod)
		},
	})

const betaPlugin = () =>
	definePlugin({
		version: '0.0.0',
		core: '^0.0.0',
		pluginId: 'fixture.beta-plugin',
		declareFields: (fields) => {
			fields.register(betaMethod)
		},
	})

describe('plugin FieldBuilder methods', () => {
	it('declares owned methods before schema compilation and plugin setup', async () => {
		const trace: string[] = []
		const plugin = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.ordered-plugin',
			declareFields: (fields) => {
				trace.push('declare')
				fields.register(alphaMethod)
			},
			setup: ({ schemas }) => {
				const schema = schemas.get('PluginMethodDocument')

				trace.push(`setup:${schema?.fields.value?.kind ?? 'missing'}`)
			},
		})
		const Document = Schema.define({
			className: 'PluginMethodDocument',
			fields: (field) => {
				trace.push('fields')
				return {
					value: fixtureBuilder(field).alpha({ marker: 'ordered' }),
				}
			},
		})

		const application = await createApplication({
			plugins: [plugin],
			schemas: [Document],
		})

		expect(trace).toStrictEqual(['fields', 'declare', 'setup:fixture.alpha'])
		expect(Document.fields.value?.options).toMatchObject({ marker: 'ordered' })
		expect(application.fieldBuilderMethods).toStrictEqual([
			expect.objectContaining({
				fieldKind: 'fixture.alpha',
				name: 'alpha',
				owner: 'fixture.ordered-plugin',
				typegen: {
					methodType: 'AlphaFieldBuilderMethod',
					module: '@fixture/alpha-plugin',
					valueType: 'AlphaValue',
				},
			}),
		])
		expect(Object.isFrozen(application.fieldBuilderMethods)).toBe(true)
	})

	it('fails precisely when no configured plugin declares a used method', async () => {
		const Missing = Schema.define({
			className: 'MissingPluginMethod',
			fields: (field) => ({
				// The generated-like cast simulates stale output after plugin removal.
				value: fixtureBuilder(field).alpha(),
			}),
		})

		await expect(
			createApplication({ plugins: [], schemas: [Missing] }),
		).rejects.toThrow(
			expect.objectContaining({
				cause: new TypeError(
					'MissingPluginMethod.fields.value FieldBuilder method "alpha" is unavailable; configure the plugin that declares it',
				),
				code: 'SCHEMA_COMPILATION_FAILED',
				reason: 'callback-threw',
			}),
		)
	})

	it('keeps two application method graphs isolated', async () => {
		let sharedDeclarations = 0
		const Shared = Schema.define({
			className: 'SharedPluginMethod',
			fields: (field) => {
				sharedDeclarations += 1
				return { value: fixtureBuilder(field).alpha() }
			},
		})
		const Alpha = Schema.define({
			className: 'IsolatedAlphaMethod',
			fields: (field) => ({ value: fixtureBuilder(field).alpha() }),
		})
		const Beta = Schema.define({
			className: 'IsolatedBetaMethod',
			fields: (field) => ({ value: fixtureBuilder(field).beta() }),
		})
		const alphaApplication = await createApplication({
			plugins: [alphaPlugin()],
			schemas: [Alpha],
		})
		const betaApplication = await createApplication({
			plugins: [betaPlugin()],
			schemas: [Beta],
		})
		await createApplication({
			plugins: [alphaPlugin()],
			schemas: [Shared],
		})

		expect(
			alphaApplication.fieldBuilderMethods.map(({ name }) => name),
		).toEqual(['alpha'])
		expect(betaApplication.fieldBuilderMethods.map(({ name }) => name)).toEqual(
			['beta'],
		)
		expect(Alpha.fields.value?.kind).toBe('fixture.alpha')
		expect(Beta.fields.value?.kind).toBe('fixture.beta')
		expect(sharedDeclarations).toBe(1)

		await expect(
			createApplication({ plugins: [], schemas: [Shared] }),
		).rejects.toThrow(
			expect.objectContaining({
				cause: new TypeError(
					'SharedPluginMethod.fields.value FieldBuilder method "alpha" is unavailable; configure the plugin that declares it',
				),
			}),
		)
		expect(sharedDeclarations).toBe(1)
	})

	it('snapshots delayed plugin options at declaration time', async () => {
		const options = {
			marker: 'declared',
			nested: { label: 'declared' },
		}
		const Snapshot = Schema.define({
			className: 'PluginMethodOptionSnapshot',
			fields: (field) => ({
				value: fixtureBuilder(field).alpha(options),
			}),
		})

		options.marker = 'mutated'
		options.nested.label = 'mutated'

		await createApplication({
			plugins: [alphaPlugin()],
			schemas: [Snapshot],
		})

		expect(Snapshot.fields.value?.options).toMatchObject({
			marker: 'declared',
			nested: { label: 'declared' },
		})
		const snapshotOptions = Snapshot.fields.value?.options
		if (
			snapshotOptions === undefined ||
			!('nested' in snapshotOptions) ||
			typeof snapshotOptions.nested !== 'object' ||
			snapshotOptions.nested === null
		) {
			throw new TypeError('Expected nested plugin field options')
		}
		expect(Object.isFrozen(snapshotOptions.nested)).toBe(true)
	})

	it('rejects built-in overrides and duplicate owners before fields resolve', async () => {
		let declarations = 0
		const Unresolved = Schema.define({
			className: 'ConflictingPluginMethod',
			fields: () => {
				declarations += 1
				return {}
			},
		})
		const override = defineFieldBuilderMethod({
			factory: alphaField,
			fieldKind: 'fixture.alpha',
			name: 'string',
			typegen: alphaMethod.typegen,
		})
		const overridePlugin = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.override-plugin',
			declareFields: (fields) => {
				fields.register(override)
			},
		})

		await expect(
			createApplication({ plugins: [overridePlugin], schemas: [Unresolved] }),
		).rejects.toThrow(
			'FieldBuilder method "string" from "fixture.override-plugin" conflicts with "@ultimabase/core"',
		)
		expect(declarations).toBe(1)

		await expect(
			createApplication({
				plugins: [
					alphaPlugin(),
					definePlugin({
						version: '0.0.0',
						core: '^0.0.0',
						pluginId: 'fixture.duplicate-plugin',
						declareFields: (fields) => {
							fields.register(alphaMethod)
						},
					}),
				],
				schemas: [Unresolved],
			}),
		).rejects.toThrow(
			'FieldBuilder method "alpha" from "fixture.duplicate-plugin" conflicts with "fixture.alpha-plugin"',
		)
		expect(declarations).toBe(1)
	})

	it('rejects incompatible factories and asynchronous declarations', async () => {
		const WrongKind = Schema.define({
			className: 'WrongPluginMethodKind',
			fields: (field) => ({ value: fixtureBuilder(field).alpha() }),
		})
		const incompatibleMethod = defineFieldBuilderMethod({
			factory: betaField,
			fieldKind: 'fixture.alpha',
			name: 'alpha',
			typegen: alphaMethod.typegen,
		})
		const incompatiblePlugin = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.incompatible-plugin',
			declareFields: (fields) => {
				fields.register(incompatibleMethod)
			},
		})

		await expect(
			createApplication({
				plugins: [incompatiblePlugin],
				schemas: [WrongKind],
			}),
		).rejects.toThrow(
			expect.objectContaining({
				cause: new TypeError(
					'WrongPluginMethodKind.fields.value FieldBuilder method "alpha" from "fixture.incompatible-plugin" returned kind "fixture.beta" instead of "fixture.alpha"',
				),
			}),
		)

		const asynchronousPlugin = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.async-plugin',
			// @ts-expect-error -- Runtime still rejects declarations loaded from JavaScript.
			declareFields: async (fields) => {
				fields.register(alphaMethod)
				await Promise.resolve()
			},
		})

		await expect(
			createApplication({ plugins: [asynchronousPlugin], schemas: [] }),
		).rejects.toThrow(
			'Plugin "fixture.async-plugin" declareFields must be synchronous and return nothing',
		)
	})

	it('snapshots typegen metadata and rejects untrusted definitions', async () => {
		const typegen = {
			methodType: 'SnapshotFieldBuilderMethod',
			module: '@fixture/snapshot-plugin',
			valueType: 'SnapshotValue',
		}
		const method = defineFieldBuilderMethod({
			factory: alphaField,
			fieldKind: 'fixture.alpha',
			name: 'snapshot',
			typegen,
		})

		typegen.methodType = 'MutatedMethod'
		const application = await createApplication({
			plugins: [
				definePlugin({
					version: '0.0.0',
					core: '^0.0.0',
					pluginId: 'fixture.snapshot-plugin',
					declareFields: (fields) => {
						fields.register(method)
					},
				}),
			],
			schemas: [],
		})

		expect(application.fieldBuilderMethods[0]?.typegen.methodType).toBe(
			'SnapshotFieldBuilderMethod',
		)
		expect(Object.isFrozen(application.fieldBuilderMethods[0]?.typegen)).toBe(
			true,
		)

		const untrustedPlugin = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.untrusted-plugin',
			declareFields: (fields) => {
				const untrusted = {
					factory: alphaField,
					fieldKind: 'fixture.alpha',
					name: 'untrusted',
					typegen,
				} as FieldBuilderMethodDefinition

				fields.register(untrusted)
			},
		})

		await expect(
			createApplication({ plugins: [untrustedPlugin], schemas: [] }),
		).rejects.toThrow(
			'FieldBuilder method from fixture.untrusted-plugin must be created by defineFieldBuilderMethod',
		)
	})
})
