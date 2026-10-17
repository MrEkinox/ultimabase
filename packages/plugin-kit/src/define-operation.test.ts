import type { StandardSchemaV1 } from '@standard-schema/spec'
import {
	applicationOperationTransportPlanningCapability,
	applicationRequestExecutionCapability,
	defineOperationTransport,
	FrameworkError,
	UltimaBase,
	type ApplicationOperationTransportPlanner,
	type ApplicationRequestExecutor,
} from '@ultimabase/core'
import {
	anonymous,
	defineCapability,
	plugin,
	provideCapability,
	requireCapability,
	withPluginPrivileges,
	type ApplicationCallbackExecutor,
	type PluginDefinition,
	type PluginIdentity,
} from '@ultimabase/core/plugin'
import { describe, expect, it, onTestFinished } from 'vitest'
import { z } from 'zod'

import {
	ScriptedTestDatabase,
	testDatabasePlugin,
} from '../../../tooling/vitest/test-database.js'
import { defineOperation } from './define-operation.js'

const noop = (): null => null
const anyString: unknown = expect.any(String)
const callUntyped = (...parameters: unknown[]): unknown =>
	Reflect.apply(defineOperation, undefined, parameters)

const createInvoice = defineOperation({
	name: 'createInvoice',
	input: z.object({
		amount: z.number().positive(),
		currency: z.string().default('EUR'),
	}),
	output: z.object({ invoiceId: z.string(), issuedAt: z.date() }),
	handler: ({ context, input }) => ({
		invoiceId: `${context.requestId}:${String(input.amount)}${input.currency}`,
		issuedAt: new Date('2026-10-18T00:00:00.000Z'),
	}),
})

// A validator without a JSON Schema converter, failing with object segments.
const rejectItems: StandardSchemaV1<unknown, unknown> = {
	'~standard': {
		vendor: 'fixture',
		version: 1,
		validate: () => ({
			issues: [
				{ message: 'must not be empty', path: [{ key: 'items' }, 0] },
				{ message: 'is required' },
			],
		}),
	},
}
const acceptAnything: StandardSchemaV1<unknown, unknown> = {
	'~standard': {
		vendor: 'fixture',
		version: 1,
		validate: (value) => ({ value }),
	},
}

// A transport in miniature: it plans and executes the public operations
// through Core's capabilities, as REST and GraphQL do.
const protocol = defineOperationTransport({
	name: 'fixture.plugin-kit.transport',
	version: '1.0.0',
})
const planning = requireCapability(
	applicationOperationTransportPlanningCapability,
	'^1.0.0',
)
const execution = requireCapability(
	applicationRequestExecutionCapability,
	'^1.0.0',
)
const transportReady = defineCapability<Readonly<{ ready: true }>>()({
	capabilityId: 'fixture.plugin-kit.transport-ready',
	cardinality: 'single',
	compose: ([provider]) => provider,
	lifetime: 'application',
	version: '1.0.0',
})

interface TransportHarness {
	callbacks?: ApplicationCallbackExecutor
	executor?: ApplicationRequestExecutor
	owner?: PluginIdentity
	planner?: ApplicationOperationTransportPlanner
}

const transportPlugin = (harness: TransportHarness) =>
	plugin({
		core: '^0.0.0',
		id: 'fixture.plugin-kit.transport',
		version: '1.0.0',
		contributions: [
			withPluginPrivileges(
				provideCapability(transportReady, {
					contributionId: 'transport',
					create: ({ callbacks, capabilities, owner }) => {
						harness.callbacks = callbacks
						harness.owner = owner
						harness.planner = capabilities.get(planning)
						harness.executor = capabilities.get(execution)
						return { value: Object.freeze({ ready: true as const }) }
					},
				}),
				['transport:expose'],
			),
			planning,
			execution,
		],
	})

const start = async (operation: PluginDefinition) => {
	const harness: TransportHarness = {}
	const ultimabase = new (UltimaBase.use(
		testDatabasePlugin(new ScriptedTestDatabase(), { id: 'fixture.database' }),
		operation,
		transportPlugin(harness),
	))({ logger: false, schemas: [] })
	onTestFinished(() => ultimabase.dispose())
	await ultimabase.start()
	const { callbacks, executor, owner, planner } = harness
	if (!callbacks || !executor || !owner || !planner) {
		throw new TypeError('The transport harness did not start')
	}
	const run = <TResult>(callback: () => TResult): TResult =>
		callbacks.runPlugin(owner, callback)
	const plan = run(() => planner.plan({ transport: protocol }))
	const exposure = run(() =>
		executor.exposeOperations({
			operations: plan.operations.map(({ name }) => name),
			transport: protocol,
		}),
	)
	const execute = (name: string, input: unknown) =>
		exposure.execute({
			context: anonymous(ultimabase, { requestId: 'r1', source: 'fixture' })
				.context,
			input,
			operation: name,
			version: '1.0.0',
		})
	return { execute, plan }
}

