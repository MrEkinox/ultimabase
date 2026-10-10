import { accessPlugin } from '@ultimabase/access-plugin'
import { ACL, aclPlugin } from '@ultimabase/acl-permissions-plugin'
import {
	MasterAuthority,
	UltimaBase,
	plugin,
	contributeApplication,
	getCurrentRequest,
	requireCapability,
	type RequestContext,
} from '@ultimabase/core'
import {
	httpApplicationCapability,
	httpPlugin,
	httpRoute,
	provideHttpEndpoints,
	type HttpApplication,
} from '@ultimabase/http-plugin'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { executeRestMutationRequest, restPlugin } from '@ultimabase/rest-plugin'
import { validationPlugin } from '@ultimabase/validation-plugin'
import { z } from 'zod'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'
import {
	createRestMutationExecutionHarnessPlugin as createHarnessPlugin,
	restMutationRequestExecutionRequirement as requestExecutionRequirement,
	runAsRestMutationExecutionHarness as runAsHarness,
	type RestMutationExecutionHarness as ExecutionHarness,
} from '../../../../tests/fixtures/rest-mutation-request-harness.js'
import { isPlainResult } from '../../../../tests/fixtures/plain-results.js'

const publicAcl = new ACL().grantPublic('delete', 'read', 'update')
const privateAcl = new ACL()
const hookTrace: string[] = []
const RestMutationApplication = UltimaBase.use(hooksPlugin())
	.use(validationPlugin())
	.use(accessPlugin({ default: true }))
	.use(aclPlugin())

const MutationPost = RestMutationApplication.Schema.define({
	className: 'RestMutationExecutionPost',
	fields: (field) => ({
		counter: field.int({ default: 0 }),
		slug: field.string({ indexed: 'unique', required: true }),
		title: field.string({
			required: true,
			validation: z.string().min(2),
		}),
	}),
	hooks: {
		beforeOperation: {
			create: async ({ item }) => {
				hookTrace.push(`before:create:${String(item.slug)}`)
				if (item.slug !== 'deadline') return

				const signal = getCurrentRequest().signal
				await new Promise<never>((_resolve, reject) => {
					const rejectForCancellation = (): void => {
						const reason: unknown = signal.reason
						reject(
							reason instanceof Error
								? reason
								: new Error('Mutation deadline reached', { cause: reason }),
						)
					}
					if (signal.aborted) {
						rejectForCancellation()
						return
					}
					signal.addEventListener('abort', rejectForCancellation, {
						once: true,
					})
				})
			},
			delete: ({ originalItem }) => {
				hookTrace.push(`before:delete:${String(originalItem.slug)}`)
			},
			update: ({ item }) => {
				hookTrace.push(`before:update:${String(item.slug)}`)
			},
		},
	},
	acl: {
		default: publicAcl,
		resolveInput: ({ currentAcl, inputAcl }) =>
			inputAcl ?? currentAcl ?? publicAcl,
	},
	postgres: { table: 'rest_mutation_execution_posts' },
})

const httpApplicationRequirement = requireCapability(
	httpApplicationCapability,
	'^1.0.0',
	{ phase: 'setup' },
)
const createDeadlineRoutePlugin = () =>
	plugin({
		core: '^0.0.0',
		id: 'fixture.rest-mutation-deadline-route',
		version: '1.0.0',
		permissions: {
			'transport:expose': 'Exposes the REST mutation deadline fixture.',
		},
		contributions: [
			provideHttpEndpoints({
				contributionId: 'rest-mutation-deadline',
				create: ({ capabilities }) => {
					const executor = capabilities.get(requestExecutionRequirement)
					return httpRoute({
						handle: async (request) => {
							await executeRestMutationRequest(
								executor,
								getCurrentRequest(),
								MutationPost,
								{ operation: 'create', request },
							)
							return Response.json({ created: true })
						},
						method: 'POST',
						path: '/mutation-deadline',
						protocol: { name: 'ultimabase.rest', version: '1' },
					})
				},
			}),
			requestExecutionRequirement,
		],
	})

const createHttpCapturePlugin = (capture: { current?: HttpApplication }) =>
	plugin({
		core: '^0.0.0',
		id: 'fixture.rest-mutation-http-capture',
		version: '1.0.0',
		contributions: [
			httpApplicationRequirement,
			contributeApplication(({ capabilities }) => {
				capture.current = capabilities.get(httpApplicationRequirement)
				const exports = undefined
				return { exports }
			}),
		],
	})

