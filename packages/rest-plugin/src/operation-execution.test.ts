import {
	MasterAuthority,
	PluginError,
	RequestContext,
	RequestContextValue,
	UltimaBase,
	databaseAdapterCapability,
	defineOperation,
	defineOperationTransport,
	defineOperationValue,
	definePlugin,
	operationHandler,
	operationTransportBinding,
	operationWireCodec,
	provideCapability,
	provideOperationHandler,
	provideOperationTransportBinding,
	type DatabaseAdapter,
	type JsonValue,
	type OperationTransportProtocol,
} from '@ultimabase/core'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import { describe, expect, it, vi } from 'vitest'

import { restPlugin } from './plugin.js'

const unavailableAdapter: DatabaseAdapter = {
	kind: 'database-adapter',
	beginTransaction: () => {
		throw new TypeError('REST operation fixture does not open transactions')
	},
	execute: () => {
		throw new TypeError('REST operation fixture does not execute database work')
	},
}

const sessionValue = new RequestContextValue<Readonly<{ readonly id: string }>>(
	'fixture.rest-operation.session',
	(value) => {
		if (!isPlainRecord(value) || typeof value.id !== 'string') {
			throw new TypeError('session id must be a string')
		}
		return immutableRecord({ id: value.id })
	},
)
const inputValue = defineOperationValue((value, path) => {
	if (!isPlainRecord(value) || typeof value.message !== 'string') {
		throw new TypeError(`${path}.message must be a string`)
	}
	return immutableRecord({ message: value.message })
})
const resultValue = defineOperationValue((value, path) => {
	if (!isPlainRecord(value) || typeof value.accepted !== 'boolean') {
		throw new TypeError(`${path}.accepted must be a boolean`)
	}
	return immutableRecord({ accepted: value.accepted })
})
const inspectOperation = defineOperation({
	errors: ['fixture.rest-operation.rejected'] as const,
	input: inputValue,
	name: 'fixture.rest-operation.inspect',
	result: resultValue,
	target: 'application',
	transaction: 'forbidden',
	version: '1.0.0',
})

// Operation owners depend only on Core and independently name REST v1.
const compatibleRestProtocol = defineOperationTransport({
	name: 'ultimabase.rest',
	version: '1.0.0',
})

const createOperationPlugin = (options: {
	readonly decode?: (value: unknown) => Readonly<{ readonly message: string }>
	readonly metadata?: JsonValue
	readonly omitBinding?: boolean
	readonly transport?: OperationTransportProtocol
}) => {
	const transport = options.transport ?? compatibleRestProtocol
	const codec = operationWireCodec({
		decode:
			options.decode ??
			((value: unknown) => {
				if (!isPlainRecord(value) || typeof value.text !== 'string') {
					throw new TypeError('wire input must contain text')
				}
				return immutableRecord({ message: value.text })
			}),
		encode: (value) => immutableRecord({ ok: value.accepted }),
		operation: inspectOperation,
		transport,
	})
	const binding = operationTransportBinding({
		codec,
		metadata:
			options.metadata ??
			immutableRecord({
				errors: immutableRecord({
					'fixture.rest-operation.rejected': 409,
				}),
			}),
		operation: inspectOperation,
	})
	return definePlugin({
		capabilities: {
			provides: [
				provideOperationHandler({
					contributionId: 'handler',
					create: () => ({
						value: operationHandler({
							execute: ({ context, input }) => {
								if (input.message === 'reject') {
									throw new PluginError(
										'fixture.rest-operation.rejected',
										'internal operation detail',
										{ publicMessage: 'Operation rejected.' },
									)
								}
								return immutableRecord({
									accepted:
										context.access.mode === 'master' ||
										context.getValue(sessionValue)?.id === 'session-1' ||
										input.message === 'anonymous',
								})
							},
							operation: inspectOperation,
						}),
					}),
				}),
				...(options.omitBinding === true
					? []
					: [
							provideOperationTransportBinding({
								contributionId: 'rest-binding',
								create: () => ({ value: binding }),
							}),
						]),
			],
		},
		core: '^0.0.0',
		declare: ({ operations }) => {
			operations.declare(inspectOperation)
			return undefined
		},
		pluginId: 'fixture.rest-operation.owner',
		privileges: [
			{ name: 'operation:declare', reason: 'Declares the fixture operation.' },
			{ name: 'transport:expose', reason: 'Binds REST v1 explicitly.' },
		] as const,
		version: '1.0.0',
	})
}

