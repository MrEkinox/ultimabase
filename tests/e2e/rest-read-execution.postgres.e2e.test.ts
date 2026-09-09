import { accessPlugin } from '@ultimabase/access-plugin'
import { ACL, aclPlugin } from '@ultimabase/acl-permissions-plugin'
import {
	MasterAuthority,
	Schema,
	UltimaBase,
	applicationRequestExecutionCapability,
	defineCapability,
	definePlugin,
	provideCapability,
	requireCapability,
	type ApplicationCallbackExecutor,
	type ApplicationRequestExecutor,
	type PluginIdentity,
	type RequestContext,
} from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { executeRestReadRequest, restPlugin } from '@ultimabase/rest-plugin'
import { isUnknownArray } from '@ultimabase/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from './postgres-worker-fixture.js'

const publicAcl = new ACL().grantPublic('read')
const privateAcl = new ACL()
const deniedVirtualAccess = { access: { read: false } }

const RestAuthor = Schema.define({
	className: 'RestReadExecutionAuthor',
	fields: (field) => ({
		name: field.string({ required: true }),
		visible: field.boolean({ default: true }),
	}),
	access: {
		read: {
			allow: true,
			where: ({ where }) => where.eq('visible', true),
		},
	},
	acl: {
		default: privateAcl,
		resolveInput: ({ currentAcl, inputAcl }) =>
			inputAcl ?? currentAcl ?? privateAcl,
	},
})

const RestPost = Schema.define({
	className: 'RestReadExecutionPost',
	fields: (field) => ({
		author: field.pointer({ target: 'RestReadExecutionAuthor' }),
		contributors: field.relation({ target: 'RestReadExecutionAuthor' }),
		published: field.boolean({ default: false }),
		secret: field.string({ access: { read: false } }),
		title: field.string({ required: true }),
		summary: field.virtual({
			...deniedVirtualAccess,
			output: (output) => output.string({ nullable: false }),
			resolve: async ({ item }) => {
				await Promise.resolve()
				return `Summary: ${String(item.title)}`
			},
			select: { title: true },
		}),
	}),
	access: {
		read: {
			allow: { count: true, exists: true, many: true, one: true },
			where: ({ where }) => where.eq('published', true),
		},
	},
	acl: {
		default: privateAcl,
		resolveInput: ({ currentAcl, inputAcl }) =>
			inputAcl ?? currentAcl ?? privateAcl,
	},
})

interface ExecutionHarness {
	callbacks?: ApplicationCallbackExecutor
	executor?: ApplicationRequestExecutor
	owner?: PluginIdentity
}

const requestExecutionRequirement = requireCapability(
	applicationRequestExecutionCapability,
	'^1.0.0',
)
const harnessCapability = defineCapability<
	Readonly<{ readonly ready: true }>
>()({
	capabilityId: 'fixture.rest-read-postgres-harness',
	version: '1.0.0',
	cardinality: 'single',
	lifetime: 'application',
	compose: ([value]) => value,
})

const createHarnessPlugin = (harness: ExecutionHarness) =>
	definePlugin({
		core: '^0.0.0',
		pluginId: 'fixture.rest-read-postgres-harness',
		version: '1.0.0',
		privileges: [
			{
				name: 'authority:elevate',
				reason: 'Verifies the REST PostgreSQL Master fixture.',
			},
		],
		capabilities: {
			requires: [requestExecutionRequirement],
			provides: [
				provideCapability(harnessCapability, {
					contributionId: 'capture',
					create: ({ callbacks, capabilities, owner }) => {
						harness.callbacks = callbacks
						harness.executor = capabilities.get(requestExecutionRequirement)
						harness.owner = owner
						return { value: { ready: true } }
					},
				}),
			],
		},
	})

const readHarness = (harness: ExecutionHarness) => {
	if (
		harness.callbacks === undefined ||
		harness.executor === undefined ||
		harness.owner === undefined
	) {
		throw new TypeError('REST PostgreSQL execution harness is unavailable')
	}
	return {
		callbacks: harness.callbacks,
		executor: harness.executor,
		owner: harness.owner,
	}
}

