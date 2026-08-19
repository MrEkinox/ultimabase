import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import { materializeSchemaModel } from '../../schema/schema/model-materialization.js'
import { Schema } from '../../schema/schema/definition.js'
import { PluginError } from '../../errors/plugin-error.js'
import { MasterAuthority } from '../master/master-authority.js'
import { definePlugin } from '../../plugins/definition.js'
import { requireCapability } from '../../plugins/capabilities.js'
import {
	defineOperation,
	defineOperationValue,
} from '../../plugins/plugin-operations.js'
import { UltimaBase } from '../application/ultima-base.js'
import { RequestContext } from '../context/request-context.js'
import { runWithRequestEngine } from '../context/active-framework-context.js'
import {
	defineOperationTransport,
	operationHandler,
	operationTransportBinding,
	operationWireCodec,
	provideOperationHandler,
	provideOperationTransportBinding,
} from './capabilities.js'
import { RecordingDatabaseAdapter } from '../../../tests/runtime/fixtures/recording-database-adapter.js'
import { provideTestDatabaseAdapter } from '../../../tests/runtime/fixtures/database-adapter-capability.js'
import {
	defineAdapterRawCapability,
	provideAdapterRawCapability,
} from '../adapters/raw-access.js'

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
const schemaOperation = defineOperation({
	input: messageValue,
	name: 'fixture.operations.publish-schema',
	result: acceptedValue,
	target: 'schema',
	transaction: 'required',
	version: '1.0.0',
})
const modelOperation = defineOperation({
	input: messageValue,
	name: 'fixture.operations.publish-model',
	result: acceptedValue,
	target: 'model',
	transaction: 'required',
	version: '1.0.0',
})
const Post = Schema.define({
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
	readonly applicationHandler?: (message: string) => unknown
	readonly masterAuthority?: MasterAuthority
}

const createFixture = async (options: FixtureOptions = {}) => {
	const trace: string[] = []
	const adapter = new RecordingDatabaseAdapter([], trace)
	const applicationHandler = operationHandler({
		operation: applicationOperation,
		execute: ({ context, input, target }) => {
			trace.push(`application:${context.requestId}:${target.kind}`)
			return (options.applicationHandler?.(input.message) ??
				immutableRecord({ accepted: true })) as Readonly<{
				readonly accepted: boolean
			}>
		},
	})
	const schemaHandler = operationHandler({
		operation: schemaOperation,
		execute: ({ input, target }) => {
			trace.push(
				`schema:${target.kind === 'schema' ? target.schema.className : 'wrong'}:${input.message}`,
			)
			return immutableRecord({ accepted: true })
		},
	})
	const forbiddenHandler = operationHandler({
		operation: forbiddenOperation,
		execute: () => immutableRecord({ accepted: true }),
	})
	const modelHandler = operationHandler({
		operation: modelOperation,
		execute: ({ input, target }) => {
			trace.push(
				`model:${target.kind === 'model' ? target.state : 'wrong'}:${input.message}`,
			)
			return immutableRecord({ accepted: true })
		},
	})
	const plugin = definePlugin({
		capabilities: {
			provides: [
				provideOperationHandler({
					contributionId: 'application-handler',
					create: () => ({ value: applicationHandler }),
				}),
				provideOperationHandler({
					contributionId: 'schema-handler',
					create: () => ({ value: schemaHandler }),
				}),
				provideOperationHandler({
					contributionId: 'forbidden-handler',
					create: () => ({ value: forbiddenHandler }),
				}),
				provideOperationHandler({
					contributionId: 'model-handler',
					create: () => ({ value: modelHandler }),
				}),
				provideOperationTransportBinding({
					contributionId: 'fake-binding',
					create: () => ({ value: fakeBinding }),
				}),
			],
		},
		core: '^0.0.0',
		declare: ({ models, operations }) => {
			operations.declare(applicationOperation)
			operations.declare(forbiddenOperation)
			operations.declare(schemaOperation)
			operations.declare(modelOperation)
			models.extend(Post, {
				contributionId: 'post-commands',
				modelCommands: { publish: modelOperation },
				schemaCommands: { publish: schemaOperation },
			})
		},
		pluginId: 'fixture.plugin-operations',
		privileges: [
			{ name: 'model:extend', reason: 'Binds operation test commands.' },
			{ name: 'operation:declare', reason: 'Declares operation test tokens.' },
			{ name: 'transport:expose', reason: 'Binds the fake public protocol.' },
		] as const,
		version: '1.0.0',
	})
	const database = definePlugin({
		capabilities: { provides: [provideTestDatabaseAdapter(adapter)] },
		core: '^0.0.0',
		pluginId: 'fixture.plugin-operation-database',
		version: '1.0.0',
	})
	const ultimabase = new UltimaBase({
		...(options.masterAuthority === undefined
			? {}
			: { masterAuthority: options.masterAuthority }),
		pluginPrivileges: { logger: false },
		plugins: [database, plugin],
		schemas: [Post],
	})
	await ultimabase.start()
	return { adapter, trace, ultimabase }
}

describe('plugin operation Runtime', () => {
	it('opens raw adapter access only inside the active operation transaction', async () => {
		interface RawFixture {
			kind(): string
		}
		const rawCapability = defineAdapterRawCapability<RawFixture>()({
			capabilityId: 'fixture.operation-raw-adapter',
			version: '1.0.0',
		})
		const rawRequirement = requireCapability(rawCapability, '^1.0.0')
		const adapter = new RecordingDatabaseAdapter([], [])
		let escaped: RawFixture | undefined
		const rawOperation = defineOperation({
			input: messageValue,
			name: 'fixture.operations.raw-transaction',
			result: acceptedValue,
			target: 'application',
			transaction: 'required',
			version: '1.0.0',
		})
		const database = definePlugin({
			capabilities: {
				provides: [
					provideTestDatabaseAdapter(adapter),
					provideAdapterRawCapability(rawCapability, {
						contributionId: 'raw-adapter',
						create: () => ({
							transaction: (transaction) => ({
								kind: () => transaction.kind,
							}),
						}),
					}),
				],
			},
			core: '^0.0.0',
			pluginId: 'fixture.operation-raw-database',
			version: '1.0.0',
		})
		const operation = definePlugin({
			capabilities: {
				provides: [
					provideOperationHandler({
						contributionId: 'raw-handler',
						create: () => ({
							value: operationHandler({
								execute: ({ adapters }) =>
									adapters.withRaw(rawRequirement, (raw) => {
										escaped = raw
										return immutableRecord({
											accepted: raw.kind() === 'database-transaction-adapter',
										})
									}),
								operation: rawOperation,
							}),
						}),
					}),
				],
				requires: [rawRequirement],
			},
			core: '^0.0.0',
			declare: ({ operations }) => {
				operations.declare(rawOperation)
			},
			pluginId: 'fixture.operation-raw-consumer',
			privileges: [
				{ name: 'adapter:raw', reason: 'Uses an exact transaction facade.' },
				{ name: 'operation:declare', reason: 'Declares the raw operation.' },
			] as const,
			version: '1.0.0',
		})
		const ultimabase = new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [database, operation],
			schemas: [],
		})

		await ultimabase.start()
		await expect(
			ultimabase.operation(rawOperation).execute({ message: 'lease' }),
		).resolves.toStrictEqual({ accepted: true })
		expect(() => escaped?.kind()).toThrow(
			expect.objectContaining({ code: 'TRANSACTION_ERROR' }),
		)
		await ultimabase.dispose()
	})

	it('executes application, schema, and immutable model targets through handles', async () => {
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
		await expect(
			fixture.ultimabase
				.schema(Post)
				.command('publish')
				.execute({ message: 'now' }),
		).resolves.toStrictEqual({ accepted: true })
		const persisted = materializeSchemaModel(Post, {
			createdAt: '2026-08-19T00:00:00.000Z',
			id: '0198c000-0000-7000-8000-000000000001',
			title: 'Ready',
			updatedAt: '2026-08-19T00:00:00.000Z',
		})
		await fixture.ultimabase
			.schema(Post)
			.for(persisted)
			.command('publish')
			.execute({ message: 'model' })

		expect(fixture.trace).toStrictEqual([
			'adapter:begin',
			expect.stringMatching(/^application:.+:application$/u),
			'adapter:commit',
			'adapter:begin',
			`schema:${Post.className}:now`,
			'adapter:commit',
			'adapter:begin',
			'model:persisted:model',
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
				contributionId: 'application-handler',
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
		const cancelled = fixture.ultimabase.engine.withContext(
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
		const request = fixture.ultimabase.engine.anonymous({
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

	it('preserves declared plugin errors and transport compatibility safely', async () => {
		const masterAuthority = new MasterAuthority({
			keys: [{ id: 'fixture', value: 'transport-master-key' }],
			onUse: () => undefined,
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
			operations: [applicationOperation],
			transport: fakeProtocol,
		})
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
		const anonymous = fixture.ultimabase.engine.anonymous({
			requestId: 'master-source',
			source: 'fixture',
		})
		const master = await anonymous.useMasterKey(
			fixture.ultimabase.engine.authorizeMasterKey('transport-master-key'),
			'Test public transport authority rejection',
		)
		await expect(
			exposure.execute({
				context: master.context as never,
				input: { text: 'hello' },
				operation: applicationOperation.name,
				version: '1.0.0',
			}),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		await expect(
			exposure.execute({
				context,
				input: { text: 'hello' },
				operation: applicationOperation.name,
				version: '1.0.0',
			}),
		).rejects.toMatchObject({
			code: 'fixture.operations.rejected',
			internalDetails: { secret: 'hidden' },
		})
		await fixture.ultimabase.dispose()
	})

	it('isolates applications and closes stale handles', async () => {
		const first = await createFixture()
		const second = await createFixture()
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
		expect(second.trace).toStrictEqual([])
		await first.ultimabase.dispose()
		await expect(stale.execute({ message: 'stale' })).rejects.toThrow(
			'Application handle cannot be used after disposal',
		)
		await second.ultimabase.dispose()
	})

	it('requires transport exposure privilege on the exact binding owner', () => {
		const unprivileged = definePlugin({
			capabilities: {
				provides: [
					provideOperationTransportBinding({
						contributionId: 'unprivileged-binding',
						create: () => ({ value: fakeBinding }),
					}),
				],
			},
			core: '^0.0.0',
			declare: ({ operations }) => {
				operations.declare(applicationOperation)
			},
			pluginId: 'fixture.unprivileged-operation-transport',
			privileges: [
				{
					name: 'operation:declare',
					reason: 'Declares the fixture operation.',
				},
			] as const,
			version: '1.0.0',
		})

		expect(
			() =>
				new UltimaBase({
					pluginPrivileges: { logger: false },
					plugins: [unprivileged],
					schemas: [],
				}),
		).toThrow(
			'must declare active privilege "transport:expose" for capability contribution "unprivileged-binding"',
		)
	})
})