const databasePlugin = definePlugin({
	capabilities: {
		provides: [
			provideCapability(databaseAdapterCapability, {
				contributionId: 'database',
				create: () => ({ value: unavailableAdapter }),
			}),
		],
	},
	core: '^0.0.0',
	pluginId: 'fixture.rest-operation.database',
	version: '1.0.0',
})

const createFixture = async (
	options: {
		readonly bindingMetadata?: JsonValue
		readonly decode?: (value: unknown) => Readonly<{ readonly message: string }>
		readonly expose?: boolean
		readonly masterKey?: string
		readonly omitBinding?: boolean
		readonly transport?: OperationTransportProtocol
	} = {},
) => {
	const operationPlugin = createOperationPlugin({
		...(options.bindingMetadata === undefined
			? {}
			: { metadata: options.bindingMetadata }),
		...(options.decode === undefined ? {} : { decode: options.decode }),
		...(options.omitBinding === undefined
			? {}
			: { omitBinding: options.omitBinding }),
		...(options.transport === undefined
			? {}
			: { transport: options.transport }),
	})
	const ultimabase = new UltimaBase({
		...(options.masterKey === undefined
			? {}
			: {
					masterAuthority: new MasterAuthority({
						keys: [{ id: 'fixture', value: options.masterKey }],
						onUse: () => undefined,
					}),
				}),
		pluginPrivileges: { logger: false },
		plugins: [
			databasePlugin,
			operationPlugin,
			restPlugin({
				acknowledgeUnverifiedProtection: true,
				...(options.expose === false ? {} : { operations: [inspectOperation] }),
			}),
		],
		schemas: [],
	})
	await ultimabase.start()
	const rest = ultimabase.application.getPlugin('@ultimabase/rest-plugin')
	return { rest, ultimabase }
}

const request = (input: unknown, signal?: AbortSignal): Request =>
	new Request('https://example.test/api/v1/operations/test', {
		body: JSON.stringify({ input }),
		headers: { 'content-type': 'application/json' },
		method: 'POST',
		...(signal === undefined ? {} : { signal }),
	})

