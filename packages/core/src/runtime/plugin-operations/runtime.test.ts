import { applicationFixture } from '../../../tests/application-fixture.js'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import { describe, expect, it, vi } from 'vitest'

import { provideTestDatabaseAdapter } from '../../../tests/runtime/fixtures/database-adapter-capability.js'
import {
	RecordingDatabaseAdapter,
	type QueuedAdapterResult,
} from '../../../tests/runtime/fixtures/recording-database-adapter.js'
import { FrameworkApplication } from '../../application/framework-application.js'
import { readApplicationKernelState } from '../../application/application-kernel-state.js'
import { executeRequestPluginOperation } from './request-execution.js'
import { PluginError } from '../../errors/plugin-error.js'
import { plugin as createPlugin } from '../../plugins/plugin.js'
import { contributeDeclarations } from '../../plugins/plugin-contributions.js'
import {
	contributeOperation,
	contributeOperationBinding,
} from '../../plugins/plugin-command-contributions.js'
import {
	defineOperation,
	defineOperationValue,
} from '../../plugins/plugin-operations.js'

import { UltimaBase } from '../application/ultima-base.js'
import { readUltimaBaseKernel } from '../application/ultima-base.js'
import { runWithRequestEngine } from '../context/active-framework-context.js'
import { RequestContext } from '../context/request-context.js'
import type { RequestEngine } from '../engine/framework-engine.js'
import {
	elevateMasterRequest,
	MasterAuthority,
} from '../master/master-authority.js'
import {
	defineOperationTransport,
	operationTransportBinding,
	operationWireCodec,
} from './capabilities.js'

const messageValue = defineOperationValue((value, path) => {
	if (!isPlainRecord(value) || typeof value.message !== 'string') {
		throw new TypeError(`${path}.message must be a string`)
	}
	return immutableRecord({ message: value.message })
})
const acceptedValue = defineOperationValue((value, path) => {
	if (!isPlainRecord(value) || typeof value.accepted !== 'boolean') {
		throw new TypeError(`${path}.accepted must be a boolean`)
	}
	return immutableRecord({ accepted: value.accepted })
})

const applicationOperation = defineOperation({
	errors: ['fixture.operations.rejected'] as const,
	input: messageValue,
	name: 'fixture.operations.inspect',
	result: acceptedValue,
	target: 'application',
	transaction: 'required',
	version: '1.0.0',
})
const forbiddenOperation = defineOperation({
	input: messageValue,
	name: 'fixture.operations.outside-transaction',
	result: acceptedValue,
	target: 'application',
	transaction: 'forbidden',
	version: '1.0.0',
})
const Post = UltimaBase.Schema.define({
	className: 'PluginOperationRuntimePost',
	fields: (field) => ({ title: field.string() }),
})
const fakeProtocol = defineOperationTransport({
	name: 'fixture.transport.fake',
	version: '1.0.0',
})
const fakeCodec = operationWireCodec({
	decode: (value: Readonly<{ readonly text: string }>) =>
		immutableRecord({ message: value.text }),
	encode: (value) => immutableRecord({ ok: value.accepted }),
	operation: applicationOperation,
	transport: fakeProtocol,
})
const fakeBinding = operationTransportBinding({
	codec: fakeCodec,
	operation: applicationOperation,
})
interface FixtureOptions {
	readonly adapterResults?: readonly QueuedAdapterResult[]
	readonly applicationHandler?: (
		message: string,
		engine: RequestEngine,
	) => unknown
	readonly masterAuthority?: MasterAuthority
}

