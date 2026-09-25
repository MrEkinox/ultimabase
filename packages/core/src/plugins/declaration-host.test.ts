import { applicationFixture } from '../../tests/application-fixture.js'
import { describe, expect, it } from 'vitest'

import {
	createApplication,
	defineCapability,
	defineFieldBuilderMethod,
	definePlugin,
	optionalCapability,
	provideCapability,
	requireCapability,
	stringField,
	type CapabilityRequirement,
	type PluginDeclarationCapabilityReader,
} from '../index.js'
import { FieldBuilderMethodRegistry } from '../schema/schema/field-builder-methods.js'

const alphaMethod = defineFieldBuilderMethod({
	name: 'alpha',
	contexts: {
		stored: {
			factory: stringField,
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
			factory: stringField,
			fieldKind: 'fixture.beta',
			typegen: {
				methodType: 'BetaFieldBuilderMethod',
				module: '@fixture/beta-plugin',
				valueType: 'BetaValue',
			},
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
	it('exposes only active privilege facades and keeps applications isolated', async () => {
		const conditionalRequirement = optionalCapability(
			declarationCapability,
			'^1.0.0',
		)
		const plugin = () =>
			definePlugin({
				pluginId: 'fixture.conditional-declarer',
				version: '1.0.0',
				core: '^0.0.0',
				capabilities: [conditionalRequirement],
				privileges: [
					{
						name: 'schema:declare',
						reason: 'Declares alpha when the static protocol is present.',
						when: conditionalRequirement,
					},
				],
				declare: ({ fields }) => {
					fields?.register(alphaMethod)
				},
			})
		const provider = definePlugin({
			pluginId: 'fixture.static-provider',
			version: '1.0.0',
			core: '^0.0.0',
			capabilities: [
				provideCapability(declarationCapability, {
					contributionId: 'fixture',
					value: { label: 'available' },
				}),
			],
		})

		const withoutProvider = applicationFixture(
			await createApplication({
				plugins: [plugin()],
				schemas: [],
			}),
		)
		await withoutProvider.dispose()
		const withProvider = applicationFixture(
			await createApplication({
				plugins: [plugin(), provider],
				schemas: [],
			}),
		)

		expect(withoutProvider.fieldBuilderMethods).toStrictEqual([])
		expect(withProvider.fieldBuilderMethods.map(({ name }) => name)).toEqual([
			'alpha',
		])
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
		const provider = definePlugin({
			pluginId: 'fixture.reader-provider',
			version: '1.0.0',
			core: '^0.0.0',
			capabilities: [
				provideCapability(declarationCapability, {
					contributionId: 'fixture',
					value: { label: 'composed' },
				}),
			],
		})
		const consumer = definePlugin({
			pluginId: 'fixture.reader-consumer',
			version: '1.0.0',
			core: '^0.0.0',
			capabilities: [required, absent],
			declare: ({ capabilities }) => {
				captured = capabilities
				observed = capabilities.get(required)
				optionalObserved = capabilities.get(absent)
			},
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
		const undeclaredPlugin = definePlugin({
			pluginId: 'fixture.undeclared-reader',
			version: '1.0.0',
			core: '^0.0.0',
			declare: ({ capabilities }) => {
				readThroughRuntimeBoundary(capabilities, undeclared)
			},
		})
		const applicationPlugin = definePlugin({
			pluginId: 'fixture.application-reader',
			version: '1.0.0',
			core: '^0.0.0',
			capabilities: [applicationRequirement],
			declare: ({ capabilities }) => {
				readThroughRuntimeBoundary(capabilities, applicationRequirement)
			},
		})

		await expect(
			createApplication({ plugins: [undeclaredPlugin], schemas: [] }),
		).rejects.toThrow('attempted to read an undeclared capability requirement')
		await expect(
			createApplication({ plugins: [applicationPlugin], schemas: [] }),
		).rejects.toThrow(
			'attempted to read application capability "fixture.application-declaration" during static declaration',
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
		}).toThrow('FieldBuilder method declaration facade is already closed')
	})

	it('binds contributions to two explicit instances in deterministic order', async () => {
		const createInstance = (
			instanceId: 'primary' | 'secondary',
			method: typeof alphaMethod | typeof betaMethod,
		) =>
			definePlugin({
				pluginId: 'fixture.repeated-declarer',
				instanceId,
				version: '1.0.0',
				core: '^0.0.0',
				privileges: [
					{
						name: 'schema:declare',
						reason: `Declares the ${method.name} fixture method.`,
					},
				],
				declare: ({ fields }) => {
					fields.register(method)
				},
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
