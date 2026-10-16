import { UltimaBase } from '@ultimabase/core'
import { graphql, type GraphQLResolveInfo } from 'graphql'
import { describe, expect, it } from 'vitest'

import { graphqlPlugin } from './index.js'
import { readGraphqlConnectionRuntime } from './application.js'
import {
	normalizeGraphqlMutation,
	type GraphqlMutationOperation,
} from './mutation-normalization.js'
import { initializeGraphqlTestApplication as createApplication } from './application.test-support.js'

const GraphqlSchemaApplication = UltimaBase.use(graphqlPlugin())

const authorId = '01991f00-0000-7000-8000-000000000001'
const recordId = '01991f00-0000-7000-8000-000000000002'

const Author = GraphqlSchemaApplication.Schema.define({
	className: 'GraphqlMutationAuthor',
	fields: (field) => ({ name: field.string(), rank: field.bigint() }),
})
const RecordSchema = GraphqlSchemaApplication.Schema.define({
	className: 'GraphqlMutationRecord',
	fields: (field) => ({
		author: field.pointer({ target: 'GraphqlMutationAuthor' }),
		related: field.relation({ target: 'GraphqlMutationAuthor' }),
		slug: field.string({ indexed: 'unique' }),
		title: field.string(),
		views: field.int(),
	}),
}).with({ graphql: true })

const createFixture = async () => {
	const application = await createApplication({
		logger: false,
		plugins: [graphqlPlugin({ publicWrites: true })],
		schemas: [Author, RecordSchema],
	})
	const graphqlApplication = application.plugin('@ultimabase/graphql-plugin')
	for (const field of Object.values(
		graphqlApplication.schema.getMutationType()?.getFields() ?? {},
	)) {
		field.resolve = undefined
	}
	return {
		application,
		connections: readGraphqlConnectionRuntime(graphqlApplication),
		schema: graphqlApplication.schema,
	}
}