describe('defineOperation (ADR-0324)', () => {
	it('publishes a namespaced public operation described by its validators', async () => {
		expect(createInvoice.manifest.identity).toStrictEqual({
			instanceId: 'createInvoice',
			pluginId: 'application.operations',
		})
		const { plan } = await start(createInvoice)
		expect(plan.operations).toHaveLength(1)
		expect(plan.operations[0]).toMatchObject({
			name: 'application.create-invoice',
			public: {
				input: {
					properties: { amount: { type: 'number' } },
					type: 'object',
				},
				name: 'createInvoice',
			},
			version: '1.0.0',
		})
		expect(plan.operations[0]?.public?.input).not.toHaveProperty('$schema')
		// A Date has no JSON Schema: the output stays undocumented.
		expect(plan.operations[0]?.public).not.toHaveProperty('output')
	})

	it('runs the handler with the validated input and returns JSON', async () => {
		const { execute } = await start(createInvoice)
		const result = await execute('application.create-invoice', { amount: 12 })
		// Defaults applied, the request context passed, the Date sent as JSON.
		expect(result).toStrictEqual({
			invoiceId: 'r1:12EUR',
			issuedAt: '2026-10-18T00:00:00.000Z',
		})
		expect(Object.isFrozen(result)).toBe(true)
	})

	it('reports invalid input as a VALIDATION_ERROR with issue paths', async () => {
		const { execute } = await start(createInvoice)
		const failure: unknown = await execute('application.create-invoice', {
			amount: -1,
		}).catch((error: unknown) => error)
		expect(failure).toBeInstanceOf(FrameworkError)
		expect(failure).toMatchObject({
			code: 'VALIDATION_ERROR',
			message: 'Operation createInvoice input is invalid.',
			publicMessage: 'The operation input is invalid.',
			publicDetails: {
				issues: [
					{
						code: 'operation.input',
						message: anyString,
						path: ['input', 'amount'],
					},
				],
			},
		})
	})

	it('reads object path segments and issues without a path', async () => {
		const strict = defineOperation({
			name: 'listItems',
			input: rejectItems,
			output: acceptAnything,
			handler: () => null,
		})
		const { execute, plan } = await start(strict)
		// Validators that cannot describe themselves stay undocumented.
		expect(plan.operations[0]?.public).toStrictEqual({ name: 'listItems' })
		await expect(
			execute('application.list-items', { items: [] }),
		).rejects.toMatchObject({
			publicDetails: {
				issues: [
					{ message: 'must not be empty', path: ['input', 'items', 0] },
					{ message: 'is required', path: ['input'] },
				],
			},
		})
	})

	it('refuses a result its output validator rejects, as a server error', async () => {
		const total = defineOperation({
			name: 'readTotal',
			input: z.object({ total: z.number() }),
			output: z.object({ total: z.number().max(10) }),
			handler: ({ input }) => ({ total: input.total }),
		})
		const { execute, plan } = await start(total)
		expect(plan.operations[0]?.public?.output).toMatchObject({
			properties: { total: { maximum: 10, type: 'number' } },
		})
		expect(await execute('application.read-total', { total: 3 })).toStrictEqual(
			{ total: 3 },
		)
		const failure: unknown = await execute('application.read-total', {
			total: 11,
		}).catch((error: unknown) => error)
		// Never sent to the client: the transport reports a handler failure.
		expect(failure).toMatchObject({
			message: 'Operation application.read-total handler failed.',
		})
		expect(String(Reflect.get(Object(failure), 'cause'))).toContain(
			'Operation readTotal result does not match its output validator: ',
		)
	})

	it('accepts callable validators and reads a missing input as null', async () => {
		const received: unknown[] = []
		// ArkType validators are functions carrying `~standard`.
		const callable = Object.assign(() => undefined, {
			'~standard': {
				vendor: 'fixture',
				version: 1 as const,
				validate: (value: unknown) => {
					received.push(value)
					return { value }
				},
			},
		})
		const ping = defineOperation({
			name: 'ping',
			input: callable,
			output: acceptAnything,
			handler: ({ input }) => ({ pong: input }),
		})
		const { execute } = await start(ping)
		expect(await execute('application.ping', undefined)).toStrictEqual({
			pong: null,
		})
		expect(received).toStrictEqual([null])
	})

	it('refuses wire input that is not JSON', async () => {
		const { execute } = await start(createInvoice)
		const failure: unknown = await execute(
			'application.create-invoice',
			10n,
		).catch((error: unknown) => error)
		expect(String(failure)).toContain('must be JSON')
	})
})

describe('defineOperation validation', () => {
	it.for([
		['plain options', null, 'defineOperation options must be a plain object'],
		[
			'known options',
			{
				name: 'ping',
				input: acceptAnything,
				output: acceptAnything,
				handler: noop,
				path: '/ping',
			},
			'Unknown defineOperation option: path',
		],
		[
			'a camelCase name',
			{
				name: 'create-invoice',
				input: acceptAnything,
				output: acceptAnything,
				handler: noop,
			},
			'defineOperation name must be a camelCase identifier, such as createInvoice',
		],
		[
			'a string name',
			{
				name: 7,
				input: acceptAnything,
				output: acceptAnything,
				handler: noop,
			},
			'defineOperation name must be a camelCase identifier, such as createInvoice',
		],
		[
			'a Standard Schema input',
			{
				name: 'ping',
				input: { parse: () => null },
				output: acceptAnything,
				handler: noop,
			},
			'defineOperation ping input and output must be Standard Schema validators',
		],
		[
			'a Standard Schema output',
			{
				name: 'ping',
				input: acceptAnything,
				output: null,
				handler: noop,
			},
			'defineOperation ping input and output must be Standard Schema validators',
		],
		[
			'a handler function',
			{
				name: 'ping',
				input: acceptAnything,
				output: acceptAnything,
				handler: 'pong',
			},
			'defineOperation ping handler must be a function',
		],
	] as const)('requires %s', ([, options, message]) => {
		expect(() => {
			callUntyped(options)
		}).toThrow(new TypeError(message))
	})
})
