import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import { describe, expect, it, onTestFinished } from 'vitest'

import { provideTestDatabaseAdapter } from '../../../tests/runtime/fixtures/database-adapter-capability.js'
import { RecordingDatabaseAdapter } from '../../../tests/runtime/fixtures/recording-database-adapter.js'
import {
	defineCapability,
	provideCapability,
	requireCapability,
} from '../../plugins/capabilities.js'
import { type ApplicationCallbackExecutor } from '../../plugins/callback-execution.js'
import { type PluginIdentity } from '../../plugins/manifest.js'
import { contributeOperation } from '../../plugins/plugin-command-contributions.js'
import { withPluginPrivileges } from '../../plugins/plugin-contributions.js'
import {
	defineOperation,
	defineOperationValue,
} from '../../plugins/plugin-operations.js'
import { plugin as createPlugin } from '../../plugins/plugin.js'
import { anonymous } from '../../plugin.js'
import { provideRuntimeConstraint } from '../capabilities.js'
import { protectedPolicy } from '../enforcement/protected-policy.js'
import {
	defineOperationTransport,
	operationTransportBinding,
	operationWireCodec,
} from '../plugin-operations/capabilities.js'
import {
	applicationOperationTransportPlanningCapability,
	type ApplicationOperationTransportPlanner,
} from './application-operation-transport-planning.js'
import {
	applicationRequestExecutionCapability,
	type ApplicationRequestExecutor,
} from './application-request-execution.js'
import { UltimaBase } from './ultima-base.js'

const message = defineOperationValue((value, path) => {
	if (!isPlainRecord(value) || typeof value.message !== 'string') {
		throw new TypeError(`${path}.message must be a string`)
	}
	return immutableRecord({ message: value.message })
})
const operation = (name: string) =>
	defineOperation({
		input: message,
		name: `fixture.public-operations.${name}`,
		result: message,
		target: 'application',
		transaction: 'optional',
		version: '1.0.0',
	})
const unbound = operation('unbound')
const bound = operation('bound')
const hidden = operation('hidden')
const protocol = defineOperationTransport({
	name: 'fixture.public-operations.transport',
	version: '1.0.0',
})
const binding = operationTransportBinding({
	codec: operationWireCodec({
		decode: (value: string) => immutableRecord({ message: value }),
		encode: (value) => value.message,
		operation: bound,
		transport: protocol,
	}),
	metadata: { field: 'bound' },
	operation: bound,
})

const ownerPlugin = (publicNames: readonly [string, string]) =>
	createPlugin({
		core: '^0.0.0',
		id: 'fixture.public-operations.owner',
		version: '1.0.0',
		contributions: [
			contributeOperation({
				execute: ({ input }) => input,
				operation: unbound,
				public: {
					input: { type: 'object', required: ['message'] },
					name: publicNames[0],
				},
			}),
			contributeOperation({
				bindings: [binding],
				execute: ({ input }) => input,
				operation: bound,
				public: { name: publicNames[1] },
			}),
			// Not declared public: no transport ever lists it.
			contributeOperation({
				execute: ({ input }) => input,
				operation: hidden,
			}),
		],
	})

const policyPlugin = createPlugin({
	core: '^0.0.0',
	id: 'fixture.public-operations.policy',
	version: '1.0.0',
	contributions: [
		provideRuntimeConstraint({
			contributionId: 'policy',
			create: () => ({ value: protectedPolicy({ evaluate: () => undefined }) }),
		}),
	],
})

interface Harness {
	callbacks?: ApplicationCallbackExecutor
	executor?: ApplicationRequestExecutor
	owner?: PluginIdentity
	planner?: ApplicationOperationTransportPlanner
}

const planningRequirement = requireCapability(
	applicationOperationTransportPlanningCapability,
	'^1.0.0',
)
const executionRequirement = requireCapability(
	applicationRequestExecutionCapability,
	'^1.0.0',
)
const harnessCapability = defineCapability<
	Readonly<{ readonly ready: true }>
>()({
	capabilityId: 'fixture.public-operations.harness',
	cardinality: 'single',
	compose: ([provider]) => provider,
	lifetime: 'application',
	version: '1.0.0',
})

const consumerPlugin = (harness: Harness) =>
	createPlugin({
		core: '^0.0.0',
		id: 'fixture.public-operations.consumer',
		version: '1.0.0',
		contributions: [
			withPluginPrivileges(
				provideCapability(harnessCapability, {
					contributionId: 'harness',
					create: ({ callbacks, capabilities, owner }) => {
						harness.callbacks = callbacks
						harness.owner = owner
						harness.planner = capabilities.get(planningRequirement)
						harness.executor = capabilities.get(executionRequirement)
						return { value: immutableRecord({ ready: true as const }) }
					},
				}),
				['transport:expose'],
			),
			planningRequirement,
			executionRequirement,
		],
	})