describe('GraphQL mutation normalization', () => {
	it('normalizes every singular and bulk family into the closed Core command union', async () => {
		const fixture = await createFixture()
		const commands = new Map<
			string,
			ReturnType<typeof normalizeGraphqlMutation>
		>()
		const capture =
			(operation: GraphqlMutationOperation, bulk = false) =>
			(args: unknown, _context: unknown, info: GraphQLResolveInfo): unknown => {
				commands.set(
					operation,
					normalizeGraphqlMutation(
						RecordSchema,
						operation,
						args,
						info,
						fixture.connections,
					),
				)
				const value = {
					author: { id: authorId },
					id: recordId,
					title: 'result',
				}
				return bulk ? [value] : value
			}
		const result = await graphql({
			schema: fixture.schema,
			source: `
				mutation Execute {
					createGraphqlMutationRecord(input: {
						author: { connect: "${authorId}" }
						related: { create: [{ name: "Nested", rank: "7" }] }
						slug: "created", title: "Created", views: 1
					}) { title author { id } }
					createManyGraphqlMutationRecord(input: { data: [
						{ slug: "bulk-created", title: "Bulk created" }
					] }) { id }
					updateGraphqlMutationRecord(input: {
						where: { id: { eq: "${recordId}" } }, data: {
							author: { update: { name: { set: "Renamed" } } }
							related: { update: [{
								id: "${authorId}", data: { rank: { increment: "2" } }
							}] }
							title: { set: "Updated" }, views: { increment: 2 }
						}
					}) { title author { id } }
					updateManyGraphqlMutationRecord(input: { data: [{
						where: { slug: { eq: "bulk-update" } }, data: { views: { decrement: 1 } }
					}] }) { id }
					deleteGraphqlMutationRecord(input: { where: { id: { eq: "${recordId}" } } }) { id author { id } }
					deleteManyGraphqlMutationRecord(input: { where: [{ slug: { eq: "bulk-delete" } }] }) { id }
					upsertGraphqlMutationRecord(input: {
						where: { slug: { eq: "upsert" } }
						create: { slug: "upsert", title: "Created" }
						update: { title: { set: "Updated" } }
					}) { id author { id } }
					upsertManyGraphqlMutationRecord(input: { data: [{
						where: { slug: { eq: "bulk-upsert" } }
						create: { slug: "bulk-upsert", title: "Created" }
						update: { title: { set: "Updated" } }
					}] }) { id }
				}
			`,
			rootValue: {
				createGraphqlMutationRecord: capture('create'),
				createManyGraphqlMutationRecord: capture('bulkCreate', true),
				updateGraphqlMutationRecord: capture('update'),
				updateManyGraphqlMutationRecord: capture('bulkUpdate', true),
				deleteGraphqlMutationRecord: capture('delete'),
				deleteManyGraphqlMutationRecord: capture('bulkDelete', true),
				upsertGraphqlMutationRecord: capture('upsert'),
				upsertManyGraphqlMutationRecord: capture('bulkUpsert', true),
			},
		})

		expect(result.errors).toBeUndefined()
		expect(commands.get('create')).toMatchObject({
			kind: 'create-one',
			input: {
				data: {
					author: { connect: authorId },
					related: { create: [{ name: 'Nested', rank: 7n }] },
					slug: 'created',
					title: 'Created',
					views: 1,
				},
				include: { author: { select: { id: true } } },
				select: { title: true },
			},
		})
		expect(commands.get('bulkCreate')).toMatchObject({
			kind: 'create-many',
			input: { data: [{ slug: 'bulk-created', title: 'Bulk created' }] },
		})
		expect(commands.get('update')).toMatchObject({
			kind: 'update-one',
			input: { where: { id: { eq: recordId } }, select: { title: true } },
		})
		expect(
			Reflect.get(commands.get('update')?.input ?? {}, 'data'),
		).toMatchObject({
			author: { update: { name: 'Renamed' } },
			related: {
				update: [
					{
						data: { rank: { increment: 2n } },
						id: authorId,
					},
				],
			},
			title: 'Updated',
			views: { increment: 2 },
		})
		expect(commands.get('bulkUpdate')).toMatchObject({
			kind: 'update-many',
			input: {
				data: [
					{
						where: { slug: { eq: 'bulk-update' } },
						data: { views: { decrement: 1 } },
					},
				],
			},
		})
		expect(commands.get('delete')).toMatchObject({
			kind: 'delete-one',
			input: {
				where: { id: { eq: recordId } },
				select: { author: true, id: true },
			},
		})
		expect(commands.get('bulkDelete')).toMatchObject({
			kind: 'delete-many',
			input: { where: [{ slug: { eq: 'bulk-delete' } }] },
		})
		expect(commands.get('upsert')).toMatchObject({
			kind: 'upsert-one',
			input: {
				create: { slug: 'upsert', title: 'Created' },
				select: { author: true, id: true },
				update: { title: 'Updated' },
				where: { slug: { eq: 'upsert' } },
			},
		})
		expect(commands.get('bulkUpsert')).toMatchObject({
			kind: 'upsert-many',
			input: { data: [{ where: { slug: { eq: 'bulk-upsert' } } }] },
		})
		await fixture.application.dispose()
	})

	it('rejects relation hydration and non-id pointer expansion for delete and upsert', async () => {
		const fixture = await createFixture()
		const relation = await graphql({
			schema: fixture.schema,
			source: `mutation {
				deleteGraphqlMutationRecord(input: { where: { id: { eq: "${recordId}" } } }) {
					related { nodes { id } }
				}
			}`,
			rootValue: {
				deleteGraphqlMutationRecord: captureNormalization(
					'delete',
					fixture.connections,
				),
			},
		})
		const pointer = await graphql({
			schema: fixture.schema,
			source: `mutation {
				upsertGraphqlMutationRecord(input: {
					where: { slug: { eq: "restricted" } }
					create: { slug: "restricted" }
					update: { title: { set: "Restricted" } }
				}) { author { name } }
			}`,
			rootValue: {
				upsertGraphqlMutationRecord: captureNormalization(
					'upsert',
					fixture.connections,
				),
			},
		})

		expect(relation.errors?.[0]?.message).toContain('cannot be selected')
		expect(pointer.errors?.[0]?.message).toContain('only pointer id')
		await fixture.application.dispose()
	})
})

const captureNormalization =
	(
		operation: GraphqlMutationOperation,
		connections: ReturnType<typeof readGraphqlConnectionRuntime>,
	) =>
	(args: unknown, _context: unknown, info: GraphQLResolveInfo): unknown =>
		normalizeGraphqlMutation(RecordSchema, operation, args, info, connections)
