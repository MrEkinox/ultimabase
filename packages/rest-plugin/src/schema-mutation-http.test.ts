import { onTestFinished } from 'vitest'
import {
	MasterAuthority,
	PluginError,
	Schema,
	UltimaBase,
	addSchemaField,
	contributeSchemaMutation,
	databaseAdapterCapability,
	defineOperationTransport,
	defineOperationValue,
	definePlugin,
	defineSchemaMutation,
	provideCapability,
	requireCapability,
	schemaMutationTransportBinding,
	schemaMutationWireCodec,
	stringField,
	type DatabaseAdapter,
	type JsonValue,
} from '@ultimabase/core'
import {
	httpApplicationCapability,
	httpPlugin,
	type HttpApplication,
	type HttpOriginalHeader,
} from '@ultimabase/http-plugin'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import { describe, expect, it, vi } from 'vitest'

import { restPlugin } from './plugin.js'
import {
	RestSchemaMutationAdapter,
	schemaMutationRestId,
} from './schema-mutation-http.test-support.js'

const restRoutes = { rest: { mutations: true } }
const WorkflowDocument = Schema.define({
	...restRoutes,
	className: 'RestWorkflowDocument',
	fields: (field) => ({ title: field.string() }),
})
const archiveInput = defineOperationValue((value, path) => {
	if (!isPlainRecord(value) || typeof value.reason !== 'string') {
		throw new TypeError(`${path}.reason must be a string`)
	}
	return immutableRecord({ reason: value.reason })
})
const archiveMutation = defineSchemaMutation({
	authority: 'request',
	effect: 'update',
	errors: ['fixture.rest-schema-mutation.conflict'] as const,
	input: archiveInput,
	name: 'fixture.rest-schema-mutation.archive',
	returning: 'after',
	select: { title: true },
	version: '1.0.0',
})
const masterMutation = defineSchemaMutation({
	authority: 'master',
	effect: 'delete',
	input: defineOperationValue((value) => value),
	name: 'fixture.rest-schema-mutation.purge',
	returning: 'before',
	version: '1.0.0',
})
const compatibleRestProtocol = defineOperationTransport({
	name: 'ultimabase.rest',
	version: '1.0.0',
})

const createMutationPlugin = (
	trace: string[],
	decode: (value: unknown) => Readonly<{ readonly reason: string }>,
	metadata: JsonValue = {
		errors: { 'fixture.rest-schema-mutation.conflict': 409 },
	},
) =>
	definePlugin({
		operations: [
			contributeSchemaMutation({
				bindings: [
					schemaMutationTransportBinding({
						codec: schemaMutationWireCodec({
							decode,
							mutation: archiveMutation,
							transport: compatibleRestProtocol,
						}),
						metadata,
						mutation: archiveMutation,
					}),
				],
				mutation: archiveMutation,
				resolve: ({ context, input }) => {
					trace.push(`handler:${context.access.mode}:${input.reason}`)
					if (input.reason === 'conflict') {
						throw new PluginError(
							'fixture.rest-schema-mutation.conflict',
							'private workflow conflict',
							{ publicMessage: 'The workflow state conflicted.' },
						)
					}
					return { data: { workflowState: 'archived' } }
				},
			}),
			contributeSchemaMutation({
				bindings: [
					schemaMutationTransportBinding({
						codec: schemaMutationWireCodec({
							decode: (value: unknown) => value,
							mutation: masterMutation,
							transport: compatibleRestProtocol,
						}),
						metadata: { errors: {} },
						mutation: masterMutation,
					}),
				],
				mutation: masterMutation,
				resolve: () => undefined,
			}),
		],
		core: '^0.0.0',
		declare: ({ models, schemas }) => {
			schemas.patch({
				operations: [
					addSchemaField({
						contributionId: 'workflow-state',
						field: stringField(),
						name: 'workflowState',
					}),
				],
				targets: schemas.select({ className: WorkflowDocument.className }),
			})
			models.extend(WorkflowDocument, {
				contributionId: 'workflow-mutations',
				schemaMutations: {
					archiveDocument: {
						mutation: archiveMutation,
						surfaces: ['schema'],
					},
					purgeDocument: {
						mutation: masterMutation,
						surfaces: ['schema'],
					},
				},
			})
		},
		pluginId: 'fixture.rest-schema-mutation-owner',
		privileges: [
			{ name: 'model:extend', reason: 'Adds workflow commands.' },
			{ name: 'operation:declare', reason: 'Declares workflow mutations.' },
			{ name: 'persistence:rewrite', reason: 'Persists workflow state.' },
			{ name: 'schema:declare', reason: 'Adds workflow state.' },
			{ name: 'transport:expose', reason: 'Binds REST v1.' },
		] as const,
		version: '1.0.0',
	})

