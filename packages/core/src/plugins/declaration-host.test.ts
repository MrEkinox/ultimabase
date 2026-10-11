import { applicationFixture } from '../../tests/application-fixture.js'
import { describe, expect, it } from 'vitest'
import { createApplication } from '../application/framework-application.js'

import { definePluginFieldFamily, stringField } from '../index.js'
import {
	defineCapability,
	plugin as createPlugin,
	contributeDeclarations,
	optionalCapability,
	provideCapability,
	requireCapability,
	type CapabilityRequirement,
	type PluginDeclarationCapabilityReader,
} from '../plugin.js'
import { FieldBuilderMethodRegistry } from '../schema/schema/field-builder-method-registry.js'

const alphaMethod = definePluginFieldFamily({
	fieldKind: 'fixture.alpha',
	typegen: { module: '@fixture/alpha-plugin', valueType: 'AlphaValue' },
	builder: {
		name: 'alpha',
		contexts: {
			stored: { factory: stringField, methodType: 'AlphaFieldBuilderMethod' },
		},
	},
})

const betaMethod = definePluginFieldFamily({
	fieldKind: 'fixture.beta',
	typegen: { module: '@fixture/beta-plugin', valueType: 'BetaValue' },
	builder: {
		name: 'beta',
		contexts: {
			stored: { factory: stringField, methodType: 'BetaFieldBuilderMethod' },
		},
	},
})

const declarationCapability = defineCapability<{
	readonly label: string
}>()({
	capabilityId: 'fixture.static-declaration',
	version: '1.0.0',
	cardinality: 'single',
	lifetime: 'declaration',
	compose: ([provider]) => provider,
})

const applicationCapability = defineCapability<{
	readonly ready: boolean
}>()({
	capabilityId: 'fixture.application-declaration',
	version: '1.0.0',
	cardinality: 'single',
	lifetime: 'application',
	compose: ([provider]) => provider,
})

