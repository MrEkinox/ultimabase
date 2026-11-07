// A sync, a reset or a deploy that waits for a lock (D-105), and a deploy that
// creates an index concurrently: such an index waits for every transaction of
// the database, so these tests run in one file, one after another.
import { Client } from 'pg'
import { MigrationFailed } from 'ultimabase'
import { describe, expect, it } from 'vitest'
import {
	after,
	before,
	eachInSchema,
	file,
	inSchema,
	migrations,
	query,
	schema,
	sync,
} from './test/migrations.ts'

eachInSchema()

/** A session that read Shelf, in a transaction it keeps open. */
async function holding(): Promise<Client> {
	const holder = new Client({ connectionString: inSchema(schema) })
	await holder.connect()
	await holder.query('begin')
	await holder.query('select count(*) from shelf')
	return holder
}

/** A raw statement of Shelf, for a sync to apply. */
const statement = (sql: string) => ({ sql, model: 'Shelf', does: sql })

describe('a sync or a reset waiting for a lock', () => {
	it('waits 5s at most for a table another session holds, and says so', async () => {
		await sync(undefined, before)
		const [was, now] = [migrations.snapshot(before), migrations.snapshot(after)]
		await migrations.apply({
			kind: 'sync',
			from: was,
			statements: [
				statement(
					"create table waits as select current_setting('lock_timeout') as waits",
				),
			],
			to: now,
		})
		expect(
			await query(inSchema(schema), 'select waits from waits'),
		).toStrictEqual([{ waits: '5s' }])
		const holder = await holding()
		try {
			const alter = 'alter table shelf add column late integer'
			await expect(
				migrations.apply({
					kind: 'sync',
					from: now,
					statements: [
						statement("set local lock_timeout = '50ms'"),
						statement(alter),
					],
					to: was,
				}),
			).rejects.toMatchObject({
				name: 'MigrationFailed',
				at: alter,
				reason:
					'canceling statement due to lock timeout: another query held a table it changes past lock_timeout',
				locked: true,
			})
			expect(
				await query(inSchema(schema), 'select count(*) from shelf'),
			).toStrictEqual([{ count: '0' }])
		} finally {
			await holder.end()
		}
	})

	// Its statements run together, then one at a time to name the one that
	// waited (D-307): that second run must not wait 5s again.
	it('syncs nothing when another session holds a table past 5s, and names the statement', async () => {
		await sync(undefined, before)
		const [was, now] = [migrations.snapshot(before), migrations.snapshot(after)]
		const alter = 'alter table shelf add column late integer'
		const holder = await holding()
		try {
			const started = Date.now()
			const failed: unknown = await migrations
				.apply({
					kind: 'sync',
					from: was,
					statements: [statement(alter)],
					to: now,
				})
				.catch((error: unknown) => error)
			const waited = Date.now() - started
			expect(waited).toBeGreaterThanOrEqual(4500)
			expect(waited).toBeLessThan(7500)
			expect(failed).toMatchObject({
				name: 'MigrationFailed',
				at: alter,
				locked: true,
			})
		} finally {
			await holder.end()
		}
	}, 15_000)

	it('resets nothing when another session holds a table past 5s', async () => {
		await sync(undefined, before)
		const holder = await holding()
		try {
			const started = Date.now()
			const failed: unknown = await migrations
				.reset()
				.catch((error: unknown) => error)
			// The 5s wait is timed by the database, whose clock can drift from
			// Node's when it runs in a VM, so the margin only proves it waited.
			expect(Date.now() - started).toBeGreaterThanOrEqual(4500)
			expect(failed).toBeInstanceOf(MigrationFailed)
			expect(failed).toMatchObject({ locked: true })
			expect(String(failed)).toMatch(
				/refused drop table .*"shelf".* cascade: canceling statement due to lock timeout/,
			)
		} finally {
			await holder.end()
		}
		expect(
			await query(inSchema(schema), 'select count(*) from shelf'),
		).toStrictEqual([{ count: '0' }])
	}, 15_000)
})

