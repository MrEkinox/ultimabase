import { accessPlugin } from '@ultimabase/access-plugin'
import { ACL, aclPlugin } from '@ultimabase/acl-permissions-plugin'
import {
	MasterAuthority,
	UltimaBase,
	getCurrentRequest,
} from '@ultimabase/core'
import { graphqlPlugin } from '@ultimabase/graphql-plugin'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { isPlainRecord } from '@ultimabase/shared'
import { validationPlugin } from '@ultimabase/validation-plugin'
import { z } from 'zod'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'
import {
	createRestMutationExecutionHarnessPlugin as createHarnessPlugin,
	runAsRestMutationExecutionHarness as runAsHarness,
	type RestMutationExecutionHarness as ExecutionHarness,
} from '../../../../tests/fixtures/rest-mutation-request-harness.js'
import type { RequestContext } from '@ultimabase/core/plugin'
import { anonymous as anonymousRequest } from '@ultimabase/core/plugin'

const publicAcl = new ACL().grantPublic('delete', 'read', 'update')
const privateAcl = new ACL()
const deniedVirtualAccess = { access: { read: false } }
const hookTrace: string[] = []
const GraphqlSchemaApplication = UltimaBase.use(hooksPlugin())
	.use(validationPlugin())
	.use(accessPlugin({ allowWithoutRule: { all: true } }))
	.use(aclPlugin())
	.use(graphqlPlugin({ publicWrites: true, default: true }))

const GraphqlAuthor = GraphqlSchemaApplication.Schema.define({
	className: 'GraphqlExecutionAuthor',
	fields: (field) => ({
		name: field.string({ required: true }),
		posts: field.relation({
			mappedBy: 'author',
			target: 'GraphqlExecutionPost',
		}),
	}),
}).with({
	graphql: true,
})

const GraphqlPost = GraphqlSchemaApplication.Schema.define({
	className: 'GraphqlExecutionPost',
	fields: (field) => ({
		author: field.pointer({ target: 'GraphqlExecutionAuthor' }),
		counter: field.int({ default: 0 }),
		contextLabel: field.virtual({
			output: (output) => output.string({ nullable: false }),
			resolve: async ({ context, item }) => {
				await Promise.resolve()
				return `${String(item.title)}:${context.access.mode}`
			},
			select: { title: true },
		}),
		privateLabel: field.virtual({
			...deniedVirtualAccess,
			output: (output) => output.string({ nullable: false }),
			resolve: ({ item }) => `Private: ${String(item.title)}`,
			select: { title: true },
		}),
		slug: field.string({ indexed: 'unique', required: true }),
		title: field.string({
			required: true,
			validation: z.string().min(2),
		}),
	}),
})
	.acl()
	.with({
		hooks: {
			beforeOperation: {
				create: ({ item }) => {
					hookTrace.push(
						`${getCurrentRequest().requestId}:create:${item.slug}`,
					)
				},
				delete: ({ originalItem }) => {
					hookTrace.push(
						`${getCurrentRequest().requestId}:delete:${originalItem.slug}`,
					)
				},
				update: ({ item }) => {
					hookTrace.push(
						`${getCurrentRequest().requestId}:update:${item.slug}`,
					)
				},
			},
		},
		acl: {
			default: publicAcl,
		},
		graphql: true,
	})

const harness: ExecutionHarness = {}
let fixture: PostgresWorkerFixture | undefined
let anonymous: RequestContext | undefined
let master: RequestContext | undefined
let foreign: RequestContext | undefined

const createApplication = (connectionUri: string) => {
	const Application = GraphqlSchemaApplication.use(
		createHarnessPlugin(harness),
	).use(postgresPlugin({ schemaPolicy: 'override', url: connectionUri }))
	return new Application({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'graphql-execution', value: 'graphql-master-secret' }],
			onUse: () => undefined,
		}),
		logger: false,
		schemas: [GraphqlAuthor, GraphqlPost],
		validation: {
			clock: () => new Date('2026-09-07T20:00:00.000Z'),
			timezone: 'UTC',
		},
	})
}

let application: ReturnType<typeof createApplication> | undefined

const app = (): ReturnType<typeof createApplication> => {
	if (application === undefined)
		throw new TypeError('GraphQL app is unavailable')
	return application
}

const context = (mode: 'anonymous' | 'master'): RequestContext => {
	const value = mode === 'anonymous' ? anonymous : master
	if (value === undefined) throw new TypeError('GraphQL context is unavailable')
	return value
}

const execute = (
	source: string,
	request: RequestContext = context('anonymous'),
	variables?: Readonly<Record<string, unknown>>,
) => {
	const graphqlApplication = app().plugin('@ultimabase/graphql-plugin')
	return graphqlApplication.execute({
		context: request,
		document: source,
		...(variables === undefined ? {} : { variables }),
	})
}

