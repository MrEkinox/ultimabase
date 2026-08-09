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
}

type FixtureFieldBuilderMethod = (
	name: string,
	options?: FixtureFieldOptions,
) => void

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
		name: 'fixture.alpha-plugin',
		declareFields: (fields) => {
			fields.register(alphaMethod)
		},
	})

const betaPlugin = () =>
	definePlugin({
		name: 'fixture.beta-plugin',
		declareFields: (fields) => {
			fields.register(betaMethod)
		},
	})

describe('plugin FieldBuilder methods', () => {
	it('declares owned methods before schema compilation and plugin setup', async () => {
		const trace: string[] = []
		const plugin = definePlugin({
			name: 'fixture.ordered-plugin',
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
			fields(field) {
				trace.push('fields')
				fixtureBuilder(field).alpha('value', { marker: 'ordered' })
			},
		})

		const application = await createApplication({
			plugins: [plugin],
			schemas: [Document],
		})

		expect(trace).toStrictEqual(['declare', 'fields', 'setup:fixture.alpha'])
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
			fields(field) {
				// The generated-like cast simulates stale output after plugin removal.
				fixtureBuilder(field).alpha('value')
			},
		})

		await expect(
			createApplication({ plugins: [], schemas: [Missing] }),
		).rejects.toThrow(
			expect.objectContaining({
				cause: new TypeError(
					'MissingPluginMethod.fields FieldBuilder method "alpha" is unavailable; configure the plugin that declares it',
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
			fields(field) {
				sharedDeclarations += 1
				fixtureBuilder(field).alpha('value')
			},
		})
		const Alpha = Schema.define({
			className: 'IsolatedAlphaMethod',
			fields(field) {
				fixtureBuilder(field).alpha('value')
			},
		})
		const Beta = Schema.define({
			className: 'IsolatedBetaMethod',
			fields(field) {
				fixtureBuilder(field).beta('value')
			},
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
					'SharedPluginMethod.fields FieldBuilder method "alpha" is unavailable; configure the plugin that declares it',
				),
			}),
		)
		expect(sharedDeclarations).toBe(2)
	})

	it('rejects built-in overrides and duplicate owners before fields resolve', async () => {
		let declarations = 0
		const Unresolved = Schema.define({
			className: 'ConflictingPluginMethod',
			fields() {
				declarations += 1
			},
		})
		const override = defineFieldBuilderMethod({
			factory: alphaField,
			fieldKind: 'fixture.alpha',
			name: 'string',
			typegen: alphaMethod.typegen,
		})
		const overridePlugin = definePlugin({
			name: 'fixture.override-plugin',
			declareFields: (fields) => {
				fields.register(override)
			},
		})

		await expect(
			createApplication({ plugins: [overridePlugin], schemas: [Unresolved] }),
		).rejects.toThrow(
			'FieldBuilder method "string" from "fixture.override-plugin" conflicts with "@ultimabase/core"',
		)
		expect(declarations).toBe(0)

		await expect(
			createApplication({
				plugins: [
					alphaPlugin(),
					definePlugin({
						name: 'fixture.duplicate-plugin',
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
		expect(declarations).toBe(0)
	})

	it('rejects incompatible factories and asynchronous declarations', async () => {
		const WrongKind = Schema.define({
			className: 'WrongPluginMethodKind',
			fields(field) {
				fixtureBuilder(field).alpha('value')
			},
		})
		const incompatibleMethod = defineFieldBuilderMethod({
			factory: betaField,
			fieldKind: 'fixture.alpha',
			name: 'alpha',
			typegen: alphaMethod.typegen,
		})
		const incompatiblePlugin = definePlugin({
			name: 'fixture.incompatible-plugin',
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
			name: 'fixture.async-plugin',
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
					name: 'fixture.snapshot-plugin',
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
			name: 'fixture.untrusted-plugin',
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