const runAsHarness = <TResult>(
	harness: ExecutionHarness,
	callback: (executor: ApplicationRequestExecutor) => TResult,
): TResult => {
	const ready = readHarness(harness)
	return ready.callbacks.runPlugin(ready.owner, () => callback(ready.executor))
}

const jsonRequest = (path: string, body: unknown): Request =>
	new Request(`https://example.test${path}`, {
		body: JSON.stringify(body),
		headers: { 'Content-Type': 'application/json' },
		method: 'POST',
	})

const readIncludedNames = (value: unknown): readonly unknown[] => {
	if (!isUnknownArray(value)) {
		throw new TypeError('REST relation inclusion must materialize an array')
	}
	return value.map((item) =>
		typeof item === 'object' && item !== null && 'name' in item
			? item.name
			: undefined,
	)
}

const createApplication = (connectionUri: string) =>
	new UltimaBase({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'rest-e2e', value: 'rest-e2e-secret' }],
			onUse: () => undefined,
		}),
		pluginPrivileges: { logger: false },
		plugins: [
			accessPlugin({ default: true }),
			aclPlugin(),
			restPlugin({
				acknowledgeUnverifiedProtection: true,
				default: { count: true },
			}),
			createHarnessPlugin(harness),
			postgresPlugin({
				schemaPolicy: 'override',
				url: connectionUri,
			}),
		],
		schemas: [RestAuthor, RestPost],
		validation: {
			clock: () => new Date('2026-09-05T12:00:00.000Z'),
			timezone: 'UTC',
		},
	})

let fixture: PostgresWorkerFixture | undefined
const harness: ExecutionHarness = {}
let application: ReturnType<typeof createApplication> | undefined
let anonymous: RequestContext | undefined
let master: RequestContext | undefined
let visiblePostId = ''
let hiddenByAccessId = ''
let hiddenByAclId = ''

const getApplication = (): ReturnType<typeof createApplication> => {
	if (application === undefined) {
		throw new TypeError('REST PostgreSQL application is unavailable')
	}
	return application
}

const getAnonymous = (): RequestContext => {
	if (anonymous === undefined) {
		throw new TypeError('REST anonymous context is unavailable')
	}
	return anonymous
}

const getMaster = (): RequestContext => {
	if (master === undefined) {
		throw new TypeError('REST Master context is unavailable')
	}
	return master
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'rest_read' })
	application = createApplication(fixture.connectionUri)
	await application.start()

	anonymous = runAsHarness(harness, (executor) =>
		executor.createAnonymousContext({
			requestId: 'rest-postgres-anonymous',
			source: 'ultimabase.rest',
		}),
	)
	master = await runAsHarness(harness, (executor) =>
		executor.verifyMasterKey({
			context: anonymous as RequestContext<{ readonly mode: 'anonymous' }>,
			rawKey: 'rest-e2e-secret',
			reason: 'REST read PostgreSQL fixture setup',
		}),
	)

	const [visibleAuthor, hiddenAuthor] = await RestAuthor.createMany(
		{
			data: [
				{ acl: publicAcl, name: 'Visible Author', visible: true },
				{ acl: publicAcl, name: 'Hidden Author', visible: false },
			],
		},
		{ context: master, ultimabase: application },
	)
	if (visibleAuthor === undefined || hiddenAuthor === undefined) {
		throw new TypeError('REST author fixtures are incomplete')
	}

	const [visible, hiddenByAccess, hiddenByAcl] = await RestPost.createMany(
		{
			data: [
				{
					acl: publicAcl,
					author: RestAuthor.pointer(visibleAuthor.id),
					published: true,
					secret: 'visible-secret',
					title: 'Visible Post',
				},
				{
					acl: publicAcl,
					author: RestAuthor.pointer(visibleAuthor.id),
					published: false,
					secret: 'access-secret',
					title: 'Access Hidden',
				},
				{
					acl: privateAcl,
					author: RestAuthor.pointer(visibleAuthor.id),
					published: true,
					secret: 'acl-secret',
					title: 'ACL Hidden',
				},
			],
		},
		{ context: master, ultimabase: application },
	)
	if (
		visible === undefined ||
		hiddenByAccess === undefined ||
		hiddenByAcl === undefined
	) {
		throw new TypeError('REST post fixtures are incomplete')
	}
	visiblePostId = visible.id
	hiddenByAccessId = hiddenByAccess.id
	hiddenByAclId = hiddenByAcl.id
	await visible
		.relation('contributors')
		.connect([visibleAuthor.id, hiddenAuthor.id], {
			context: master,
			ultimabase: application,
		})
}, 30_000)