describe('a deploy waiting for a lock', () => {
	it('waits 5s at most, unless a file sets its own', async () => {
		const to = migrations.snapshot(before)
		await migrations.apply({
			kind: 'deploy',
			files: [
				file(
					'1_a.sql',
					"create table a as select current_setting('lock_timeout') as waits;",
				),
			],
			to,
		})
		expect(await query(inSchema(schema), 'select waits from a')).toStrictEqual([
			{ waits: '5s' },
		])
		const holder = new Client({ connectionString: inSchema(schema) })
		await holder.connect()
		try {
			await holder.query('begin')
			await holder.query('lock table a in access share mode')
			await expect(
				migrations.apply({
					kind: 'deploy',
					files: [
						file(
							'2_b.sql',
							"set local lock_timeout = '50ms'; alter table a add column b integer;",
						),
					],
					to,
				}),
			).rejects.toMatchObject({
				name: 'MigrationFailed',
				at: '2_b.sql',
				reason:
					'canceling statement due to lock timeout: another query held a table it changes past lock_timeout',
			})
		} finally {
			await holder.end()
		}
	})
})

describe('a deploy of a file without a transaction', () => {
	it('creates an index concurrently, once', async () => {
		const to = migrations.snapshot(before)
		const files = [
			file('1_a.sql', 'create table a (b integer);'),
			file(
				'2_index.sql',
				'-- ultimabase schema abc\n-- ultimabase no transaction\ncreate index concurrently a_b on a (b);\n',
				false,
			),
		]
		await migrations.apply({ kind: 'deploy', files, to })
		await migrations.apply({ kind: 'deploy', files, to })
		expect(
			await query(
				inSchema(schema),
				"select indexname from pg_indexes where tablename = 'a'",
			),
		).toStrictEqual([{ indexname: 'a_b' }])
		expect(
			(await migrations.stored())?.applied.map(({ name }) => name),
		).toStrictEqual(['1_a.sql', '2_index.sql'])
	})

	it('lets deploys wait while another creates an index concurrently', async () => {
		const to = migrations.snapshot(before)
		const files = [
			file('1_a.sql', 'select pg_sleep(0.2); create table a (b integer);'),
			file(
				'2_index.sql',
				'-- ultimabase schema abc\n-- ultimabase no transaction\ncreate index concurrently a_b on a (b);\n',
				false,
			),
		]
		const deploys = Array.from({ length: 4 }, async () =>
			migrations.apply({ kind: 'deploy', files, to }),
		)
		const ends = await Promise.allSettled(deploys)
		expect(ends.map(({ status }) => status)).toStrictEqual(
			deploys.map(() => 'fulfilled'),
		)
		expect(
			await query(
				inSchema(schema),
				"select indisvalid from pg_index where indexrelid = 'a_b'::regclass",
			),
		).toStrictEqual([{ indisvalid: true }])
		expect(
			(await migrations.stored())?.applied.map(({ name }) => name),
		).toStrictEqual(['1_a.sql', '2_index.sql'])
	})

	it('refuses two statements, and concurrently in a transaction', async () => {
		const to = migrations.snapshot(before)
		await migrations.apply({
			kind: 'deploy',
			files: [file('1_a.sql', 'create table a (b integer);')],
			to,
		})
		await expect(
			migrations.apply({
				kind: 'deploy',
				files: [
					file(
						'2_index.sql',
						'create index concurrently a_b on a (b); create index concurrently a_bb on a (b);',
						false,
					),
				],
				to,
			}),
		).rejects.toMatchObject({
			at: '2_index.sql',
			reason:
				'CREATE INDEX CONCURRENTLY cannot run inside a transaction block: a file without a transaction holds one statement: put each in its own file',
		})
		await expect(
			migrations.apply({
				kind: 'deploy',
				files: [file('2_index.sql', 'create index concurrently a_b on a (b);')],
				to,
			}),
		).rejects.toMatchObject({
			at: '2_index.sql',
			reason:
				'CREATE INDEX CONCURRENTLY cannot run inside a transaction block: put it in its own file, whose second line is `-- ultimabase no transaction`',
		})
		await migrations.apply({
			kind: 'deploy',
			files: [
				file('2_index.sql', 'create index concurrently a_b on a (b);', false),
			],
			to,
		})
		expect(
			await query(
				inSchema(schema),
				"select indexname from pg_indexes where tablename = 'a'",
			),
		).toStrictEqual([{ indexname: 'a_b' }])
	})
})