describe('REST plugin operation exposure', () => {
	it('keeps declarations private until explicitly selected', async () => {
		const fixture = await createFixture({
			expose: false,
			bindingMetadata: {
				errors: { 'fixture.rest-operation.rejected': 409 },
				path: '/inspect',
			},
		})
		try {
			expect(fixture.rest.operationTransport).toBeUndefined()
			expect(
				fixture.rest.routeGraph.routes.some(
					(route) => route.kind === 'rest-plugin-operation-route',
				),
			).toBe(false)
		} finally {
			await fixture.ultimabase.dispose()
		}
	})

	it.each([undefined, '/inspect'])(
		'executes the exact route with public path %s through the same codecs',
		async (path) => {
			const fixture = await createFixture({
				bindingMetadata: {
					errors: { 'fixture.rest-operation.rejected': 409 },
					...(path === undefined ? {} : { path }),
				},
			})
			try {
				const transport = fixture.rest.operationTransport
				const route = transport?.operations[0]
				expect(route).toMatchObject({
					method: 'POST',
					operation: inspectOperation.name,
					operationVersion: inspectOperation.version,
					path: `/api/v1${path ?? `/operations/${inspectOperation.name}`}`,
				})
				if (transport === undefined || route === undefined) {
					throw new TypeError('expected REST operation transport')
				}
				const anonymous = RequestContext.anonymous({
					requestId: 'anonymous',
					source: 'rest',
				})
				await expect(
					transport.execute(
						anonymous,
						route,
						request({ text: 'anonymous' }),
						fixture.rest.readLimits,
					),
				).resolves.toStrictEqual({ ok: true })
				const session = RequestContext.anonymous({
					requestId: 'session',
					source: 'rest',
				}).withValue(sessionValue, { id: 'session-1' })
				await expect(
					transport.execute(
						session,
						route,
						request({ text: 'session' }),
						fixture.rest.readLimits,
					),
				).resolves.toStrictEqual({ ok: true })
			} finally {
				await fixture.ultimabase.dispose()
			}
		},
	)

	it('validates complete public error status metadata before startup', async () => {
		await expect(
			createFixture({
				bindingMetadata: {
					errors: { 'fixture.rest-operation.rejected': 409 },
					path: '/auth/../login',
				},
			}),
		).rejects.toThrow('invalid public path')
		await expect(
			createFixture({ bindingMetadata: { errors: {} } }),
		).rejects.toThrow('must map every declared public error')
		await expect(
			createFixture({
				bindingMetadata: {
					errors: { 'fixture.rest-operation.rejected': 200 },
				},
			}),
		).rejects.toThrow('has an invalid status')
	})

	it('rejects missing and incompatible REST bindings before startup', async () => {
		await expect(createFixture({ omitBinding: true })).rejects.toMatchObject({
			code: 'PLUGIN_OPERATION_INVALID',
		})
		await expect(
			createFixture({
				transport: defineOperationTransport({
					name: 'ultimabase.rest',
					version: '2.0.0',
				}),
			}),
		).rejects.toMatchObject({ code: 'PLUGIN_OPERATION_INVALID' })
	})

	it.each([
		{ path: undefined, distinct: false },
		{ path: '/inspect', distinct: false },
		{ path: '/inspect', distinct: true },
	])(
		'validates operation route composition for %j',
		async ({ path, distinct }) => {
			const ultimabase = new UltimaBase({
				pluginPrivileges: { logger: false },
				plugins: [
					databasePlugin,
					createOperationPlugin({
						metadata: {
							errors: { 'fixture.rest-operation.rejected': 409 },
							...(path === undefined ? {} : { path }),
						},
					}),
					restPlugin({
						instanceId: 'public',
						operations: [inspectOperation],
					}),
					restPlugin({
						instanceId: 'admin',
						...(distinct ? { basePath: '/admin' } : {}),
						operations: [inspectOperation],
					}),
				],
				schemas: [],
			})
			try {
				if (distinct) {
					await ultimabase.start()
					const rest = ultimabase.application.getPlugin({
						pluginId: '@ultimabase/rest-plugin',
						instanceId: 'public',
					})
					expect(rest.routeGraph.routes.map((route) => route.path)).toEqual([
						'/api/v1/inspect',
						'/admin/v1/inspect',
					])
				} else {
					await expect(ultimabase.start()).rejects.toThrow(
						'REST route collision for POST',
					)
				}
			} finally {
				await ultimabase.dispose()
			}
		},
	)

	it('enforces the exact JSON envelope, media type, size, and route ownership', async () => {
		const fixture = await createFixture()
		try {
			const transport = fixture.rest.operationTransport
			const route = transport?.operations[0]
			if (transport === undefined || route === undefined) {
				throw new TypeError('expected REST operation transport')
			}
			const context = RequestContext.anonymous({
				requestId: 'normalization',
				source: 'rest',
			})
			await expect(
				transport.execute(
					context,
					route,
					new Request('https://example.test', {
						body: '{}',
						headers: { 'content-type': 'application/json' },
						method: 'POST',
					}),
					fixture.rest.readLimits,
				),
			).rejects.toMatchObject({ code: 'REST_OPERATION_INVALID_INPUT' })
			await expect(
				transport.execute(
					context,
					route,
					new Request('https://example.test', {
						body: '{}',
						headers: { 'content-type': 'text/plain' },
						method: 'POST',
					}),
					fixture.rest.readLimits,
				),
			).rejects.toMatchObject({
				code: 'REST_OPERATION_UNSUPPORTED_MEDIA_TYPE',
			})
			await expect(
				transport.execute(context, route, request({ text: 'large' }), {
					...fixture.rest.readLimits,
					bodyBytes: 4,
				}),
			).rejects.toMatchObject({ code: 'REST_OPERATION_BODY_TOO_LARGE' })
		} finally {
			await fixture.ultimabase.dispose()
		}
	})

	it('preserves public errors and rejects foreign contexts before codec decoding', async () => {
		const decode = vi.fn((value: unknown) => {
			if (!isPlainRecord(value) || typeof value.text !== 'string') {
				throw new TypeError('invalid wire input')
			}
			return immutableRecord({ message: value.text })
		})
		const first = await createFixture({ decode, masterKey: 'first-secret' })
		const second = await createFixture({ masterKey: 'second-secret' })
		try {
			const transport = first.rest.operationTransport
			const route = transport?.operations[0]
			if (transport === undefined || route === undefined) {
				throw new TypeError('expected REST operation transport')
			}
			const anonymous = first.ultimabase.engine.anonymous({
				requestId: 'master-source',
				source: 'rest',
			})
			const master = await anonymous.useMasterKey(
				first.ultimabase.engine.authorizeMasterKey('first-secret'),
				'REST operation test',
			)
			await expect(
				transport.execute(
					master.context,
					route,
					request({ text: 'master' }),
					first.rest.readLimits,
				),
			).resolves.toStrictEqual({ ok: true })
			await expect(
				transport.execute(
					master.context,
					route,
					request({ text: 'reject' }),
					first.rest.readLimits,
				),
			).rejects.toMatchObject({
				code: 'fixture.rest-operation.rejected',
				publicMessage: 'Operation rejected.',
			})
			expect(
				transport.statusFor(
					inspectOperation.name,
					'fixture.rest-operation.rejected',
				),
			).toBe(409)

			const foreign = RequestContext.anonymous({
				requestId: 'foreign',
				source: 'rest',
			})
			second.ultimabase.engine.withContext(foreign)
			const before = decode.mock.calls.length
			await expect(
				transport.execute(
					foreign,
					route,
					request({ text: 'foreign' }),
					first.rest.readLimits,
				),
			).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
			expect(decode).toHaveBeenCalledTimes(before)

			const foreignMasterSource = second.ultimabase.engine.anonymous({
				requestId: 'foreign-master',
				source: 'rest',
			})
			const foreignMaster = await foreignMasterSource.useMasterKey(
				second.ultimabase.engine.authorizeMasterKey('second-secret'),
				'Foreign REST operation test',
			)
			await expect(
				transport.execute(
					foreignMaster.context,
					route,
					request({ text: 'foreign-master' }),
					first.rest.readLimits,
				),
			).rejects.toMatchObject({
				code: 'PERMISSION_DENIED',
				internalDetails: { reason: 'master-context-provenance-mismatch' },
			})
			expect(decode).toHaveBeenCalledTimes(before)
		} finally {
			await first.ultimabase.dispose()
			await second.ultimabase.dispose()
		}
	})

	it('preserves request cancellation and deadline classification', async () => {
		const fixture = await createFixture()
		try {
			const transport = fixture.rest.operationTransport
			const route = transport?.operations[0]
			if (transport === undefined || route === undefined) {
				throw new TypeError('expected REST operation transport')
			}
			const cancelled = new AbortController()
			cancelled.abort()
			await expect(
				transport.execute(
					RequestContext.anonymous({
						requestId: 'cancelled',
						signal: cancelled.signal,
						source: 'rest',
					}),
					route,
					request({ text: 'cancelled' }),
					fixture.rest.readLimits,
				),
			).rejects.toMatchObject({
				code: 'OPERATION_CANCELLED',
				internalDetails: { reason: 'request-aborted' },
			})
			const deadline = AbortSignal.timeout(1)
			await new Promise((resolve) => setTimeout(resolve, 5))
			await expect(
				transport.execute(
					RequestContext.anonymous({
						requestId: 'deadline',
						signal: deadline,
						source: 'rest',
					}),
					route,
					request({ text: 'deadline' }),
					fixture.rest.readLimits,
				),
			).rejects.toMatchObject({
				code: 'OPERATION_CANCELLED',
				internalDetails: { reason: 'deadline-exceeded' },
			})
		} finally {
			await fixture.ultimabase.dispose()
		}
	})

	it('closes the application facade across stop and disposal', async () => {
		const fixture = await createFixture()
		const transport = fixture.rest.operationTransport
		const route = transport?.operations[0]
		if (transport === undefined || route === undefined) {
			throw new TypeError('expected REST operation transport')
		}
		const context = RequestContext.anonymous({
			requestId: 'lifecycle',
			source: 'rest',
		})
		await fixture.ultimabase.stop()
		await expect(
			transport.execute(
				context,
				route,
				request({ text: 'anonymous' }),
				fixture.rest.readLimits,
			),
		).rejects.toThrow('requires a started application')
		await fixture.ultimabase.dispose()
		await expect(
			transport.execute(
				context,
				route,
				request({ text: 'anonymous' }),
				fixture.rest.readLimits,
			),
		).rejects.toThrow('received disposed')
	})
})
