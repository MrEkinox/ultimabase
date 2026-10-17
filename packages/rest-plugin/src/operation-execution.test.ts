import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { UltimaBase, defineOperationTransport } from '@ultimabase/core'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import {
	RequestContext,
	anonymous,
	authorizeMasterKey,
	withContext,
} from '@ultimabase/core/plugin'

import { restPlugin } from './plugin.js'
import {
	createFixture,
	createOperationPlugin,
	databasePlugin,
	inspectOperation,
	request,
	sessionValue,
} from './operation-execution.test-support.js'

describe('REST plugin operation exposure', () => {
	it('keeps operations private unless their owner declares them public', async () => {
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
					path: `/api${path ?? '/operations/inspect'}`,
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
		for (const inputSchema of [
			'',
			42,
			'MissingSchema',
			'RestOperationRecord',
		]) {
			await expect(
				createFixture({
					bindingMetadata: {
						errors: { 'fixture.rest-operation.rejected': 409 },
						inputSchema,
					},
				}),
			).rejects.toThrow(/input schema/u)
		}

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

	// ADR-0341: an owner that binds the operation to REST v2 only chose its
	// transports, so REST v1 gives it no default binding.
	it('does not expose a public operation bound to another protocol only', async () => {
		const fixture = await createFixture({
			transport: defineOperationTransport({
				name: 'ultimabase.rest',
				version: '2.0.0',
			}),
		})
		expect(fixture.rest.operationTransport?.operations ?? []).toStrictEqual([])
	})

	// ADR-0324: a public operation needs no REST binding; without one, REST
	// passes the wire input to the operation's own contract.
	it('exposes a public operation without any binding', async () => {
		const fixture = await createFixture({ omitBinding: true })
		const transport = fixture.rest.operationTransport
		const route = transport?.operations[0]
		if (transport === undefined || route === undefined) {
			throw new TypeError('expected REST operation transport')
		}
		expect(route.path).toBe('/api/operations/inspect')
		const context = RequestContext.anonymous({
			requestId: 'u',
			source: 'rest',
		})
		const { readLimits } = fixture.rest
		const execute = (input: unknown) =>
			transport.execute(context, route, request(input), readLimits)
		await expect(execute({ message: 'anonymous' })).resolves.toStrictEqual({
			accepted: true,
		})
		await expect(execute({ text: 'x' })).rejects.toMatchObject({
			code: 'VALIDATION_ERROR',
		})
		const rejected = 'fixture.rest-operation.rejected'
		expect(transport.statusFor(inspectOperation.name, rejected)).toBe(400)
	})

	it.each([
		{ path: undefined, distinct: false },
		{ path: '/inspect', distinct: false },
		{ path: '/inspect', distinct: true },
	])(
		'validates operation route composition for %j',
		async ({ path, distinct }) => {
			const ultimabase = new (UltimaBase.use(
				databasePlugin,
				createOperationPlugin({
					metadata: {
						errors: { 'fixture.rest-operation.rejected': 409 },
						...(path === undefined ? {} : { path }),
					},
				}),
				restPlugin({ instanceId: 'public' }),
				restPlugin({
					instanceId: 'admin',
					...(distinct ? { basePath: '/admin' } : {}),
				}),
			))({ logger: false, schemas: [] })
			onTestFinished(() => ultimabase.dispose())
			try {
				if (distinct) {
					await ultimabase.start()
					const rest = ultimabase.plugin({
						pluginId: '@ultimabase/rest-plugin',
						instanceId: 'public',
					})
					expect(rest.routeGraph.routes.map((route) => route.path)).toEqual([
						'/api/inspect',
						'/admin/inspect',
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
		const second = await createFixture({ masterKey: 'second-secret' })
		const foreign = RequestContext.anonymous({
			requestId: 'foreign',
			source: 'rest',
		})
		withContext(second.ultimabase, foreign)
		const foreignMasterSource = anonymous(second.ultimabase, {
			requestId: 'foreign-master',
			source: 'rest',
		})
		const foreignMaster = await foreignMasterSource.useMasterKey(
			authorizeMasterKey(second.ultimabase, 'second-secret'),
			'Foreign REST operation test',
		)
		await second.ultimabase.dispose()
		const first = await createFixture({ decode, masterKey: 'first-secret' })

		try {
			const transport = first.rest.operationTransport
			const route = transport?.operations[0]
			if (transport === undefined || route === undefined) {
				throw new TypeError('expected REST operation transport')
			}
			const anonymousEngine = anonymous(first.ultimabase, {
				requestId: 'master-source',
				source: 'rest',
			})
			const master = await anonymousEngine.useMasterKey(
				authorizeMasterKey(first.ultimabase, 'first-secret'),
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