describe('PluginDeclarationHost', () => {
	it('accepts receipts and rejects arbitrary declaration results', async () => {
		const valid = createPlugin({
			id: 'fixture.valid-receipt',
			version: '1.0.0',
			core: '^0.0.0',
			permissions: { 'schema:declare': 'Declares one field family.' },
			contributions: [
				contributeDeclarations({
					schema: ({ fields }) => fields.register(alphaMethod),
				}),
			],
		})
		const application = applicationFixture(
			await createApplication({ plugins: [valid], schemas: [] }),
		)
		expect(application.fieldBuilderMethods.map(({ name }) => name)).toEqual([
			'alpha',
		])
		await application.dispose()

		const invalid = createPlugin({
			id: 'fixture.invalid-receipt',
			version: '1.0.0',
			core: '^0.0.0',
			permissions: { 'schema:declare': 'Exercises the Runtime boundary.' },
			contributions: [
				contributeDeclarations({
					schema: () => ({ registered: true }) as unknown as undefined,
				}),
			],
		})
		await expect(
			createApplication({ plugins: [invalid], schemas: [] }),
		).rejects.toThrow(
			'plugin declaration contribution callbacks may return only Core declaration receipts',
		)
	})

	it('exposes derived privilege facades and keeps applications isolated', async () => {
		const plugin = () =>
			createPlugin({
				id: 'fixture.derived-declarer',
				version: '1.0.0',
				core: '^0.0.0',
				contributions: [
					contributeDeclarations({
						schema: ({ fields }) => fields.register(alphaMethod),
					}),
				],
			})

		const first = applicationFixture(
			await createApplication({
				plugins: [plugin()],
				logger: false,
				schemas: [],
			}),
		)
		await first.dispose()
		const second = applicationFixture(
			await createApplication({
				plugins: [plugin()],
				logger: false,
				schemas: [],
			}),
		)

		expect(first.fieldBuilderMethods.map(({ name }) => name)).toEqual(['alpha'])
		expect(second.fieldBuilderMethods.map(({ name }) => name)).toEqual([
			'alpha',
		])
		await second.dispose()
	})

	it('resolves every declaration privilege through one derived set', async () => {
		const properties = [
			'fields',
			'models',
			'operations',
			'privateStorage',
			'typegenReferences',
		] as const
		const observed: boolean[] = []
		const observe =
			(property: (typeof properties)[number]) =>
			(context: object): undefined => {
				observed.push(Object.hasOwn(context, property))
				return undefined
			}
		const declarer = createPlugin({
			id: 'fixture.all-declarations',
			version: '1.0.0',
			core: '^0.0.0',
			// Only the critical private-storage privilege needs an author reason.
			permissions: { 'storage:private': 'Declares private storage.' },
			contributions: [
				contributeDeclarations({
					models: observe('models'),
					operations: observe('operations'),
					privateStorage: observe('privateStorage'),
					schema: observe('fields'),
					typegen: observe('typegenReferences'),
				}),
			],
		})
		const application = applicationFixture(
			await createApplication({
				plugins: [declarer],
				logger: false,
				schemas: [],
			}),
		)

		expect(observed).toEqual(properties.map(() => true))
		await application.dispose()
	})

	it('reads only exact static requirements and closes captured readers', async () => {
		const required = requireCapability(declarationCapability, '^1.0.0')
		const absent = optionalCapability(
			defineCapability<{ readonly missing: true }>()({
				capabilityId: 'fixture.absent-static',
				version: '1.0.0',
				cardinality: 'single',
				lifetime: 'declaration',
				compose: ([provider]) => provider,
			}),
			'^1.0.0',
		)
		let observed: { readonly label: string } | undefined
		let optionalObserved: { readonly missing: true } | undefined
		let captured:
			| PluginDeclarationCapabilityReader<
					readonly [typeof required, typeof absent]
			  >
			| undefined
		const provider = createPlugin({
			id: 'fixture.reader-provider',
			version: '1.0.0',
			core: '^0.0.0',
			contributions: [
				provideCapability(declarationCapability, {
					contributionId: 'fixture',
					value: { label: 'composed' },
				}),
			],
		})
		const consumer = createPlugin({
			id: 'fixture.reader-consumer',
			version: '1.0.0',
			core: '^0.0.0',
			permissions: { 'schema:declare': 'Reads declaration capabilities.' },
			contributions: [
				contributeDeclarations({
					requires: [required, absent],
					schema: ({ capabilities }) => {
						captured = capabilities
						observed = capabilities.get(required)
						optionalObserved = capabilities.get(absent)
					},
				}),
			],
		})

		applicationFixture(
			await createApplication({ plugins: [consumer, provider], schemas: [] }),
		)

		expect(observed).toEqual({ label: 'composed' })
		expect(optionalObserved).toBeUndefined()
		expect(() => captured?.get(required)).toThrow(
			'Plugin static declaration facade is already closed',
		)
	})

	it('rejects undeclared and application-lifetime reads before setup', async () => {
		const undeclared = optionalCapability(declarationCapability, '^1.0.0')
		const applicationRequirement = optionalCapability(
			applicationCapability,
			'^1.0.0',
		)
		const readThroughRuntimeBoundary = (
			reader: PluginDeclarationCapabilityReader,
			requirement: CapabilityRequirement,
		): unknown =>
			(
				reader as Readonly<{
					get(requirement: CapabilityRequirement): unknown
				}>
			).get(requirement)
		const undeclaredPlugin = createPlugin({
			id: 'fixture.undeclared-reader',
			version: '1.0.0',
			core: '^0.0.0',
			permissions: { 'schema:declare': 'Exercises undeclared reads.' },
			contributions: [
				contributeDeclarations({
					schema: ({ capabilities }) => {
						readThroughRuntimeBoundary(capabilities, undeclared)
					},
				}),
			],
		})

		await expect(
			createApplication({ plugins: [undeclaredPlugin], schemas: [] }),
		).rejects.toThrow('attempted to read an undeclared capability requirement')
		expect(() =>
			contributeDeclarations({
				requires: [applicationRequirement],
				schema: () => undefined,
			}),
		).toThrow(
			'plugin declaration contributions may require only declaration capabilities',
		)
	})

	it('publishes field registrations atomically and closes stored facades', () => {
		const registry = new FieldBuilderMethodRegistry()
		const failed = registry.beginPluginDeclaration('fixture.failed')
		failed.fields.register(alphaMethod)
		failed.close()

		const successful = registry.beginPluginDeclaration('fixture.successful')
		successful.fields.register(alphaMethod)
		successful.commit()
		successful.close()
		registry.close()

		expect(registry.values().map(({ owner }) => owner)).toEqual([
			'fixture.successful',
		])
		expect(() => {
			successful.fields.register(betaMethod)
		}).toThrow('Plugin field family declaration facade is already closed')
	})

	it('binds contributions to two explicit instances in deterministic order', async () => {
		const createInstance = (
			instanceId: 'primary' | 'secondary',
			method: typeof alphaMethod | typeof betaMethod,
		) =>
			createPlugin({
				id: 'fixture.repeated-declarer',
				instanceId,
				version: '1.0.0',
				core: '^0.0.0',
				permissions: {
					'schema:declare': `Declares the ${method.builder.name} fixture method.`,
				},
				contributions: [
					contributeDeclarations({
						schema: ({ fields }) => {
							fields.register(method)

							return undefined
						},
					}),
				],
			})

		const application = applicationFixture(
			await createApplication({
				plugins: [
					createInstance('primary', alphaMethod),
					createInstance('secondary', betaMethod),
				],
				schemas: [],
			}),
		)

		expect(
			application.fieldBuilderMethods.map(({ name, owner }) => ({
				name,
				owner,
			})),
		).toEqual([
			{
				name: 'alpha',
				owner: 'fixture.repeated-declarer (instance primary)',
			},
			{
				name: 'beta',
				owner: 'fixture.repeated-declarer (instance secondary)',
			},
		])
	})
})