afterAll(async () => {
	await application?.dispose()
	await fixture?.dispose()
})

describe('REST read execution with PostgreSQL', { concurrent: false }, () => {
	it('matches direct Query for filters, relations, inclusions, projections, and offsets', async () => {
		const app = getApplication()
		const context = getAnonymous()
		const input = {
			include: {
				author: { select: { name: true } },
				contributors: {
					orderBy: { name: 'asc' },
					select: { name: true },
				},
			},
			limit: 10,
			offset: 0,
			orderBy: { title: 'asc' },
			select: { author: true, id: true, title: true },
			where: {
				contributors: {
					some: { name: { eq: 'Visible Author' } },
				},
			},
		} as const
		const rest = await runAsHarness(harness, (executor) =>
			executeRestReadRequest(executor, context, RestPost, {
				operation: 'find',
				request: jsonRequest('/posts/query', input),
			}),
		)
		const direct = await RestPost.findMany(input, {
			context,
			ultimabase: app,
		})

		expect(rest.map((post) => post.toJSON())).toStrictEqual(
			direct.map((post) => post.toJSON()),
		)
		expect(rest.map(({ id }) => id)).toStrictEqual([visiblePostId])
		expect(rest[0]?.toJSON()).toMatchObject({
			author: { name: 'Visible Author' },
		})
		expect(readIncludedNames(rest[0]?.contributors)).toStrictEqual([
			'Visible Author',
		])
	})

	it('preserves count, exists, strict missing targets, field Access, and Master bypass', async () => {
		const context = getAnonymous()
		const count = await runAsHarness(harness, (executor) =>
			executeRestReadRequest(executor, context, RestPost, {
				operation: 'count',
				request: new Request('https://example.test/posts/count'),
			}),
		)
		const exists = await runAsHarness(harness, (executor) =>
			executeRestReadRequest(executor, context, RestPost, {
				operation: 'exists',
				request: jsonRequest('/posts/exists', {
					where: { id: { eq: hiddenByAccessId } },
				}),
			}),
		)

		expect(count).toBe(1)
		expect(exists).toBe(false)
		for (const id of [hiddenByAccessId, hiddenByAclId]) {
			await expect(
				runAsHarness(harness, (executor) =>
					executeRestReadRequest(executor, context, RestPost, {
						id,
						operation: 'get',
						request: new Request(
							'https://example.test/posts/item?select=id,title',
						),
					}),
				),
			).rejects.toMatchObject({ code: 'NOT_FOUND' })
		}
		await expect(
			runAsHarness(harness, (executor) =>
				executeRestReadRequest(executor, context, RestPost, {
					operation: 'find',
					request: new Request('https://example.test/posts?select=secret'),
				}),
			),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		await expect(
			runAsHarness(harness, (executor) =>
				executeRestReadRequest(executor, context, RestPost, {
					operation: 'find',
					request: new Request('https://example.test/posts?select=summary'),
				}),
			),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })

		const masterRows = await runAsHarness(harness, (executor) =>
			executeRestReadRequest(executor, getMaster(), RestPost, {
				operation: 'find',
				request: new Request(
					'https://example.test/posts?orderBy=title&select=title,secret,summary',
				),
			}),
		)
		expect(masterRows.map(({ title }) => title)).toStrictEqual([
			'ACL Hidden',
			'Access Hidden',
			'Visible Post',
		])
		expect(masterRows.map(({ secret }) => secret)).toStrictEqual([
			'acl-secret',
			'access-secret',
			'visible-secret',
		])
		expect(masterRows.map(({ summary }) => summary)).toStrictEqual([
			'Summary: ACL Hidden',
			'Summary: Access Hidden',
			'Summary: Visible Post',
		])
	})
})