const recordAt = (
	data: unknown,
	field: string,
): Readonly<Record<string, unknown>> => {
	if (!isPlainRecord(data) || !isPlainRecord(data[field])) {
		throw new TypeError(`Missing GraphQL record ${field}`)
	}
	return data[field]
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'graphql_execution' })
	const foreignApplication = new (UltimaBase.use(
		postgresPlugin({
			schemaPolicy: 'ignore',
			url: fixture.connectionUri,
		}),
	))({ logger: false, schemas: [] })
	await foreignApplication.start()
	foreign = anonymousRequest(foreignApplication, {
		requestId: 'graphql-execution-forged',
		source: 'ultimabase.graphql',
	}).context
	await foreignApplication.dispose()
	application = createApplication(fixture.connectionUri)
	await application.start()
	anonymous = runAsHarness(harness, (executor) =>
		executor.createAnonymousContext({
			requestId: 'graphql-execution-anonymous',
			source: 'ultimabase.graphql',
		}),
	)
	master = await runAsHarness(harness, (executor) =>
		executor.verifyMasterKey({
			context: anonymous as RequestContext<{ readonly mode: 'anonymous' }>,
			rawKey: 'graphql-master-secret',
			reason: 'GraphQL schema execution PostgreSQL fixture',
		}),
	)
}, 30_000)

afterAll(async () => {
	await application?.dispose()
	await fixture?.dispose()
})

