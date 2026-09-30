import { postgresPlugin } from '@ultimabase/postgres-plugin'
import {
	FrameworkError,
	Schema,
	UltimaBase,
	type PluginSourceState,
} from '@ultimabase/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'
import { RecordingPostgresPool } from '../../../../tests/fixtures/recording-postgres-pool.js'

const resolverFailure = new Error('virtual resolver rejected the mutation')

const Person = Schema.define({
	className: 'VirtualPostgresPerson',
	fields: (field) => ({
		email: field.string({ indexed: 'unique', required: true }),
		firstName: field.string({ required: true }),
		lastName: field.string({ required: true }),
		secret: field.string({ required: true }),
		displayName: field.virtual({
			output: (output) => output.string({ nullable: false }),
			select: { firstName: true, lastName: true },
			resolve: async ({ item }) => {
				await Promise.resolve()
				if (item.firstName === 'Rollback') throw resolverFailure
				return `${String(item.firstName)} ${String(item.lastName)}`
			},
		}),
		initials: field.virtual({
			output: (output) => output.string({ nullable: false }),
			select: { firstName: true, lastName: true },
			resolve: ({ item }) =>
				`${String(item.firstName).slice(0, 1)}${String(item.lastName).slice(0, 1)}`,
		}),
	}),
})

const Post = Schema.define({
	className: 'VirtualPostgresPost',
	fields: (field) => ({
		author: field.pointer({ required: true, target: 'VirtualPostgresPerson' }),
		title: field.string({ required: true }),
	}),
})

const schemas = [Person, Post] as const

let fixture: PostgresWorkerFixture | undefined
let pool: RecordingPostgresPool | undefined
let ultimabase:
	| UltimaBase<
			readonly [...typeof schemas],
			readonly [ReturnType<typeof postgresPlugin>],
			PluginSourceState
	  >
	| undefined

const getApplication = () => {
	if (fixture === undefined || pool === undefined || ultimabase === undefined) {
		throw new TypeError('Virtual PostgreSQL fixture has not started')
	}

	return { fixture, pool, ultimabase }
}

/** Verifies the sanitized Runtime failure without mutating its frozen cause. */
const expectResolverFailure = async (
	operation: Promise<unknown>,
): Promise<void> => {
	const failure: unknown = await operation.catch((error: unknown) => error)

	expect(failure).toBeInstanceOf(FrameworkError)
	if (!(failure instanceof FrameworkError)) {
		throw new TypeError('Expected a virtual resolver framework failure')
	}
	expect(failure.code).toBe('INTERNAL_ERROR')
	expect(failure.internalDetails).toMatchObject({
		className: 'VirtualPostgresPerson',
		field: 'displayName',
	})
	expect(failure.cause).toBe(resolverFailure)
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'virtual_fields' })
	pool = new RecordingPostgresPool(fixture.pool)
	ultimabase = new (UltimaBase.use(
		postgresPlugin({ pool, schemaPolicy: 'override' }),
	))({ schemas })

	try {
		await ultimabase.start()
	} catch (error: unknown) {
		await fixture.dispose()
		throw error
	}
}, 30_000)

afterAll(async () => {
	try {
		await ultimabase?.dispose()
	} finally {
		await fixture?.dispose()
	}
})