const createFixture = async (options: FixtureOptions = {}) => {
	const trace: string[] = []
	const adapter = new RecordingDatabaseAdapter(
		options.adapterResults ?? [],
		trace,
	)
	const plugin = createPlugin({
		core: '^0.0.0',
		id: 'fixture.plugin-operations',
		permissions: {
			'operation:declare': 'Declares operation test tokens.',
			'transport:expose': 'Binds the fake public protocol.',
		},
		version: '1.0.0',
		contributions: [
			contributeOperation({
				execute: ({ context, engine, input, target }) => {
					trace.push(`application:${context.requestId}:${target.kind}`)
					return (options.applicationHandler?.(input.message, engine) ??
						immutableRecord({ accepted: true })) as Readonly<{
						readonly accepted: boolean
					}>
				},
				operation: applicationOperation,
			}),
			contributeOperationBinding(fakeBinding),
			contributeOperation({
				execute: () => immutableRecord({ accepted: true }),
				operation: forbiddenOperation,
			}),
		],
	})
	const database = createPlugin({
		core: '^0.0.0',
		id: 'fixture.plugin-operation-database',
		version: '1.0.0',
		contributions: [provideTestDatabaseAdapter(adapter)],
	})
	const ultimabase = applicationFixture(
		new (UltimaBase.use(database, plugin))({
			...(options.masterAuthority === undefined
				? {}
				: { masterAuthority: options.masterAuthority }),
			pluginPrivileges: { logger: false },
			schemas: [Post],
		}),
	)
	await ultimabase.start()
	return { adapter, trace, ultimabase }
}