const jsonRequest = (
	method: 'PATCH' | 'POST',
	path: string,
	body: unknown,
): Request =>
	new Request(`https://example.test${path}`, {
		body: JSON.stringify(body),
		headers: { 'Content-Type': 'application/json' },
		method,
	})

// ADR-0310: direct results are frozen plain objects.
const toJson = (value: unknown): Readonly<Record<string, unknown>> => {
	if (!isPlainResult(value)) {
		throw new TypeError('Expected one frozen plain result')
	}
	return value
}

const harness: ExecutionHarness = {}
const httpCapture: { current?: HttpApplication } = {}
const createApplication = (connectionUri: string) =>
	new (UltimaBase.use(
		hooksPlugin(),
		validationPlugin(),
		accessPlugin({ default: true }),
		aclPlugin(),
		restPlugin({
			acknowledgeUnverifiedProtection: true,
			default: true,
		}),
		httpPlugin({
			appId: 'rest-mutation-e2e',
			requestTimeoutMs: 10,
		}),
		createDeadlineRoutePlugin(),
		createHttpCapturePlugin(httpCapture),
		createHarnessPlugin(harness),
		postgresPlugin({ schemaPolicy: 'override', url: connectionUri }),
	))({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'rest-mutation-e2e', value: 'rest-mutation-secret' }],
			onUse: () => undefined,
		}),
		pluginPrivileges: { logger: false },
		schemas: [MutationPost],
		validation: {
			clock: () => new Date('2026-09-05T15:00:00.000Z'),
			timezone: 'UTC',
		},
	})

let fixture: PostgresWorkerFixture | undefined
let application: ReturnType<typeof createApplication> | undefined
let anonymous: RequestContext | undefined
let master: RequestContext | undefined

const getAnonymous = (): RequestContext => {
	if (anonymous === undefined) {
		throw new TypeError('REST mutation anonymous context is unavailable')
	}
	return anonymous
}

const getMaster = (): RequestContext => {
	if (master === undefined) {
		throw new TypeError('REST mutation Master context is unavailable')
	}
	return master
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'rest_mutation' })
	application = createApplication(fixture.connectionUri)
	await application.start()
	anonymous = runAsHarness(harness, (executor) =>
		executor.createAnonymousContext({
			requestId: 'rest-mutation-anonymous',
			source: 'ultimabase.rest',
		}),
	)
	master = await runAsHarness(harness, (executor) =>
		executor.verifyMasterKey({
			context: anonymous as RequestContext<{ readonly mode: 'anonymous' }>,
			rawKey: 'rest-mutation-secret',
			reason: 'REST mutation PostgreSQL fixture',
		}),
	)
}, 30_000)

afterAll(async () => {
	await application?.dispose()
	await fixture?.dispose()
})

