import { accessPlugin } from '@ultimabase/access-plugin'
import { ACL, aclPlugin } from '@ultimabase/acl-permissions-plugin'
import {
	MasterAuthority,
	Schema,
	UltimaBase,
	getCurrentRequest,
	type RequestContext,
} from '@ultimabase/core'
import {
	graphqlPlugin,
	type GraphqlSchemaExposureOption,
} from '@ultimabase/graphql-plugin'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { isPlainRecord } from '@ultimabase/shared'
import { validationPlugin } from '@ultimabase/validation-plugin'
import { z } from 'zod'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from './postgres-worker-fixture.js'
import {
	createRestMutationExecutionHarnessPlugin as createHarnessPlugin,
	runAsRestMutationExecutionHarness as runAsHarness,
	type RestMutationExecutionHarness as ExecutionHarness,
} from './rest-mutation-request-harness.js'

declare module '@ultimabase/core' {
	interface UltimaBaseGeneratedSchemaOptions {
		readonly graphql?: GraphqlSchemaExposureOption
	}
}

const publicAcl = new ACL().grantPublic('delete', 'read', 'update')
const privateAcl = new ACL()
const hookTrace: string[] = []

const GraphqlAuthor = Schema.define({
	className: 'GraphqlExecutionAuthor',
	fields: (field) => ({
		name: field.string({ required: true }),
		posts: field.relation({
			mappedBy: 'author',
			target: 'GraphqlExecutionPost',
		}),
	}),
	graphql: true,
	postgres: { table: 'graphql_execution_authors' },
})

const GraphqlPost = Schema.define({
	className: 'GraphqlExecutionPost',
	fields: (field) => ({
		author: field.pointer({ target: 'GraphqlExecutionAuthor' }),
		counter: field.int({ default: 0 }),
		slug: field.string({ indexed: 'unique', required: true }),
		title: field.string({
			required: true,
			validation: z.string().min(2),
		}),
	}),
	graphql: true,
	hooks: {
		beforeOperation: {
			create: ({ item }) => {
				hookTrace.push(
					`${getCurrentRequest().requestId}:create:${String(item.slug)}`,
				)
			},
			delete: ({ originalItem }) => {
				hookTrace.push(
					`${getCurrentRequest().requestId}:delete:${String(originalItem.slug)}`,
				)
			},
			update: ({ item }) => {
				hookTrace.push(
					`${getCurrentRequest().requestId}:update:${String(item.slug)}`,
				)
			},
		},
	},
	acl: {
		default: publicAcl,
		resolveInput: ({ currentAcl, inputAcl }) =>
			inputAcl ?? currentAcl ?? publicAcl,
	},
	postgres: { table: 'graphql_execution_posts' },
})

const harness: ExecutionHarness = {}
let fixture: PostgresWorkerFixture | undefined
let anonymous: RequestContext | undefined
let master: RequestContext | undefined

const createApplication = (connectionUri: string) =>
	new UltimaBase({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'graphql-execution', value: 'graphql-master-secret' }],
			onUse: () => undefined,
		}),
		pluginPrivileges: { logger: false },
		plugins: [
			hooksPlugin(),
			validationPlugin(),
			accessPlugin({ default: true }),
			aclPlugin(),
			graphqlPlugin({
				acknowledgeUnverifiedProtection: true,
				default: true,
			}),
			createHarnessPlugin(harness),
			postgresPlugin({ schemaPolicy: 'override', url: connectionUri }),
		],
		schemas: [GraphqlAuthor, GraphqlPost],
		validation: {
			clock: () => new Date('2026-09-07T20:00:00.000Z'),
			timezone: 'UTC',
		},
	})

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
	const graphqlApplication = app().application.getPlugin(
		'@ultimabase/graphql-plugin',
	)
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
				id slug title counter
			}
		}`)
		expect(created.errors).toBeUndefined()
		const first = recordAt(created.data, 'createGraphqlExecutionPost')
		expect(first).toMatchObject({ counter: 0, slug: 'one', title: 'One' })

		const updated = await execute(
			`mutation Update($id: ID!) {
			updateGraphqlExecutionPost(input: {
				id: $id
				data: { counter: { increment: 2 }, title: { set: "Updated" } }
			}) { id slug title counter }
		}`,
			context('anonymous'),
			{ id: first.id },
		)
		expect(updated.errors).toBeUndefined()
		expect(recordAt(updated.data, 'updateGraphqlExecutionPost')).toMatchObject({
			counter: 2,
			title: 'Updated',
		})

		const upserted = await execute(`mutation {
			upsertGraphqlExecutionPost(input: {
				where: { slug: { eq: "one" } }
				create: { slug: "one", title: "Created branch" }
				update: { title: { set: "Upserted" } }
			}) { id slug title counter }
		}`)
		expect(upserted.errors).toBeUndefined()
		expect(recordAt(upserted.data, 'upsertGraphqlExecutionPost')).toMatchObject(
			{
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
			deleteGraphqlExecutionPost(input: { id: $id }) { id slug }
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
			{ context: context('master'), ultimabase: app() },
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

		if (fixture === undefined) {
			throw new TypeError('GraphQL PostgreSQL fixture is unavailable')
		}
		const foreignApplication = new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [
				postgresPlugin({
					schemaPolicy: 'ignore',
					url: fixture.connectionUri,
				}),
			],
			schemas: [],
		})
		await foreignApplication.start()
		const foreign = foreignApplication.engine.anonymous({
			requestId: 'graphql-execution-forged',
			source: 'ultimabase.graphql',
		}).context
		await expect(
			execute('{ countGraphqlExecutionPost }', foreign),
		).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
		await foreignApplication.dispose()
	}, 30_000)
})