const databasePlugin = createPlugin({
	core: '^0.0.0',
	id: 'fixture.public-operations.database',
	version: '1.0.0',
	contributions: [
		provideTestDatabaseAdapter(new RecordingDatabaseAdapter([], [])),
	],
})

const start = async (
	publicNames: readonly [string, string] = ['echo', 'shout'],
	policy = false,
) => {
	const harness: Harness = {}
	const Base = UltimaBase.use(
		databasePlugin,
		ownerPlugin(publicNames),
		consumerPlugin(harness),
	)
	const Application = policy ? Base.use(policyPlugin) : Base
	const ultimabase = new Application({ logger: false, schemas: [] })
	onTestFinished(() => ultimabase.dispose())
	await ultimabase.start()
	const { callbacks, executor, owner, planner } = harness
	if (
		callbacks === undefined ||
		executor === undefined ||
		owner === undefined ||
		planner === undefined
	) {
		throw new TypeError('Public operation harness is unavailable')
	}
	const run = <TResult>(callback: () => TResult): TResult =>
		callbacks.runPlugin(owner, callback)
	return { executor, planner, run, ultimabase }
}

// ADR-0324: owners declare public operations; every transport lists them.
describe('public operations', () => {
	it('plans every public operation, bound or not, and never a private one', async () => {
		const { planner, run } = await start()
		const plan = run(() => planner.plan({ transport: protocol }))

		expect(plan.operations).toStrictEqual([
			{
				bound: false,
				errors: [],
				metadata: null,
				name: unbound.name,
				owner: {
					pluginId: 'fixture.public-operations.owner',
					version: '1.0.0',
				},
				public: {
					input: { type: 'object', required: ['message'] },
					name: 'echo',
				},
				version: '1.0.0',
			},
			{
				bound: true,
				errors: [],
				metadata: { field: 'bound' },
				name: bound.name,
				owner: {
					pluginId: 'fixture.public-operations.owner',
					version: '1.0.0',
				},
				public: { name: 'shout' },
				version: '1.0.0',
			},
		])
		expect(() =>
			run(() => planner.plan({ operations: [hidden], transport: protocol })),
		).toThrow(`Operation ${hidden.name} requires one exact binding`)
	})

	it('executes an unbound public operation through its own input contract', async () => {
		const { executor, run, ultimabase } = await start()
		const exposure = run(() =>
			executor.exposeOperations({
				acknowledgeUnverifiedProtection: true,
				operations: [unbound, bound],
				transport: protocol,
			}),
		)
		const { context } = anonymous(ultimabase, {
			requestId: 'public-operation',
			source: 'fixture',
		})
		const execute = (name: string, input: unknown) =>
			exposure.execute({
				context,
				input,
				operation: name,
				version: '1.0.0',
			})

		await expect(execute(unbound.name, { message: 'hi' })).resolves.toEqual({
			message: 'hi',
		})
		await expect(execute(bound.name, 'loud')).resolves.toBe('loud')
		await expect(execute(unbound.name, { text: 'hi' })).rejects.toMatchObject(
			{
				code: 'VALIDATION_ERROR',
				publicDetails: {
					issues: [
						{
							code: 'input.invalid',
							message: 'input.message must be a string',
							path: ['input'],
						},
					],
				},
			},
		)
		expect(() =>
			run(() =>
				executor.exposeOperations({
					operations: [hidden],
					transport: protocol,
				}),
			),
		).toThrow(`Operation ${hidden.name} has no binding`)
	})

	it('rejects two operations with one public name', async () => {
		await expect(start(['echo', 'echo'])).rejects.toThrow(
			`Operations ${unbound.name} and ${bound.name} share the public name echo.`,
		)
	})

	it.each([
		[{ name: 'Login' }, 'public.name must be a camelCase identifier'],
		[{ name: 'log-in' }, 'public.name must be a camelCase identifier'],
		[{ name: 'login', path: '/x' }, 'Unknown plugin operation contribution public option: path'],
		[{ name: 'login', input: { at: new Date() } }, 'public.input'],
	])('validates the public declaration %#', (declaration, error) => {
		expect(() =>
			contributeOperation({
				execute: ({ input }) => input,
				operation: unbound,
				public: declaration as never,
			}),
		).toThrow(error)
	})

	it('reports whether a protected policy is installed (ADR-0294)', async () => {
		const open = await start()
		expect(open.run(() => open.executor.hasProtectedPolicy())).toBe(false)
		await open.ultimabase.dispose()
		const guarded = await start(['echo', 'shout'], true)
		expect(guarded.run(() => guarded.executor.hasProtectedPolicy())).toBe(true)
	})
})