describe(
	'REST mutation execution with PostgreSQL',
	{ concurrent: false },
	() => {
		it('matches direct create, update, upsert, and delete commands', async () => {
			const context = getAnonymous()
			const restCreated = await runAsHarness(harness, (executor) =>
				executeRestMutationRequest(executor, context, MutationPost, {
					operation: 'create',
					request: jsonRequest('POST', '/posts?select=id,slug,title,counter', {
						slug: 'rest-one',
						title: 'REST one',
					}),
				}),
			)
			const directCreated = await MutationPost.createOne(
				{
					data: { slug: 'direct-one', title: 'Direct one' },
					select: { counter: true, id: true, slug: true, title: true },
				},
				{ context },
			)
			expect(toJson(restCreated)).toMatchObject({
				counter: 0,
				slug: 'rest-one',
				title: 'REST one',
			})
			expect(Object.keys(toJson(restCreated))).toStrictEqual(
				Object.keys(directCreated),
			)

			const restUpdated = await runAsHarness(harness, (executor) =>
				executeRestMutationRequest(executor, context, MutationPost, {
					id: String(toJson(restCreated).id),
					operation: 'update',
					request: jsonRequest(
						'PATCH',
						'/posts/item?select=id,slug,title,counter',
						{
							counter: { increment: 2 },
							title: 'REST updated',
						},
					),
				}),
			)
			const directUpdated = await MutationPost.updateOne(
				{
					data: { counter: 2, title: 'Direct updated' },
					where: { id: directCreated.id },
					select: { counter: true, id: true, slug: true, title: true },
				},
				{ context },
			)
			expect(restUpdated === null ? null : toJson(restUpdated)).toMatchObject({
				counter: 2,
				slug: 'rest-one',
				title: 'REST updated',
			})
			expect(directUpdated?.counter).toBe(2)

			const restUpserted = await runAsHarness(harness, (executor) =>
				executeRestMutationRequest(executor, context, MutationPost, {
					operation: 'upsert',
					request: jsonRequest('POST', '/posts/upsert', {
						create: { slug: 'rest-upsert', title: 'REST inserted' },
						select: { counter: true, slug: true, title: true },
						update: { title: 'REST replaced' },
						where: { slug: { eq: 'rest-upsert' } },
					}),
				}),
			)
			expect(toJson(restUpserted)).toMatchObject({
				slug: 'rest-upsert',
				title: 'REST inserted',
			})
			const restUpsertUpdate = await runAsHarness(harness, (executor) =>
				executeRestMutationRequest(executor, context, MutationPost, {
					operation: 'upsert',
					request: jsonRequest('POST', '/posts/upsert', {
						create: { slug: 'rest-upsert', title: 'Unused create' },
						select: { slug: true, title: true },
						update: { title: 'REST replaced' },
						where: { slug: { eq: 'rest-upsert' } },
					}),
				}),
			)
			expect(toJson(restUpsertUpdate)).toMatchObject({
				slug: 'rest-upsert',
				title: 'REST replaced',
			})

			const restDeleted = await runAsHarness(harness, (executor) =>
				executeRestMutationRequest(executor, context, MutationPost, {
					id: String(toJson(restCreated).id),
					operation: 'delete',
					request: new Request(
						'https://example.test/posts/item?select=slug,title',
						{ method: 'DELETE' },
					),
				}),
			)
			expect(restDeleted === null ? null : toJson(restDeleted)).toMatchObject({
				slug: 'rest-one',
				title: 'REST updated',
			})
		})

		it('keeps bulk item order and rolls back every prior item on failure', async () => {
			const context = getAnonymous()
			const created = await runAsHarness(harness, (executor) =>
				executeRestMutationRequest(executor, context, MutationPost, {
					operation: 'bulk-create',
					request: jsonRequest('POST', '/posts/bulk/create', {
						data: [
							{ slug: 'bulk-first', title: 'Bulk first' },
							{ slug: 'bulk-second', title: 'Bulk second' },
						],
						select: { counter: true, slug: true, title: true },
					}),
				}),
			)
			const ids = created.map((value) => String(toJson(value).id))
			expect(created.map((value) => toJson(value).slug)).toStrictEqual([
				'bulk-first',
				'bulk-second',
			])

			await expect(
				runAsHarness(harness, (executor) =>
					executeRestMutationRequest(executor, context, MutationPost, {
						operation: 'bulk-update',
						request: jsonRequest('POST', '/posts/bulk/update', {
							data: [
								{
									data: { counter: { increment: 5 } },
									where: { id: { eq: ids[0] } },
								},
								{
									data: { title: 'x' },
									where: { id: { eq: ids[1] } },
								},
							],
						}),
					}),
				),
			).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })

			const afterRollback = await MutationPost.findMany(
				{
					orderBy: { slug: 'asc' },
					select: { counter: true, slug: true },
					where: { id: { in: ids } },
				},
				{ context },
			)
			expect(
				afterRollback.map(({ counter, slug }) => ({ counter, slug })),
			).toStrictEqual([
				{ counter: 0, slug: 'bulk-first' },
				{ counter: 0, slug: 'bulk-second' },
			])

			const updated = await runAsHarness(harness, (executor) =>
				executeRestMutationRequest(executor, context, MutationPost, {
					operation: 'bulk-update',
					request: jsonRequest('POST', '/posts/bulk/update', {
						data: ids.map((id, index) => ({
							data: { counter: { increment: index + 1 } },
							where: { id: { eq: id } },
						})),
						select: { counter: true, id: true, slug: true },
					}),
				}),
			)
			expect(
				updated.map((value) => ({
					counter: toJson(value).counter,
					slug: toJson(value).slug,
				})),
			).toStrictEqual([
				{ counter: 1, slug: 'bulk-first' },
				{ counter: 2, slug: 'bulk-second' },
			])

			const upserted = await runAsHarness(harness, (executor) =>
				executeRestMutationRequest(executor, context, MutationPost, {
					operation: 'bulk-upsert',
					request: jsonRequest('POST', '/posts/bulk/upsert', {
						data: [
							{
								create: { slug: 'bulk-first', title: 'Unused' },
								update: { title: 'Bulk first upserted' },
								where: { slug: { eq: 'bulk-first' } },
							},
							{
								create: { slug: 'bulk-third', title: 'Bulk third' },
								update: { title: 'Unused' },
								where: { slug: { eq: 'bulk-third' } },
							},
						],
						select: { slug: true, title: true },
					}),
				}),
			)
			expect(upserted.map((value) => toJson(value).slug)).toStrictEqual([
				'bulk-first',
				'bulk-third',
			])

			const deleted = await runAsHarness(harness, (executor) =>
				executeRestMutationRequest(executor, context, MutationPost, {
					operation: 'bulk-delete',
					request: jsonRequest('POST', '/posts/bulk/delete', {
						select: { slug: true },
						where: ids.map((id) => ({ id: { eq: id } })),
					}),
				}),
			)
			expect(deleted.map((value) => toJson(value).slug)).toStrictEqual([
				'bulk-first',
				'bulk-second',
			])
		})

		it('preserves ACL denial, Master bypass, hooks, validation, and cancellation', async () => {
			const privatePost = await MutationPost.createOne(
				{
					data: { acl: privateAcl, slug: 'private', title: 'Private post' },
				},
				{ context: getMaster() },
			)
			const anonymousUpdate = (): Promise<object | null> =>
				runAsHarness(harness, (executor) =>
					executeRestMutationRequest(executor, getAnonymous(), MutationPost, {
						id: privatePost.id,
						operation: 'update',
						request: jsonRequest('PATCH', '/posts/private', {
							title: 'Anonymous write',
						}),
					}),
				)
			await expect(anonymousUpdate()).resolves.toBeNull()

			const masterUpdated = await runAsHarness(harness, (executor) =>
				executeRestMutationRequest(executor, getMaster(), MutationPost, {
					id: privatePost.id,
					operation: 'update',
					request: jsonRequest('PATCH', '/posts/private', {
						title: 'Master write',
					}),
				}),
			)
			expect(
				masterUpdated === null ? null : toJson(masterUpdated),
			).toMatchObject({
				title: 'Master write',
			})

			await expect(
				runAsHarness(harness, (executor) =>
					executeRestMutationRequest(executor, getMaster(), MutationPost, {
						id: privatePost.id,
						operation: 'update',
						request: jsonRequest('PATCH', '/posts/private', { title: 'x' }),
					}),
				),
			).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
			expect(hookTrace).toEqual(
				expect.arrayContaining([
					'before:create:rest-one',
					'before:update:rest-one',
					'before:delete:rest-one',
					'before:update:private',
				]),
			)

			const controller = new AbortController()
			const context = runAsHarness(harness, (executor) =>
				executor.createAnonymousContext({
					requestId: 'rest-mutation-cancelled',
					signal: controller.signal,
					source: 'ultimabase.rest',
				}),
			)
			controller.abort('client disconnected')
			const request = new Request('https://example.test/posts', {
				body: JSON.stringify({ slug: 'cancelled', title: 'Cancelled post' }),
				headers: { 'Content-Type': 'application/json' },
				method: 'POST',
				signal: controller.signal,
			})
			await expect(
				runAsHarness(harness, (executor) =>
					executeRestMutationRequest(executor, context, MutationPost, {
						operation: 'create',
						request,
					}),
				),
			).rejects.toBe('client disconnected')
			await expect(
				MutationPost.findOne(
					{ where: { slug: { eq: 'cancelled' } } },
					{ context: getMaster() },
				),
			).resolves.toBeNull()
		})

		it('propagates the HTTP deadline through mutation hooks and rolls back', async () => {
			if (httpCapture.current === undefined) {
				throw new TypeError('REST mutation HTTP application is unavailable')
			}
			const response = await httpCapture.current.fetch({
				originalHeaders: [
					['X-UltimaBase-Application-Id', 'rest-mutation-e2e'],
					['Content-Type', 'application/json'],
				],
				request: jsonRequest('POST', '/mutation-deadline', {
					slug: 'deadline',
					title: 'Deadline post',
				}),
			})

			expect(response.status).toBe(408)
			expect(await response.json()).toMatchObject({
				error: { code: 'HTTP_REQUEST_TIMEOUT' },
			})
			await expect(
				MutationPost.findOne(
					{ where: { slug: { eq: 'deadline' } } },
					{ context: getMaster() },
				),
			).resolves.toBeNull()
		})
	},
)
