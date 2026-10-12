import {
	defineCapability,
	provideCapability,
	requireCapability,
} from '../../plugins/capabilities.js'
import {
	defineOperation,
	defineOperationValue,
} from '../../plugins/plugin-operations.js'
import { plugin as createPlugin } from '../../plugins/plugin.js'
import {
	contributeDeclarations,
	withPluginPrivileges,
} from '../../plugins/plugin-contributions.js'
import { contributeOperationBinding } from '../../plugins/plugin-command-contributions.js'
import { type ApplicationCallbackExecutor } from '../../plugins/callback-execution.js'
import { type PluginIdentity } from '../../plugins/manifest.js'
import {
	createApplication,
	FrameworkApplication,
} from '../../application/framework-application.js'
import { immutableRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import { CapabilityInventory } from '../../plugins/capability-inventory.js'
import { normalizePlugins } from '../../plugins/normalization.js'
import {
	defineOperationTransport,
	operationTransportBinding,
	operationWireCodec,
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
const ownerPlugin = createPlugin({
	core: '^0.0.0',
	id: 'fixture.operation-planning.owner',
	permissions: {
		'operation:declare': 'Declares the planning fixture.',
		'transport:expose': 'Binds the planning fixture.',
	},
	version: '1.0.0',
	contributions: [
		contributeOperationBinding(binding),
		contributeDeclarations({
			operations: ({ operations }) => {
				operations.declare(operation)
				return undefined
			},
		}),
	],
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
	createPlugin({
		core: '^0.0.0',
		id: 'fixture.operation-planning.consumer',
		permissions: { 'transport:expose': 'Compiles the fixture transport.' },
		version: '1.0.0',
		contributions: [
			withPluginPrivileges(
				provideCapability(harnessCapability, {
					contributionId: 'harness',
					create: ({ callbacks, capabilities, owner }) => {
						harness.callbacks = callbacks
						harness.owner = owner
						harness.planner = capabilities.get(planningRequirement)
						return { value: immutableRecord({ ready: true as const }) }
					},
				}),
				['transport:expose'],
			),
			planningRequirement,
		],
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
			logger: false,
			plugins: [ownerPlugin, consumerPlugin(harness)],
			schemas: [],
		})
		const plan = runPlanning(harness, (planner) =>
			planner.plan({ operations: [operation], transport: protocol }),
		)

		expect(plan).toStrictEqual({
			operations: [
				{
					bound: true,
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
		expect(
			runPlanning(harness, (planner) =>
				planner.plan({ operations: [operation], transport: protocol }),
			).operations[0],
		).toBe(plan.operations[0])
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
			logger: false,
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
		] as const) {
			expect(
				() =>
					new FrameworkApplication({
						plugins: [
							createPlugin({
								core: '^0.0.0',
								id: `fixture.${declaration.contributionId}`,
								version: '1.0.0',
								contributions: [declaration],
							}),
						],
						schemas: [],
					}),
			).toThrow(/operation transport planning/u)
		}
	})
})
