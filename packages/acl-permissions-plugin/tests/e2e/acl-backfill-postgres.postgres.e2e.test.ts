import {
	ACL,
	aclPlugin,
	type ACLRule,
} from '@ultimabase/acl-permissions-plugin'
import {
	MasterAuthority,
	UltimaBase,
	type SchemaDefinition,
} from '@ultimabase/core'
import {
	postgresPlugin,
	type PostgresSchemaPolicy,
} from '@ultimabase/postgres-plugin'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'

// ADR-0321 decision 8: enabling ACL on a table backfills existing rows.
const ACLApplication = UltimaBase.use(aclPlugin())
const publicRead = new ACL().grantPublic('read')
const signedInRead = new ACL().grantAuthenticated('read')

/** Declares one schema without ACL, as the table was before `.acl()`. */
const plain = (className: string) =>
	ACLApplication.Schema.define({
		className,
		fields: (field) => ({ title: field.string({ required: true }) }),
	})

/** Declares the same schema once `.acl()` is added. */
const withACL = (className: string, rule: Readonly<{ acl: ACLRule }>) =>
	ACLApplication.Schema.define({
		className,
		fields: (field) => ({ title: field.string({ required: true }) }),
	})
		.acl()
		.with(rule)

let fixture: PostgresWorkerFixture | undefined

/** Resolves to the error a promise rejects with. */
const rejection = async (promise: Promise<unknown>): Promise<Error> => {
	try {
		await promise
	} catch (error: unknown) {
		if (error instanceof Error) return error
	}
	throw new TypeError('Expected a rejection with an Error')
}

const requireFixture = (): PostgresWorkerFixture => {
	if (fixture === undefined) throw new TypeError('Fixture has not started')
	return fixture
}

const start = async (
	schema: SchemaDefinition,
	schemaPolicy: PostgresSchemaPolicy = 'override',
) => {
	const application = new (UltimaBase.use(
		aclPlugin(),
		postgresPlugin({ schemaPolicy, url: requireFixture().connectionUri }),
	))({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'acl-backfill-e2e', value: 'server-only' }],
			onUse: () => undefined,
		}),
		schemas: [schema],
	})
	await application.start()
	return application
}

/** Creates the table without ACL and inserts `rows` titles. */
const seed = async (className: string, rows: readonly string[]) => {
	const Schema = plain(className)
	const application = await start(Schema)
	if (rows.length > 0) {
		await Schema.createMany({ data: rows.map((title) => ({ title })) })
	}
	await application.dispose()
}

const readColumn = async (table: string) => {
	const result = await requireFixture().pool.query<{
		readonly column_default: string | null
		readonly is_nullable: string
	}>(
		`SELECT column_default, is_nullable FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = 'acl'`,
		[table],
	)
	return result.rows[0]
}

const readStoredACLs = async (table: string) =>
	(
		await requireFixture().pool.query<{ readonly acl: unknown }>(
			`SELECT acl FROM "${table}" ORDER BY title`,
		)
	).rows.map(({ acl }) => acl)

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture()
})

afterAll(async () => {
	await fixture?.dispose()
})

describe('ACL backfill with PostgreSQL', { concurrent: false }, () => {
	it('adds the column to an empty table even with a function default', async () => {
		await seed('BackfillEmpty', [])
		const application = await start(
			withACL('BackfillEmpty', {
				acl: { default: ({ principal }) => new ACL(principal) },
			}),
		)
		await application.dispose()

		await expect(readColumn('backfill_empties')).resolves.toMatchObject({
			is_nullable: 'NO',
		})
	})

	it('gives existing rows a static default', async () => {
		await seed('BackfillStatic', ['a', 'b'])
		const Schema = withACL('BackfillStatic', { acl: { default: publicRead } })
		const application = await start(Schema)
		const rows = await Schema.findMany(
			{ select: { acl: true }, orderBy: { title: 'asc' } },
			{ useMasterKey: true },
		)
		await application.dispose()

		expect(rows.map(({ acl }) => acl.toJSON())).toStrictEqual([
			publicRead.toJSON(),
			publicRead.toJSON(),
		])
		const column = await readColumn('backfill_statics')
		expect(column?.is_nullable).toBe('NO')
		// The column keeps an empty ACL default for rows written without it.
		expect(column?.column_default).toContain('"public": []')
	})

	it('gives existing rows existingRows when the default is a function', async () => {
		await seed('BackfillExisting', ['a'])
		const application = await start(
			withACL('BackfillExisting', {
				acl: {
					default: ({ principal }) => new ACL(principal),
					existingRows: signedInRead,
				},
			}),
		)
		await application.dispose()

		await expect(readStoredACLs('backfill_existings')).resolves.toStrictEqual([
			signedInRead.toJSON(),
		])
	})

	it('refuses to start with a function default and no existingRows', async () => {
		await seed('BackfillMissing', ['a'])

		const failure = await rejection(
			start(
				withACL('BackfillMissing', {
					acl: { default: ({ principal }) => new ACL(principal) },
				}),
			),
		)
		expect(failure).toMatchObject({ code: 'VALIDATION_ERROR' })
		expect(failure.message).toContain(
			'BackfillMissing has rows and its acl.default is a function',
		)
		await expect(readColumn('backfill_missings')).resolves.toBeUndefined()
	})

	it('changes nothing under fail and names the value to provide', async () => {
		await seed('BackfillFail', ['a'])

		const failure = await rejection(
			start(withACL('BackfillFail', { acl: { default: publicRead } }), 'fail'),
		)
		expect(failure).toMatchObject({ code: 'VALIDATION_ERROR' })
		expect(failure.message).toContain(
			`Existing rows of "backfill_fails" would receive '${JSON.stringify(publicRead.toJSON())}'::jsonb in "acl".`,
		)
		await expect(readColumn('backfill_fails')).resolves.toBeUndefined()
	})

	it('keeps the column and its data and drops the index when ACL is disabled', async () => {
		await seed('BackfillDisabled', ['a'])
		const enabled = await start(
			withACL('BackfillDisabled', { acl: { default: publicRead } }),
		)
		await enabled.dispose()
		const indexes = async () =>
			(
				await requireFixture().pool.query<{ readonly indexname: string }>(
					`SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'backfill_disableds' AND indexdef LIKE '%acl%'`,
				)
			).rows
		expect(await indexes()).toHaveLength(1)

		const Disabled = plain('BackfillDisabled')
		const disabled = await start(Disabled)
		await Disabled.createOne({ data: { title: 'b' } })
		await disabled.dispose()

		expect(await indexes()).toHaveLength(0)
		await expect(readStoredACLs('backfill_disableds')).resolves.toStrictEqual([
			publicRead.toJSON(),
			new ACL().toJSON(),
		])
	})
})