describe('GraphQL generated schema execution with PostgreSQL', () => {
	it('executes reads and every mutation family through canonical Runtime semantics', async () => {
		const created = await execute(`mutation {
			createGraphqlExecutionPost(input: { slug: "one", title: "One" }) {
				id slug title counter contextLabel
			}
		}`)
		expect(created.errors).toBeUndefined()
		const first = recordAt(created.data, 'createGraphqlExecutionPost')
		expect(first).toMatchObject({
			contextLabel: 'One:anonymous',
			counter: 0,
			slug: 'one',
			title: 'One',
		})

		const updated = await execute(
			`mutation Update($id: ID!) {
			updateGraphqlExecutionPost(input: {
				where: { id: { eq: $id } }
				data: { counter: { increment: 2 }, title: { set: "Updated" } }
			}) { id slug title counter contextLabel }
		}`,
			context('anonymous'),
			{ id: first.id },
		)
		expect(updated.errors).toBeUndefined()
		expect(recordAt(updated.data, 'updateGraphqlExecutionPost')).toMatchObject({
			contextLabel: 'Updated:anonymous',
			counter: 2,
			title: 'Updated',
		})

		const upserted = await execute(`mutation {
			upsertGraphqlExecutionPost(input: {
				where: { slug: { eq: "one" } }
				create: { slug: "one", title: "Created branch" }
				update: { title: { set: "Upserted" } }
			}) { id slug title counter contextLabel }
		}`)
		expect(upserted.errors).toBeUndefined()
		expect(recordAt(upserted.data, 'upsertGraphqlExecutionPost')).toMatchObject(
			{
				contextLabel: 'Upserted:anonymous',
				counter: 2,
				title: 'Upserted',
			},
		)

		const bulk = await execute(`mutation {
			createManyGraphqlExecutionPost(input: { data: [
				{ slug: "two", title: "Two" }
				{ slug: "three", title: "Three" }
			] }) { id slug }
			updateManyGraphqlExecutionPost(input: { data: [{
				where: { slug: { eq: "two" } }
				data: { counter: { increment: 3 } }
			}] }) { id slug counter }
			upsertManyGraphqlExecutionPost(input: { data: [{
				where: { slug: { eq: "four" } }
				create: { slug: "four", title: "Four" }
				update: { title: { set: "Existing four" } }
			}] }) { id slug }
			deleteManyGraphqlExecutionPost(input: {
				where: [{ slug: { eq: "three" } }]
			}) { id slug }
		}`)
		expect(bulk.errors).toBeUndefined()
		expect(isPlainRecord(bulk.data) ? bulk.data : {}).toMatchObject({
			createManyGraphqlExecutionPost: [{ slug: 'two' }, { slug: 'three' }],
			deleteManyGraphqlExecutionPost: [{ slug: 'three' }],
			updateManyGraphqlExecutionPost: [{ counter: 3, slug: 'two' }],
			upsertManyGraphqlExecutionPost: [{ slug: 'four' }],
		})

		const reads = await execute(`query {
			getGraphqlExecutionPost(id: "${String(first.id)}") { id slug title }
			findOneGraphqlExecutionPost(where: { slug: { eq: "two" } }) { slug counter }
			findManyGraphqlExecutionPost(first: 10, orderBy: [{ field: slug, direction: ASC }]) {
				nodes { slug }
			}
			countGraphqlExecutionPost
			existsGraphqlExecutionPost(where: { slug: { eq: "four" } })
		}`)
		expect(reads.errors).toBeUndefined()
		expect(isPlainRecord(reads.data) ? reads.data : {}).toMatchObject({
			countGraphqlExecutionPost: 3,
			existsGraphqlExecutionPost: true,
			findManyGraphqlExecutionPost: {
				nodes: [{ slug: 'four' }, { slug: 'one' }, { slug: 'two' }],
			},
			findOneGraphqlExecutionPost: { counter: 3, slug: 'two' },
			getGraphqlExecutionPost: { slug: 'one', title: 'Upserted' },
		})

		const deleted = await execute(
			`mutation Delete($id: ID!) {
			deleteGraphqlExecutionPost(input: { where: { id: { eq: $id } } }) { id slug }
		}`,
			context('anonymous'),
			{ id: first.id },
		)
		expect(deleted.errors).toBeUndefined()
		expect(recordAt(deleted.data, 'deleteGraphqlExecutionPost')).toMatchObject({
			slug: 'one',
		})
		expect(hookTrace).toEqual(
			expect.arrayContaining([
				'graphql-execution-anonymous:create:one',
				'graphql-execution-anonymous:update:one',
				'graphql-execution-anonymous:delete:one',
			]),
		)

		const authorResult = await execute(
			`mutation {
				createGraphqlExecutionAuthor(input: { name: "Ada" }) { id name }
			}`,
			context('master'),
		)
		expect(authorResult.errors).toBeUndefined()
		const author = recordAt(authorResult.data, 'createGraphqlExecutionAuthor')
		const linked = await execute(
			`mutation Linked($author: ID!) {
			createGraphqlExecutionPost(input: {
				author: { connect: $author }, slug: "linked", title: "Linked"
			}) { id }
		}`,
			context('anonymous'),
			{ author: author.id },
		)
		expect(linked.errors).toBeUndefined()
		const relationship = await execute(
			`query Relationship($id: ID!) {
				getGraphqlExecutionAuthor(id: $id) {
					name
					posts(first: 1) {
						nodes { slug title }
						pageInfo { hasNextPage }
					}
				}
			}`,
			context('master'),
			{ id: author.id },
		)
		expect(relationship.errors).toBeUndefined()
		expect(
			recordAt(relationship.data, 'getGraphqlExecutionAuthor'),
		).toMatchObject({
			name: 'Ada',
			posts: {
				nodes: [{ slug: 'linked', title: 'Linked' }],
				pageInfo: { hasNextPage: false },
			},
		})
	}, 30_000)

	it('preserves validation, ACL, Master, safe errors, and context attribution', async () => {
		const invalid = await execute(`mutation {
			createGraphqlExecutionPost(input: { slug: "invalid", title: "x" }) { id }
		}`)
		expect(invalid.data).toBeNull()
		expect(invalid.errors?.[0]).toMatchObject({
			extensions: {
				code: 'VALIDATION_ERROR',
				requestId: 'graphql-execution-anonymous',
				retryable: false,
			},
		})

		const privateRecord = await GraphqlPost.createOne(
			{
				data: { acl: privateAcl, slug: 'private', title: 'Private' },
				select: { id: true },
			},
			{ context: context('master') },
		)
		const anonymousRead = await execute(
			`query { getGraphqlExecutionPost(id: "${privateRecord.id}") { id title } }`,
		)
		expect(anonymousRead.data).toEqual({ getGraphqlExecutionPost: null })
		expect(anonymousRead.errors?.[0]?.extensions).toMatchObject({
			requestId: 'graphql-execution-anonymous',
		})

		const masterRead = await execute(
			`query { getGraphqlExecutionPost(id: "${privateRecord.id}") { id title } }`,
			context('master'),
		)
		expect(masterRead.errors).toBeUndefined()
		expect(recordAt(masterRead.data, 'getGraphqlExecutionPost')).toMatchObject({
			title: 'Private',
		})

		const deniedVirtual = await execute(
			`query { getGraphqlExecutionPost(id: "${privateRecord.id}") { privateLabel } }`,
		)
		expect(deniedVirtual.data).toEqual({ getGraphqlExecutionPost: null })
		expect(deniedVirtual.errors?.[0]?.extensions).toMatchObject({
			code: 'PERMISSION_DENIED',
		})
		const masterVirtual = await execute(
			`query { getGraphqlExecutionPost(id: "${privateRecord.id}") {
				contextLabel privateLabel
			} }`,
			context('master'),
		)
		expect(masterVirtual.errors).toBeUndefined()
		expect(
			recordAt(masterVirtual.data, 'getGraphqlExecutionPost'),
		).toMatchObject({
			contextLabel: 'Private:master',
			privateLabel: 'Private: Private',
		})

		const controller = new AbortController()
		const cancelled = runAsHarness(harness, (executor) =>
			executor.createAnonymousContext({
				requestId: 'graphql-execution-cancelled',
				signal: controller.signal,
				source: 'ultimabase.graphql',
			}),
		)
		controller.abort('client disconnected')
		await expect(
			execute('{ countGraphqlExecutionPost }', cancelled),
		).rejects.toMatchObject({ code: 'OPERATION_CANCELLED' })

		if (foreign === undefined)
			throw new TypeError('Foreign context is unavailable')
		await expect(
			execute('{ countGraphqlExecutionPost }', foreign),
		).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
	}, 30_000)
})