describe('virtual fields with PostgreSQL', { concurrent: false }, () => {
	it('keeps DDL physical and materializes async read and mutation projections', async () => {
		const {
			fixture: database,
			pool: recorder,
			ultimabase: app,
		} = getApplication()
		const columns = await database.pool.query<{ column_name: string }>(
			`select column_name from information_schema.columns
			 where table_schema = $1 and table_name = 'virtual_postgres_people'
			 order by ordinal_position`,
			[database.schemaName],
		)

		expect(columns.rows.map(({ column_name: name }) => name)).toStrictEqual([
			'email',
			'firstName',
			'lastName',
			'secret',
			'id',
			'createdAt',
			'updatedAt',
		])

		const created = await Person.createOne(
			{
				data: {
					email: 'ada@example.com',
					firstName: 'Ada',
					lastName: 'Lovelace',
					secret: 'analytical-engine',
				},
				select: { displayName: true, initials: true },
			},
			{ ultimabase: app },
		)

		expect(created.toJSON()).toStrictEqual({
			displayName: 'Ada Lovelace',
			id: created.id,
			initials: 'AL',
		})

		recorder.reset()
		const selected = await Person.findOne(
			{
				select: { displayName: true, initials: true },
				where: { id: { eq: created.id } },
			},
			{ ultimabase: app },
		)

		expect(selected?.toJSON()).toStrictEqual({
			displayName: 'Ada Lovelace',
			id: created.id,
			initials: 'AL',
		})
		const select = recorder.statements.find((statement) =>
			statement.trimStart().toLowerCase().startsWith('select'),
		)
		expect(select).toContain('"firstName"')
		expect(select).toContain('"lastName"')
		expect(select).not.toContain('"displayName"')
		expect(select).not.toContain('"initials"')

		const complete = await Person.findOne(
			{ where: { id: { eq: created.id } } },
			{ ultimabase: app },
		)
		expect(complete).toMatchObject({
			displayName: 'Ada Lovelace',
			initials: 'AL',
			secret: 'analytical-engine',
		})

		const excluded = await Person.findOne(
			{
				select: { secret: false },
				where: { id: { eq: created.id } },
			},
			{ ultimabase: app },
		)
		expect(excluded?.toJSON()).toMatchObject({
			displayName: 'Ada Lovelace',
			initials: 'AL',
		})
		expect(excluded?.toJSON()).not.toHaveProperty('secret')

		const updated = await Person.updateOne(
			{
				data: { lastName: 'Byron' },
				select: { displayName: true },
				where: { id: { eq: created.id } },
			},
			{ ultimabase: app },
		)
		expect(updated?.toJSON()).toStrictEqual({
			displayName: 'Ada Byron',
			id: created.id,
		})

		const upserted = await Person.upsertOne(
			{
				create: {
					email: 'grace@example.com',
					firstName: 'Grace',
					lastName: 'Hopper',
					secret: 'compiler',
				},
				select: { displayName: true },
				update: { lastName: 'Murray Hopper' },
				where: { email: { eq: 'grace@example.com' } },
			},
			{ ultimabase: app },
		)
		expect(upserted.displayName).toBe('Grace Hopper')

		const collection = await Person.findMany(
			{
				orderBy: { email: 'asc' },
				select: { displayName: true },
			},
			{ ultimabase: app },
		)
		expect(collection.map(({ displayName }) => displayName)).toStrictEqual([
			'Ada Byron',
			'Grace Hopper',
		])

		const removed = await Person.deleteOne(
			{
				select: { displayName: true },
				where: { id: { eq: upserted.id } },
			},
			{ ultimabase: app },
		)
		expect(removed?.displayName).toBe('Grace Hopper')
	})

	it('rejects virtual predicates and ordering before PostgreSQL execution', () => {
		const { pool: recorder, ultimabase: app } = getApplication()

		recorder.reset()
		expect(() =>
			Person.findMany(
				{ where: { displayName: { eq: 'Ada Byron' } } } as never,
				{ ultimabase: app },
			),
		).toThrow(TypeError)
		expect(recorder.statements).toStrictEqual([])

		expect(() =>
			Person.findMany({ orderBy: { displayName: 'asc' } } as never, {
				ultimabase: app,
			}),
		).toThrow(TypeError)
		expect(recorder.statements).toStrictEqual([])
	})

	it('loads virtual dependencies through nested writes and relational includes', async () => {
		const { ultimabase: app } = getApplication()
		const post = await Post.createOne(
			{
				data: {
					author: {
						create: {
							email: 'nested@example.com',
							firstName: 'Katherine',
							lastName: 'Johnson',
							secret: 'orbital-mechanics',
						},
					},
					title: 'Trajectory',
				},
				include: {
					author: { select: { displayName: true, initials: true } },
				},
				select: { title: true },
			},
			{ ultimabase: app },
		)
		const author: unknown = post.author

		if (!(author instanceof Person)) {
			throw new TypeError('Expected the included virtual author')
		}
		expect(author.toJSON()).toStrictEqual({
			displayName: 'Katherine Johnson',
			id: author.id,
			initials: 'KJ',
		})

		const reloaded = await Post.findOne(
			{
				include: { author: { select: { displayName: true } } },
				select: { title: true },
				where: { id: { eq: post.id } },
			},
			{ ultimabase: app },
		)
		const reloadedAuthor: unknown = reloaded?.author

		if (!(reloadedAuthor instanceof Person)) {
			throw new TypeError('Expected the reloaded virtual author')
		}
		expect(reloadedAuthor.toJSON()).toStrictEqual({
			displayName: 'Katherine Johnson',
			id: author.id,
		})
	})

	it('rolls back a mutation when async virtual materialization fails', async () => {
		const { ultimabase: app } = getApplication()

		await expectResolverFailure(
			Person.createOne(
				{
					data: {
						email: 'rollback@example.com',
						firstName: 'Rollback',
						lastName: 'Create',
						secret: 'must-not-persist',
					},
					select: { displayName: true },
				},
				{ ultimabase: app },
			),
		)
		await expect(
			Person.exists(
				{ where: { email: { eq: 'rollback@example.com' } } },
				{ ultimabase: app },
			),
		).resolves.toBe(false)

		const stable = await Person.createOne(
			{
				data: {
					email: 'stable@example.com',
					firstName: 'Stable',
					lastName: 'Before',
					secret: 'preserved',
				},
			},
			{ ultimabase: app },
		)
		await expectResolverFailure(
			Person.updateOne(
				{
					data: { firstName: 'Rollback', lastName: 'Update' },
					select: { displayName: true },
					where: { id: { eq: stable.id } },
				},
				{ ultimabase: app },
			),
		)

		const persisted = await Person.findOne(
			{
				select: { firstName: true, lastName: true },
				where: { id: { eq: stable.id } },
			},
			{ ultimabase: app },
		)
		expect(persisted?.toJSON()).toStrictEqual({
			firstName: 'Stable',
			id: stable.id,
			lastName: 'Before',
		})
	})

	it('keeps physical dependencies isolated between applications', async () => {
		const { ultimabase: primary } = getApplication()
		const localRecord = await Person.createOne(
			{
				data: {
					email: 'application-isolation@example.com',
					firstName: 'Primary',
					lastName: 'Application',
					secret: 'local-only',
				},
				select: { displayName: true },
			},
			{ ultimabase: primary },
		)
		const isolatedFixture = await createPostgresWorkerFixture({
			prefix: 'virtual_fields_isolated',
		})
		const isolated = new (UltimaBase.use(
			postgresPlugin({
				schemaPolicy: 'override',
				url: isolatedFixture.connectionUri,
			}),
		))({ schemas })

		try {
			await primary.dispose()
			await isolated.start()
			const foreign = await Person.createOne(
				{
					data: {
						email: 'ada@example.com',
						firstName: 'Isolated',
						lastName: 'Application',
						secret: 'foreign-only',
					},
					select: { displayName: true },
				},
				{ ultimabase: isolated },
			)
			await isolated.dispose()
			ultimabase = new (UltimaBase.use(
				postgresPlugin({
					pool: getApplication().pool,
					schemaPolicy: 'ignore',
				}),
			))({ schemas })
			await ultimabase.start()
			const local = await Person.findOne(
				{
					select: { displayName: true },
					where: { id: { eq: localRecord.id } },
				},
				{ ultimabase },
			)

			expect(foreign.toJSON()).toStrictEqual({
				displayName: 'Isolated Application',
				id: foreign.id,
			})
			expect(local?.displayName).toBe('Primary Application')
			expect(foreign.toJSON()).not.toHaveProperty('secret')
			expect(local?.toJSON()).not.toHaveProperty('secret')
		} finally {
			await isolated.dispose()
			await isolatedFixture.dispose()
		}
	})
})