describe('plugin operation Runtime', () => {
	it('shares direct and transport boundaries without consulting legacy execution views', async () => {
		const { ultimabase, trace } = await createFixture()
		const handle = ultimabase.operation(applicationOperation)
		// Compatibility views remain public metadata, never a second execution source.
		const legacy = vi
			.spyOn(FrameworkApplication.prototype, 'getOperation')
			.mockImplementation(() => {
				throw new Error('Legacy declaration lookup reached Runtime')
			})
		try {
			const exposure = ultimabase.exposeOperations({
				transport: fakeProtocol,
				operations: [applicationOperation.name],
				acknowledgeUnverifiedProtection: true,
			})
			const repeated = ultimabase.exposeOperations({
				transport: fakeProtocol,
				operations: [applicationOperation],
				acknowledgeUnverifiedProtection: true,
			})
			expect(repeated.operations[0]).toBe(exposure.operations[0])

			const context = RequestContext.anonymous({
				requestId: 'canonical-wire',
				source: 'fixture',
			})
			await expect(
				handle.execute({ message: 'direct' }),
			).resolves.toStrictEqual({ accepted: true })
			await expect(
				exposure.execute({
					context,
					input: { text: 'wire' },
					operation: applicationOperation.name,
					version: '1.0.0',
				}),
			).resolves.toStrictEqual({ ok: true })
			for (const execute of [
				() => handle.execute({ message: 42 } as never),
				() =>
					exposure.execute({
						context,
						input: { text: 42 },
						operation: applicationOperation.name,
						version: '1.0.0',
					}),
			])
				await expect(execute()).rejects.toThrow(
					`${applicationOperation.name}.input.message must be a string`,
				)
			expect(trace.filter((entry) => entry === 'adapter:begin')).toHaveLength(2)
			expect(legacy).not.toHaveBeenCalled()
		} finally {
			legacy.mockRestore()
			await ultimabase.dispose()
		}
	})

	it('rejects copied commands and forged envelope facts before entering a transaction', async () => {
		const { ultimabase, trace } = await createFixture()
		const graph = readApplicationKernelState(
			readUltimaBaseKernel(ultimabase),
		).commands
		const command = graph.fromSource(applicationOperation)
		if (command?.kind !== 'operation')
			throw new Error('Missing operation fixture')
		const envelope = ultimabase
			.operation(applicationOperation)
			.prepare({ message: 'valid' })
		const engine = ultimabase.anonymous({
			requestId: 'canonical-command',
			source: 'fixture',
		})
		await expect(
			executeRequestPluginOperation(engine, { ...command }, envelope),
		).rejects.toMatchObject({
			internalDetails: { kind: 'operation-envelope-mismatch' },
		})
		for (const invalid of [
			{ ...envelope, name: 'fixture.missing' },
			{ ...envelope, version: '2.0.0' },
			{ ...envelope, transaction: 'optional' as const },
		])
			await expect(
				executeRequestPluginOperation(engine, command, invalid),
			).rejects.toMatchObject({
				internalDetails: { kind: 'operation-envelope-mismatch' },
			})
		expect(trace).toStrictEqual([])
		await expect(
			executeRequestPluginOperation(engine, command, envelope),
		).resolves.toStrictEqual({ accepted: true })
		await ultimabase.dispose()
	})

	it('runs resource-backed handlers inside the transaction and disposes them once', async () => {
		const adapter = new RecordingDatabaseAdapter([], [])
		const resourceOperation = defineOperation({
			input: messageValue,
			name: 'fixture.operations.resource-transaction',
			result: acceptedValue,
			target: 'application',
			transaction: 'required',
			version: '1.0.0',
		})
		const database = createPlugin({
			core: '^0.0.0',
			id: 'fixture.operation-resource-database',
			version: '1.0.0',
			contributions: [provideTestDatabaseAdapter(adapter)],
		})
		let resourceDisposals = 0
		const operation = createPlugin({
			core: '^0.0.0',
			id: 'fixture.operation-resource-consumer',
			permissions: {
				'operation:declare': 'Declares the resource operation.',
			},
			version: '1.0.0',
			contributions: [
				contributeOperation({
					create: () => ({
						dispose: () => {
							resourceDisposals += 1
						},
						execute: () => immutableRecord({ accepted: true }),
					}),
					operation: resourceOperation,
				}),
			],
		})
		const ultimabase = applicationFixture(
			new (UltimaBase.use(database, operation))({
				pluginPrivileges: { logger: false },
				schemas: [],
			}),
		)

		await ultimabase.start()
		await expect(
			ultimabase.operation(resourceOperation).execute({ message: 'lease' }),
		).resolves.toStrictEqual({ accepted: true })
		expect(adapter.transactions).toHaveLength(1)
		await ultimabase.dispose()
		expect(resourceDisposals).toBe(1)
	})

	it('executes application targets through handles', async () => {
		const fixture = await createFixture()
		await expect(
			fixture.ultimabase
				.operation(applicationOperation)
				.execute({ message: 1 } as never),
		).rejects.toThrow(
			`${applicationOperation.name}.input.message must be a string`,
		)
		await expect(
			fixture.ultimabase.operation(applicationOperation).execute({
				message: 'inspect',
			}),
		).resolves.toStrictEqual({ accepted: true })
		expect(fixture.trace).toStrictEqual([
			'adapter:begin',
			expect.stringMatching(/^application:.+:application$/u),
			'adapter:commit',
		])
		await fixture.ultimabase.dispose()
	})

	it('rolls back handler failures and rejects cancellation and invalid results', async () => {
		const failure = new Error('handler secret')
		const fixture = await createFixture({
			applicationHandler: (message) => {
				if (message === 'invalid') return immutableRecord({ accepted: 'wrong' })
				if (message === 'undeclared') {
					throw new PluginError('fixture.operations.unknown', 'Not declared')
				}
				throw failure
			},
		})
		await expect(
			fixture.ultimabase
				.operation(applicationOperation)
				.execute({ message: 'fail' }),
		).rejects.toMatchObject({
			code: 'PLUGIN_OPERATION_INVALID',
			cause: failure,
			internalDetails: {
				contributionId: `operation:${applicationOperation.name}`,
				kind: 'operation-handler-failed',
			},
		})
		await expect(
			fixture.ultimabase
				.operation(applicationOperation)
				.execute({ message: 'invalid' }),
		).rejects.toMatchObject({
			code: 'PLUGIN_OPERATION_INVALID',
			internalDetails: { kind: 'operation-handler-failed' },
		})
		await expect(
			fixture.ultimabase
				.operation(applicationOperation)
				.execute({ message: 'undeclared' }),
		).rejects.toMatchObject({
			code: 'PLUGIN_OPERATION_INVALID',
			internalDetails: { kind: 'operation-plugin-error-undeclared' },
		})
		expect(
			fixture.trace.filter((entry) => entry === 'adapter:rollback'),
		).toHaveLength(3)

		const controller = new AbortController()
		controller.abort('cancelled')
		const cancelled = fixture.ultimabase.withContext(
			RequestContext.anonymous({
				requestId: 'cancelled-operation',
				signal: controller.signal,
				source: 'fixture',
			}),
		)
		await expect(
			runWithRequestEngine(cancelled, () =>
				fixture.ultimabase
					.operation(applicationOperation)
					.execute({ message: 'cancelled' }),
			),
		).rejects.toMatchObject({ code: 'OPERATION_CANCELLED' })
		await fixture.ultimabase.dispose()
	})

	it('rejects forbidden operations inside an existing transaction', async () => {
		const fixture = await createFixture()
		await expect(
			fixture.ultimabase
				.operation(forbiddenOperation)
				.execute({ message: 'outside' }),
		).resolves.toStrictEqual({ accepted: true })
		const request = fixture.ultimabase.anonymous({
			requestId: 'forbidden-transaction',
			source: 'fixture',
		})
		await expect(
			request.transaction((transaction) =>
				runWithRequestEngine(transaction, () =>
					fixture.ultimabase
						.operation(forbiddenOperation)
						.execute({ message: 'inside' }),
				),
			),
		).rejects.toMatchObject({ code: 'TRANSACTION_ERROR' })
		expect(fixture.trace).toStrictEqual(['adapter:begin', 'adapter:rollback'])
		await fixture.ultimabase.dispose()
	})

	it('rejects a foreign Master context substituted by a plugin operation', async () => {
		const state: { foreignContext?: RequestContext } = {}
		const fixture = await createFixture({
			applicationHandler: () => {
				if (state.foreignContext === undefined)
					throw new TypeError('Missing foreign context')
				fixture.ultimabase.withContext(state.foreignContext)
				return immutableRecord({ accepted: true })
			},
		})
		const foreignAuthority = new MasterAuthority({
			keys: [{ id: 'foreign', value: 'foreign-secret' }],
			onUse: () => undefined,
		})
		const source = RequestContext.anonymous({
			requestId: 'foreign-plugin-operation-context',
			source: 'internal',
		})
		fixture.ultimabase.withContext(source)
		state.foreignContext = await elevateMasterRequest(
			foreignAuthority,
			foreignAuthority.authorize('foreign-secret'),
			source,
			'foreign plugin operation context',
			readUltimaBaseKernel(fixture.ultimabase),
		)
		await expect(
			fixture.ultimabase
				.operation(applicationOperation)
				.execute({ message: 'foreign context' }),
		).rejects.toMatchObject({
			code: 'PERMISSION_DENIED',
			internalDetails: { reason: 'master-context-provenance-mismatch' },
		})
		await fixture.ultimabase.dispose()
	})

	it('preserves declared plugin errors and transport compatibility safely', async () => {
		const onUse = vi.fn()
		const masterAuthority = new MasterAuthority({
			keys: [{ id: 'fixture', value: 'transport-master-key' }],
			onUse,
		})
		const fixture = await createFixture({
			applicationHandler: () => {
				throw new PluginError(
					'fixture.operations.rejected',
					'internal secret',
					{
						internalDetails: { secret: 'hidden' },
						publicMessage: 'Request rejected.',
					},
				)
			},
			masterAuthority,
		})
		const exposure = fixture.ultimabase.exposeOperations({
			acknowledgeUnverifiedProtection: true,
			operations: [applicationOperation],
			transport: fakeProtocol,
		})
		expect(exposure.operations).toStrictEqual([
			{
				errors: ['fixture.operations.rejected'],
				metadata: null,
				name: applicationOperation.name,
				owner: {
					pluginId: 'fixture.plugin-operations',
					version: '1.0.0',
				},
				version: applicationOperation.version,
			},
		])
		expect(Object.isFrozen(exposure.operations)).toBe(true)
		expect(Object.isFrozen(exposure.operations[0])).toBe(true)
		const context = RequestContext.anonymous({
			requestId: 'fake-request',
			source: 'fixture',
		})
		await expect(
			exposure.execute({
				context,
				input: { text: 'hello' },
				operation: applicationOperation.name,
				version: '0.9.0',
			}),
		).rejects.toMatchObject({ code: 'PLUGIN_PROTOCOL_INCOMPATIBLE' })
		const anonymous = fixture.ultimabase.anonymous({
			requestId: 'master-source',
			source: 'fixture',
		})
		const master = await anonymous.useMasterKey(
			fixture.ultimabase.authorizeMasterKey('transport-master-key'),
			'Test public transport authority rejection',
		)
		await expect(
			exposure.execute({
				context: master.context,
				input: { text: 'hello' },
				operation: applicationOperation.name,
				version: '1.0.0',
			}),
		).rejects.toMatchObject({ code: 'fixture.operations.rejected' })
		await expect(
			exposure.execute({
				context,
				input: {
					context: master.context,
					grant: { keyId: 'fixture' },
					text: 'hello',
					useMasterKey: true,
				},
				operation: applicationOperation.name,
				version: '1.0.0',
			}),
		).rejects.toMatchObject({
			code: 'fixture.operations.rejected',
			internalDetails: { secret: 'hidden' },
		})
		expect(onUse).toHaveBeenCalledOnce()
		await fixture.ultimabase.dispose()
	})

	it('isolates applications and closes stale handles', async () => {
		const first = await createFixture()
		const stale = first.ultimabase.operation(applicationOperation)
		const incompatibleToken = defineOperation({
			errors: applicationOperation.errors,
			input: applicationOperation.input,
			name: applicationOperation.name,
			result: applicationOperation.result,
			target: applicationOperation.target,
			transaction: applicationOperation.transaction,
			version: '2.0.0',
		})
		expect(() => first.ultimabase.operation(incompatibleToken)).toThrow(
			'Operation token is not installed in this application',
		)
		await expect(stale.execute({ message: 'first' })).resolves.toStrictEqual({
			accepted: true,
		})
		await first.ultimabase.dispose()
		const second = await createFixture()
		expect(second.trace).toStrictEqual([])
		await expect(stale.execute({ message: 'stale' })).rejects.toThrow(
			'Application handle cannot be used after disposal',
		)
		await second.ultimabase.dispose()
	})

	it('derives transport exposure privilege on the exact binding owner', () => {
		expect(
			createPlugin({
				core: '^0.0.0',
				id: 'fixture.unprivileged-operation-transport',
				permissions: { 'operation:declare': 'Declares the fixture operation.' },
				version: '1.0.0',
				contributions: [
					contributeOperationBinding(fakeBinding),
					contributeDeclarations({
						operations: ({ operations }) => {
							operations.declare(applicationOperation)
							return undefined
						},
					}),
				],
			}).manifest.privileges.find(({ name }) => name === 'transport:expose'),
		).toStrictEqual({
			name: 'transport:expose',
			reason: 'Binds operations to transports.',
		})
	})

	it('derives operation declaration privilege for owned contributions', () => {
		expect(
			createPlugin({
				core: '^0.0.0',
				id: 'fixture.unprivileged-operation-owner',
				version: '1.0.0',
				contributions: [
					contributeOperation({
						execute: () => immutableRecord({ accepted: true }),
						operation: applicationOperation,
					}),
				],
			}).manifest.privileges.find(({ name }) => name === 'operation:declare'),
		).toStrictEqual({
			name: 'operation:declare',
			reason: 'Declares plugin operations.',
		})
	})
})
