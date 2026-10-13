import { applicationFixture } from '../../../tests/application-fixture.js'
import { describe, expect, it } from 'vitest'
import { isPlainRecord } from '@ultimabase/shared'

import {
	definePluginFieldFamily,
	definePluginField,
	UltimaBase,
	type FieldBuilder,
	type FieldOptions,
	type PluginFieldFamilyDefinition,
} from '../../index.js'
import {
	plugin as createPlugin,
	contributeApplication,
	contributeDeclarations,
	withPluginPrivileges,
	type PluginSchemaContributionContext,
} from '../../plugin.js'
import { createApplication } from '../../application/framework-application.js'

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

const alphaMethod = definePluginFieldFamily({
	fieldKind: 'fixture.alpha',
	builder: {
		name: 'alpha',
		contexts: {
			stored: { factory: alphaField },
		},
	},
})

const betaMethod = definePluginFieldFamily({
	fieldKind: 'fixture.beta',
	builder: {
		name: 'beta',
		contexts: {
			stored: { factory: betaField },
		},
	},
})

const schemaDeclarePrivilege = {
	name: 'schema:declare',
	reason: 'Declares fixture FieldBuilder methods.',
} as const

const alphaPlugin = () =>
	createPlugin({
		version: '0.0.0',
		core: '^0.0.0',
		id: 'fixture.alpha-plugin',
		permissions: {
			[schemaDeclarePrivilege.name]: schemaDeclarePrivilege.reason,
		},
		contributions: [
			contributeDeclarations({
				schema: ({ fields }) => fields.register(alphaMethod),
			}),
		],
	})

const betaPlugin = () =>
	createPlugin({
		version: '0.0.0',
		core: '^0.0.0',
		id: 'fixture.beta-plugin',
		permissions: {
			[schemaDeclarePrivilege.name]: schemaDeclarePrivilege.reason,
		},
		contributions: [
			contributeDeclarations({
				schema: ({ fields }) => {
					fields.register(betaMethod)

					return undefined
				},
			}),
		],
	})