const databasePlugin = (adapter: DatabaseAdapter) =>
	definePlugin({
		capabilities: [
			provideCapability(databaseAdapterCapability, {
				contributionId: 'database',
				create: () => ({ value: adapter }),
			}),
		],
		core: '^0.0.0',
		pluginId: 'fixture.rest-schema-mutation-database',
		version: '1.0.0',
	})

const httpRequirement = requireCapability(httpApplicationCapability, '^1.0.0', {
	phase: 'setup',
})
const capturePlugin = (capture: { current?: HttpApplication }) =>
	definePlugin({
		capabilities: [httpRequirement],
		core: '^0.0.0',
		pluginId: 'fixture.rest-schema-mutation-http-capture',
		setup: ({ capabilities }) => {
			capture.current = capabilities.get(httpRequirement)
		},
		version: '1.0.0',
	})

const createFixture = async (
	options: {
		readonly bodyLimit?: number
		readonly metadata?: JsonValue
		readonly restDefault?: false | Readonly<{ readonly mutations: boolean }>
	} = {},
) => {
	const trace: string[] = []
	const audits: unknown[] = []
	const decode = vi.fn((value: unknown) => {
		if (!isPlainRecord(value) || typeof value.reason !== 'string') {
			throw new TypeError('REST archive input must contain reason')
		}
		return immutableRecord({ reason: value.reason })
	})
	const adapter = new RestSchemaMutationAdapter(trace)
	const capture: { current?: HttpApplication } = {}
	const application = new UltimaBase({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'rest-schema-mutation', value: 'master-secret' }],
			onUse: (event) => {
				audits.push(event)
			},
		}),
		pluginPrivileges: { logger: false },
		plugins: [
			databasePlugin(adapter),
			createMutationPlugin(trace, decode, options.metadata),
			restPlugin({
				acknowledgeUnverifiedProtection: true,
				...(options.bodyLimit === undefined
					? {}
					: { bodyLimit: options.bodyLimit }),
				...(options.restDefault === undefined
					? {}
					: { default: options.restDefault }),
			}),
			httpPlugin({ appId: 'schema-mutation-app', master: { enabled: true } }),
			capturePlugin(capture),
		],
		schemas: [WorkflowDocument],
	})
	onTestFinished(() => application.dispose())
	await application.start()
	if (capture.current === undefined)
		throw new TypeError('HTTP application missing')
	const rest = application.application.getPlugin('@ultimabase/rest-plugin')
	return {
		adapter,
		application,
		audits,
		decode,
		http: capture.current,
		rest,
		trace,
	}
}

const fetchApplication = (
	http: HttpApplication,
	path: string,
	options: RequestInit = {},
) => {
	const headers = new Headers(options.headers)
	headers.set('X-UltimaBase-Application-Id', 'schema-mutation-app')
	const originalHeaders: HttpOriginalHeader[] = [...headers.entries()]
	return http.fetch({
		originalHeaders,
		request: new Request(`https://example.test${path}`, {
			...options,
			headers,
		}),
	})
}

const archivePath = `/api/v1/classes/${WorkflowDocument.className}/${schemaMutationRestId}/archive-document`

