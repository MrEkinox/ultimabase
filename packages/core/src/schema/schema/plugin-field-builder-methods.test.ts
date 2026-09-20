import { applicationFixture } from '../../../tests/application-fixture.js'
import { describe, expect, it } from 'vitest'
import { isPlainRecord } from '@ultimabase/shared'

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
	name: 'alpha',
	contexts: {
		stored: {
			factory: alphaField,
			fieldKind: 'fixture.alpha',
			typegen: {
				methodType: 'AlphaFieldBuilderMethod',
				module: '@fixture/alpha-plugin',
				valueType: 'AlphaValue',
			},
		},
	},
})

const betaMethod = defineFieldBuilderMethod({
	name: 'beta',
	contexts: {
		stored: {
			factory: betaField,
			fieldKind: 'fixture.beta',
			typegen: {
				methodType: 'BetaFieldBuilderMethod',
				module: '@fixture/beta-plugin',
				valueType: 'BetaValue',
			},
		},
	},
})

const schemaDeclarePrivilege = {
	name: 'schema:declare',
	reason: 'Declares fixture FieldBuilder methods.',
} as const

const alphaPlugin = () =>
	definePlugin({
		version: '0.0.0',
		core: '^0.0.0',
		pluginId: 'fixture.alpha-plugin',
		privileges: [schemaDeclarePrivilege],
		declare: ({ fields }) => {
			fields.register(alphaMethod)
		},
	})

const betaPlugin = () =>
	definePlugin({
		version: '0.0.0',
		core: '^0.0.0',
		pluginId: 'fixture.beta-plugin',
		privileges: [schemaDeclarePrivilege],
		declare: ({ fields }) => {
			fields.register(betaMethod)
		},
	})