describe('plugin FieldBuilder methods', () => {
	it('materializes only the factory declared for the active field context', async () => {
		const contextualMethod = definePluginFieldFamily({
			fieldKind: 'fixture.alpha',
			builder: {
				name: 'contextual',
				contexts: {
					embedded: {
						factory: betaField,
						fieldKind: 'fixture.beta',
					},
					stored: {
						factory: alphaField,
					},
				},
			},
		})
		const plugin = createPlugin({
			core: '^0.0.0',
			id: 'fixture.contextual-plugin',
			permissions: {
				[schemaDeclarePrivilege.name]: schemaDeclarePrivilege.reason,
			},
			version: '1.0.0',
			contributions: [
				contributeDeclarations({
					schema: ({ fields }) => {
						fields.register(contextualMethod)

						return undefined
					},
				}),
			],
		})
		const Contextual = UltimaBase.Schema.define({
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
		const InvalidEmbedded = UltimaBase.Schema.define({
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
		const plugin = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.ordered-plugin',
			permissions: {
				[schemaDeclarePrivilege.name]: schemaDeclarePrivilege.reason,
			},
			contributions: [
				contributeDeclarations({
					schema: ({ fields }) => {
						trace.push('declare')
						fields.register(alphaMethod)

						return undefined
					},
				}),
				withPluginPrivileges(
					contributeApplication((context) => {
						const { schemas } = context
						const schema = schemas.get('PluginMethodDocument')
						trace.push(`setup:${schema?.fields.value?.kind ?? 'missing'}`)
						const exports = undefined
						const lifecycleContext = { ...context, pluginExports: exports }
						void lifecycleContext
						return { exports }
					}),
					[schemaDeclarePrivilege.name],
				),
			],
		})
		const Document = UltimaBase.Schema.define({
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
					},
				},
				name: 'alpha',
				owner: 'fixture.ordered-plugin',
			},
		])
		expect(Object.isFrozen(application.fieldBuilderMethods)).toBe(true)
	})

	it('fails precisely when no configured plugin declares a used method', async () => {
		const Missing = UltimaBase.Schema.define({
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
		const Shared = UltimaBase.Schema.define({
			className: 'SharedPluginMethod',
			fields: (field) => {
				sharedDeclarations += 1
				return { value: fixtureBuilder(field).alpha() }
			},
		})
		const Alpha = UltimaBase.Schema.define({
			className: 'IsolatedAlphaMethod',
			fields: (field) => ({ value: fixtureBuilder(field).alpha() }),
		})
		const Beta = UltimaBase.Schema.define({
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
		const Snapshot = UltimaBase.Schema.define({
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
		const Unresolved = UltimaBase.Schema.define({
			className: 'ConflictingPluginMethod',
			fields: () => {
				declarations += 1
				return {}
			},
		})
		const override = definePluginFieldFamily({
			fieldKind: alphaMethod.fieldKind,
			builder: {
				name: 'string',
				contexts: {
					stored: {
						factory: alphaField,
					},
				},
			},
		})
		const overridePlugin = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.override-plugin',
			permissions: {
				[schemaDeclarePrivilege.name]: schemaDeclarePrivilege.reason,
			},
			contributions: [
				contributeDeclarations({
					schema: ({ fields }) => {
						fields.register(override)

						return undefined
					},
				}),
			],
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
					createPlugin({
						version: '0.0.0',
						core: '^0.0.0',
						id: 'fixture.duplicate-plugin',
						permissions: {
							[schemaDeclarePrivilege.name]: schemaDeclarePrivilege.reason,
						},
						contributions: [
							contributeDeclarations({
								schema: ({ fields }) => {
									fields.register(alphaMethod)

									return undefined
								},
							}),
						],
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
		const WrongKind = UltimaBase.Schema.define({
			className: 'WrongPluginMethodKind',
			fields: (field) => ({ value: fixtureBuilder(field).alpha() }),
		})
		const incompatibleMethod = definePluginFieldFamily({
			fieldKind: 'fixture.alpha',
			builder: {
				name: 'alpha',
				contexts: {
					stored: {
						factory: betaField,
					},
				},
			},
		})
		const incompatiblePlugin = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.incompatible-plugin',
			permissions: {
				[schemaDeclarePrivilege.name]: schemaDeclarePrivilege.reason,
			},
			contributions: [
				contributeDeclarations({
					schema: ({ fields }) => {
						fields.register(incompatibleMethod)

						return undefined
					},
				}),
			],
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

		const asynchronousPlugin = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.async-plugin',
			permissions: {
				[schemaDeclarePrivilege.name]: schemaDeclarePrivilege.reason,
			},
			contributions: [
				contributeDeclarations({
					schema: (async ({ fields }: PluginSchemaContributionContext) => {
						fields.register(alphaMethod)
						await Promise.resolve()

						return undefined
					}) as never,
				}),
			],
		})

		await expect(
			createApplication({ plugins: [asynchronousPlugin], schemas: [] }),
		).rejects.toThrow(
			'plugin declaration contribution callbacks may return only Core declaration receipts',
		)
	})

	it('snapshots builder metadata and rejects untrusted definitions', async () => {
		const method = definePluginFieldFamily({
			fieldKind: 'fixture.alpha',
			builder: {
				name: 'snapshot',
				contexts: {
					stored: {
						factory: alphaField,
					},
				},
			},
		})

		const application = applicationFixture(
			await createApplication({
				plugins: [
					createPlugin({
						version: '0.0.0',
						core: '^0.0.0',
						id: 'fixture.snapshot-plugin',
						permissions: {
							[schemaDeclarePrivilege.name]: schemaDeclarePrivilege.reason,
						},
						contributions: [
							contributeDeclarations({
								schema: ({ fields }) => {
									fields.register(method)

									return undefined
								},
							}),
						],
					}),
				],
				schemas: [],
			}),
		)
		await application.dispose()

		expect(application.fieldBuilderMethods[0]?.contexts.stored?.fieldKind).toBe(
			'fixture.alpha',
		)
		expect(
			Object.isFrozen(application.fieldBuilderMethods[0]?.contexts.stored),
		).toBe(true)

		const untrustedPlugin = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.untrusted-plugin',
			permissions: {
				[schemaDeclarePrivilege.name]: schemaDeclarePrivilege.reason,
			},
			contributions: [
				contributeDeclarations({
					schema: ({ fields }) => {
						const untrusted = {
							fieldKind: 'fixture.alpha',
						} as PluginFieldFamilyDefinition

						fields.register(untrusted)

						return undefined
					},
				}),
			],
		})

		await expect(
			createApplication({ plugins: [untrustedPlugin], schemas: [] }),
		).rejects.toThrow(
			'Plugin field family from fixture.untrusted-plugin must be created by definePluginFieldFamily',
		)
	})
})