describe('REST schema mutation exposure', () => {
	it('generates and executes one request-authority route without Typegen', async () => {
		const fixture = await createFixture()
		try {
			const mutationRoutes = fixture.rest.routeGraph.routes.filter(
				(route) => route.kind === 'rest-schema-mutation-route',
			)
			expect(mutationRoutes).toHaveLength(1)
			expect(mutationRoutes[0]).toMatchObject({
				command: 'archiveDocument',
				method: 'POST',
				mutation: archiveMutation.name,
				path: `/api/v1/classes/${WorkflowDocument.className}/{id}/archive-document`,
				schema: WorkflowDocument.className,
			})

			const response = await fetchApplication(fixture.http, archivePath, {
				body: JSON.stringify({
					input: { reason: 'obsolete' },
					select: { id: true, title: true, workflowState: true },
				}),
				headers: { 'content-type': 'application/json' },
				method: 'POST',
			})
			const body: unknown = await response.json()
			expect({
				status: response.status,
				body,
			}).toStrictEqual({
				status: 200,
				body: {
					result: {
						id: schemaMutationRestId,
						title: 'Release notes',
						workflowState: 'archived',
					},
				},
			})
			expect(fixture.trace).toStrictEqual([
				'begin',
				'prepare:delete-one',
				'handler:anonymous:obsolete',
				'execute:update-one',
				'commit',
			])
			const impersonation = await fetchApplication(
				fixture.http,
				`/api/v1/operations/${archiveMutation.name}`,
				{
					body: JSON.stringify({
						id: schemaMutationRestId,
						input: { reason: 'generic-operation' },
					}),
					headers: { 'content-type': 'application/json' },
					method: 'POST',
				},
			)
			expect(impersonation.status).toBe(404)
		} finally {
			await fixture.application.dispose()
		}
	})

	it('requires a complete safe-error status map before startup', async () => {
		await expect(createFixture({ metadata: { errors: {} } })).rejects.toThrow(
			'must map every declared public error',
		)
	})

	it('preserves safe plugin errors and audited Master authority', async () => {
		const fixture = await createFixture()
		try {
			const conflict = await fetchApplication(fixture.http, archivePath, {
				body: JSON.stringify({ input: { reason: 'conflict' } }),
				headers: { 'content-type': 'application/json' },
				method: 'POST',
			})
			const serialized = await conflict.text()
			expect(conflict.status).toBe(409)
			expect(serialized).toContain('The workflow state conflicted.')
			expect(serialized).not.toContain('private workflow conflict')

			const master = await fetchApplication(fixture.http, archivePath, {
				body: JSON.stringify({
					input: { reason: 'compliance' },
					select: { id: true, title: true, workflowState: true },
				}),
				headers: {
					'content-type': 'application/json',
					'X-UltimaBase-Master-Key': 'master-secret',
				},
				method: 'POST',
			})
			expect(master.status).toBe(200)
			expect(fixture.trace).toContain('handler:master:compliance')
			expect(fixture.audits).toHaveLength(1)
		} finally {
			await fixture.application.dispose()
		}
	})

	it('rejects malformed IDs, envelopes, media, queries, and body overflow early', async () => {
		const fixture = await createFixture({ bodyLimit: 48 })
		try {
			const cases: readonly [string, RequestInit, number][] = [
				[
					archivePath.replace(schemaMutationRestId, 'not-an-id'),
					{
						body: JSON.stringify({ input: { reason: 'invalid' } }),
						headers: { 'content-type': 'application/json' },
						method: 'POST',
					},
					400,
				],
				[
					archivePath,
					{
						body: JSON.stringify({ extra: true }),
						headers: { 'content-type': 'application/json' },
						method: 'POST',
					},
					400,
				],
				[
					archivePath,
					{
						body: '{}',
						headers: { 'content-type': 'text/plain' },
						method: 'POST',
					},
					415,
				],
				[
					`${archivePath}?unsafe=true`,
					{
						body: JSON.stringify({ input: { reason: 'query' } }),
						headers: { 'content-type': 'application/json' },
						method: 'POST',
					},
					400,
				],
				[
					archivePath,
					{
						body: JSON.stringify({ input: { reason: 'x'.repeat(100) } }),
						headers: { 'content-type': 'application/json' },
						method: 'POST',
					},
					413,
				],
			]
			for (const [path, options, status] of cases) {
				const response = await fetchApplication(fixture.http, path, options)
				expect(response.status).toBe(status)
			}
			expect(fixture.adapter.transactions).toBe(0)
		} finally {
			await fixture.application.dispose()
		}
	})

	it('keeps application context provenance and cancellation ahead of decoding', async () => {
		const second = await createFixture()
		const foreign = second.application.engine.anonymous({
			requestId: 'foreign',
			source: 'rest',
		})
		await second.application.dispose()
		const first = await createFixture()

		try {
			const transport = first.rest.schemaMutationTransport
			const route = transport?.mutations[0]
			if (transport === undefined || route === undefined) {
				throw new TypeError('REST schema mutation transport missing')
			}

			const before = first.decode.mock.calls.length
			await expect(
				transport.execute(
					foreign.context,
					route,
					schemaMutationRestId,
					new Request('https://example.test', {
						body: JSON.stringify({ input: { reason: 'foreign' } }),
						headers: { 'content-type': 'application/json' },
						method: 'POST',
					}),
					first.application.application.schemas.get(
						WorkflowDocument.className,
					) ?? WorkflowDocument,
					first.rest.readLimits,
				),
			).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
			expect(first.decode).toHaveBeenCalledTimes(before)

			const cancelled = new AbortController()
			cancelled.abort()
			const context = first.application.engine.anonymous({
				requestId: 'cancelled',
				signal: cancelled.signal,
				source: 'rest',
			})
			await expect(
				transport.execute(
					context.context,
					route,
					schemaMutationRestId,
					new Request('https://example.test', {
						body: JSON.stringify({ input: { reason: 'cancelled' } }),
						headers: { 'content-type': 'application/json' },
						method: 'POST',
					}),
					first.application.application.schemas.get(
						WorkflowDocument.className,
					) ?? WorkflowDocument,
					first.rest.readLimits,
				),
			).rejects.toMatchObject({ code: 'OPERATION_CANCELLED' })
			expect(first.decode).toHaveBeenCalledTimes(before)
		} finally {
			await first.application.dispose()
			await second.application.dispose()
		}
	})
})