describe('plugin FieldBuilder methods', () => {
	it('materializes only the factory declared for the active field context', async () => {
		const contextualMethod = defineFieldBuilderMethod({
			name: 'contextual',
			contexts: {
				embedded: {
					factory: betaField,
					fieldKind: 'fixture.beta',
					typegen: betaMethod.contexts.stored.typegen,
				},
				stored: {
					factory: alphaField,
					fieldKind: 'fixture.alpha',
					typegen: alphaMethod.contexts.stored.typegen,
				},
			},
		})
		const plugin = definePlugin({
			core: '^0.0.0',
			declare: ({ fields }) => {
				fields.register(contextualMethod)
			},
			pluginId: 'fixture.contextual-plugin',
			privileges: [schemaDeclarePrivilege],
			version: '1.0.0',
		})
		const Contextual = Schema.define({
			className: 'ContextualPluginMethod',
			fields: (field) => ({
				root: (
					field as FixtureFieldBuilder & {
						readonly contextual: FixtureFieldBuilderMethod
					}
				).contextual(),
				value: field.object({
					fields: (embedded) => ({
						nested: (
							embedded as typeof embedded & {
								readonly contextual: FixtureFieldBuilderMethod
							}
						).contextual(),
					}),
				}),
			}),
		})

		await (
			await createApplication({ plugins: [plugin], schemas: [Contextual] })
		).dispose()

		expect(Contextual.fields.root?.kind).toBe('fixture.alpha')
		const nested = Contextual.fields.value
		expect(nested?.kind).toBe('object')
		const nestedFields =
			nested !== undefined && 'fields' in nested.options
				? nested.options.fields
				: undefined
		expect(
			isPlainRecord(nestedFields) &&
				isPlainRecord(nestedFields.nested) &&
				'kind' in nestedFields.nested
				? nestedFields.nested.kind
				: undefined,
		).toBe('fixture.beta')
	})

	it('rejects a configured method used outside its declared context', async () => {
		const InvalidEmbedded = Schema.define({
			className: 'InvalidEmbeddedPluginMethod',
			fields: (field) => ({
				value: field.object({
					fields: (embedded) => ({
						alpha: (
							embedded as typeof embedded & {
								readonly alpha: FixtureFieldBuilderMethod
							}
						).alpha(),
					}),
				}),
			}),
		})

		await expect(
			createApplication({
				plugins: [alphaPlugin()],
				schemas: [InvalidEmbedded],
			}),
		).rejects.toMatchObject({
			code: 'PLUGIN_DECLARATION_INVALID',
			cause: {
				cause: new TypeError(
					'InvalidEmbeddedPluginMethod.fields.value.object.fields.alpha FieldBuilder method "alpha" from "fixture.alpha-plugin" does not support the embedded context',
				),
			},
		})
	})

	it('declares owned methods before schema compilation and plugin setup', async () => {
		const trace: string[] = []
		const plugin = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.ordered-plugin',
			privileges: [schemaDeclarePrivilege],
			declare: ({ fields }) => {
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

		const application = applicationFixture(
			await createApplication({
				plugins: [plugin],
				schemas: [Document],
			}),
		)
		await application.dispose()

		expect(trace).toStrictEqual(['fields', 'declare', 'setup:fixture.alpha'])
		expect(Document.fields.value?.options).toMatchObject({ marker: 'ordered' })
		expect(application.fieldBuilderMethods).toStrictEqual([
			{
				contexts: {
					stored: {
						factory: alphaField,
						fieldKind: 'fixture.alpha',
						typegen: {
							methodType: 'AlphaFieldBuilderMethod',
							module: '@fixture/alpha-plugin',
							valueType: 'AlphaValue',
						},
					},
				},
				name: 'alpha',
				owner: 'fixture.ordered-plugin',
			},
		])
		expect(Object.isFrozen(application.fieldBuilderMethods)).toBe(true)
		expect(application.pluginFieldTypes).toStrictEqual([
			expect.objectContaining({
				fieldKind: 'fixture.alpha',
				owner: 'fixture.ordered-plugin',
				typegen: {
					module: '@fixture/alpha-plugin',
					valueType: 'AlphaValue',
				},
			}),
		])
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
		).rejects.toMatchObject({
			code: 'PLUGIN_DECLARATION_INVALID',
			cause: {
				cause: new TypeError(
					'MissingPluginMethod.fields.value FieldBuilder method "alpha" is unavailable; configure the plugin that declares it',
				),
				code: 'SCHEMA_COMPILATION_FAILED',
				reason: 'callback-threw',
			},
		})
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
		const alphaApplication = applicationFixture(
			await createApplication({
				plugins: [alphaPlugin()],
				schemas: [Alpha],
			}),
		)
		await alphaApplication.dispose()
		const betaApplication = applicationFixture(
			await createApplication({
				plugins: [betaPlugin()],
				schemas: [Beta],
			}),
		)
		await betaApplication.dispose()
		await (
			await createApplication({
				plugins: [alphaPlugin()],
				schemas: [Shared],
			})
		).dispose()

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
		).rejects.toMatchObject({
			code: 'PLUGIN_DECLARATION_INVALID',
			cause: {
				cause: new TypeError(
					'SharedPluginMethod.fields.value FieldBuilder method "alpha" is unavailable; configure the plugin that declares it',
				),
				code: 'SCHEMA_COMPILATION_FAILED',
				reason: 'callback-threw',
			},
		})
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

		await (
			await createApplication({
				plugins: [alphaPlugin()],
				schemas: [Snapshot],
			})
		).dispose()

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
			name: 'string',
			contexts: { stored: alphaMethod.contexts.stored },
		})
		const overridePlugin = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.override-plugin',
			privileges: [schemaDeclarePrivilege],
			declare: ({ fields }) => {
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
						privileges: [schemaDeclarePrivilege],
						declare: ({ fields }) => {
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
			name: 'alpha',
			contexts: {
				stored: {
					factory: betaField,
					fieldKind: 'fixture.alpha',
					typegen: alphaMethod.contexts.stored.typegen,
				},
			},
		})
		const incompatiblePlugin = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.incompatible-plugin',
			privileges: [schemaDeclarePrivilege],
			declare: ({ fields }) => {
				fields.register(incompatibleMethod)
			},
		})

		await expect(
			createApplication({
				plugins: [incompatiblePlugin],
				schemas: [WrongKind],
			}),
		).rejects.toMatchObject({
			code: 'PLUGIN_DECLARATION_INVALID',
			cause: {
				cause: new TypeError(
					'WrongPluginMethodKind.fields.value FieldBuilder method "alpha" from "fixture.incompatible-plugin" returned kind "fixture.beta" instead of "fixture.alpha"',
				),
				code: 'SCHEMA_COMPILATION_FAILED',
				reason: 'callback-threw',
			},
		})

		const asynchronousPlugin = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.async-plugin',
			privileges: [schemaDeclarePrivilege],
			// @ts-expect-error -- Runtime still rejects declarations loaded from JavaScript.
			declare: async ({ fields }) => {
				fields.register(alphaMethod)
				await Promise.resolve()
			},
		})

		await expect(
			createApplication({ plugins: [asynchronousPlugin], schemas: [] }),
		).rejects.toThrow(
			'Plugin "fixture.async-plugin" declare must be synchronous and return nothing',
		)
	})

	it('snapshots typegen metadata and rejects untrusted definitions', async () => {
		const typegen = {
			methodType: 'SnapshotFieldBuilderMethod',
			module: '@fixture/snapshot-plugin',
			valueType: 'SnapshotValue',
		}
		const method = defineFieldBuilderMethod({
			name: 'snapshot',
			contexts: {
				stored: {
					factory: alphaField,
					fieldKind: 'fixture.alpha',
					typegen,
				},
			},
		})

		typegen.methodType = 'MutatedMethod'
		const application = applicationFixture(
			await createApplication({
				plugins: [
					definePlugin({
						version: '0.0.0',
						core: '^0.0.0',
						pluginId: 'fixture.snapshot-plugin',
						privileges: [schemaDeclarePrivilege],
						declare: ({ fields }) => {
							fields.register(method)
						},
					}),
				],
				schemas: [],
			}),
		)
		await application.dispose()

		expect(
			application.fieldBuilderMethods[0]?.contexts.stored?.typegen.methodType,
		).toBe('SnapshotFieldBuilderMethod')
		expect(
			Object.isFrozen(
				application.fieldBuilderMethods[0]?.contexts.stored?.typegen,
			),
		).toBe(true)

		const untrustedPlugin = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.untrusted-plugin',
			privileges: [schemaDeclarePrivilege],
			declare: ({ fields }) => {
				const untrusted = {
					contexts: {
						stored: {
							factory: alphaField,
							fieldKind: 'fixture.alpha',
							typegen,
						},
					},
					name: 'untrusted',
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
