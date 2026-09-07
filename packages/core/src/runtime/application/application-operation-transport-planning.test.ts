import {
	FrameworkApplication,
	createApplication,
	defineCapability,
	defineOperation,
	defineOperationValue,
	definePlugin,
	decorateCapability,
	provideCapability,
	replaceCapability,
	requireCapability,
	type ApplicationCallbackExecutor,
	type PluginIdentity,
} from '../../foundation.js'
import { immutableRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import { CapabilityInventory } from '../../plugins/capability-inventory.js'
import { normalizePlugins } from '../../plugins/normalization.js'
import {
	defineOperationTransport,
	operationTransportBinding,
	operationWireCodec,
	provideOperationTransportBinding,
} from '../plugin-operations/capabilities.js'
import {
	applicationOperationTransportPlanningCapability,
	type ApplicationOperationTransportPlanner,
} from './application-operation-transport-planning.js'

const value = defineOperationValue((input: unknown, path): string => {
	if (typeof input !== 'string') throw new TypeError(`${path} must be a string`)
	return input
})
const operation = defineOperation({
	errors: ['FIXTURE_REJECTED'] as const,
	input: value,
	name: 'fixture.operation-planning.inspect',
	result: value,
	target: 'application',
	transaction: 'forbidden',
	version: '1.0.0',
})
const protocol = defineOperationTransport({
	name: 'fixture.operation-planning.transport',
	version: '1.0.0',
})
const binding = operationTransportBinding({
	codec: operationWireCodec({
		decode: (input: string) => input,
		encode: (result) => result,
		operation,
		transport: protocol,
	}),
	metadata: { field: 'inspect' },
	operation,
})
const ownerPlugin = definePlugin({
	capabilities: {
		provides: [
			provideOperationTransportBinding({
				contributionId: 'binding',
				create: () => ({ value: binding }),
			}),
		],
	},
	core: '^0.0.0',
	declare: ({ operations }) => {
		operations.declare(operation)
		return undefined
	},
	pluginId: 'fixture.operation-planning.owner',
	privileges: [
		{ name: 'operation:declare', reason: 'Declares the planning fixture.' },
		{ name: 'transport:expose', reason: 'Binds the planning fixture.' },
	] as const,
	version: '1.0.0',
})

const planningRequirement = requireCapability(
	applicationOperationTransportPlanningCapability,
	'^1.0.0',
)
const harnessCapability = defineCapability<
	Readonly<{ readonly ready: true }>
>()({
	capabilityId: 'fixture.operation-planning.harness',
	cardinality: 'single',
	compose: ([provider]) => provider,
	lifetime: 'application',
	version: '1.0.0',
})

interface PlanningHarness {
	callbacks?: ApplicationCallbackExecutor
	owner?: PluginIdentity
	planner?: ApplicationOperationTransportPlanner
}

const consumerPlugin = (harness: PlanningHarness) =>
	definePlugin({
		capabilities: {
			provides: [
				provideCapability(harnessCapability, {
					contributionId: 'harness',
					create: ({ callbacks, capabilities, owner }) => {
						harness.callbacks = callbacks
						harness.owner = owner
						harness.planner = capabilities.get(planningRequirement)
						return { value: immutableRecord({ ready: true as const }) }
					},
				}),
			],
			requires: [planningRequirement],
		},
		core: '^0.0.0',
		pluginId: 'fixture.operation-planning.consumer',
		privileges: [
			{ name: 'transport:expose', reason: 'Compiles the fixture transport.' },
		] as const,
		version: '1.0.0',
	})

const runPlanning = <TResult>(
	harness: PlanningHarness,
	callback: (planner: ApplicationOperationTransportPlanner) => TResult,
): TResult => {
	if (
		harness.callbacks === undefined ||
		harness.owner === undefined ||
		harness.planner === undefined
	) {
		throw new TypeError('Planning harness is unavailable')
	}
	const callbacks = harness.callbacks
	const owner = harness.owner
	const planner = harness.planner
	return callbacks.runPlugin(owner, () => callback(planner))
}

describe('application operation transport planning', () => {
	it('returns immutable inert descriptors for exact owned bindings', async () => {
		const harness: PlanningHarness = {}
		const application = await createApplication({
			pluginPrivileges: { logger: false },
			plugins: [ownerPlugin, consumerPlugin(harness)],
			schemas: [],
		})
		const plan = runPlanning(harness, (planner) =>
			planner.plan({ operations: [operation], transport: protocol }),
		)

		expect(plan).toStrictEqual({
			operations: [
				{
					errors: ['FIXTURE_REJECTED'],
					metadata: { field: 'inspect' },
					name: operation.name,
					owner: {
						pluginId: 'fixture.operation-planning.owner',
						version: '1.0.0',
					},
					version: '1.0.0',
				},
			],
			transport: protocol,
		})
		expect(Object.isFrozen(plan)).toBe(true)
		expect(plan.operations[0]).not.toHaveProperty('codec')
		await application.dispose()
		expect(() =>
			runPlanning(harness, (planner) =>
				planner.plan({ operations: [operation], transport: protocol }),
			),
		).toThrow('unavailable')
	})

	it('rejects non-installed tokens and absent exact protocol bindings', async () => {
		const harness: PlanningHarness = {}
		const application = await createApplication({
			pluginPrivileges: { logger: false },
			plugins: [ownerPlugin, consumerPlugin(harness)],
			schemas: [],
		})
		const foreignProtocol = defineOperationTransport({
			name: 'fixture.operation-planning.foreign',
			version: '1.0.0',
		})
		const forged = defineOperation({
			errors: operation.errors,
			input: value,
			name: operation.name,
			result: value,
			target: 'application',
			transaction: 'forbidden',
			version: '1.0.0',
		})

		expect(() =>
			runPlanning(harness, (planner) =>
				planner.plan({ operations: [forged], transport: protocol }),
			),
		).toThrow('not an installed application operation')
		expect(() =>
			runPlanning(harness, (planner) =>
				planner.plan({ operations: [operation], transport: foreignProtocol }),
			),
		).toThrow('requires one exact binding')
		await application.dispose()
	})

	it('is Core-owned, demand-installed, and cannot be overridden', () => {
		const withoutConsumer = new CapabilityInventory(normalizePlugins([]))
		expect(
			withoutConsumer.entries.some(
				({ token }) =>
					token === applicationOperationTransportPlanningCapability,
			),
		).toBe(false)
		const withConsumer = new CapabilityInventory(
			normalizePlugins([consumerPlugin({})]),
		)
		expect(
			withConsumer.entries.find(
				({ token }) =>
					token === applicationOperationTransportPlanningCapability,
			),
		).toMatchObject({
			providers: [{ owner: { pluginId: '@ultimabase/core' } }],
		})

		const fake = {} as ApplicationOperationTransportPlanner
		for (const declaration of [
			provideCapability(applicationOperationTransportPlanningCapability, {
				contributionId: 'forged-provider',
				create: () => ({ value: fake }),
			}),
			replaceCapability(applicationOperationTransportPlanningCapability, {
				contributionId: 'forged-replacement',
				target: {
					contributionId: 'application-operation-transport-planner',
					owner: { pluginId: '@ultimabase/core' },
				},
				create: () => ({ value: fake }),
			}),
			decorateCapability(applicationOperationTransportPlanningCapability, {
				contributionId: 'forged-decorator',
				decorate: (planner) => planner,
			}),
		] as const) {
			expect(
				() =>
					new FrameworkApplication({
						plugins: [
							definePlugin({
								capabilities: {
									decorates:
										declaration.kind === 'capability-decorator'
											? [declaration]
											: [],
									provides:
										declaration.kind === 'capability-provider'
											? [declaration]
											: [],
									replaces:
										declaration.kind === 'capability-replacement'
											? [declaration]
											: [],
								},
								core: '^0.0.0',
								pluginId: `fixture.${declaration.contributionId}`,
								privileges: [
									{
										name: 'capability:replace',
										reason: 'Exercises a forbidden Core planner override.',
									},
								],
								version: '1.0.0',
							}),
						],
						schemas: [],
					}),
			).toThrow(/operation transport planning/u)
		}
	})
})
