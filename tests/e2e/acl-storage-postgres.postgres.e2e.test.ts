import { ACL, acl, aclPlugin } from '@ultimabase/acl-permissions-plugin'
import { MasterAuthority, Schema, UltimaBase } from '@ultimabase/core'
import { postgresPlugin, postgresTable } from '@ultimabase/postgres-plugin'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from './postgres-worker-fixture.js'

const PrincipalA = Schema.define({
	className: 'ACLStoragePrincipalA',
	fields: () => ({}),
})
const PrincipalB = Schema.define({
	className: 'ACLStoragePrincipalB',
	fields: () => ({}),
})
const sharedId = '0198a43e-2431-7000-8000-000000000050'
const initialACL = new ACL()
	.grantPublic('read')
	.grantPrincipal(PrincipalA.pointer(sharedId), 'read', 'update')
	.grantPrincipal(PrincipalB.pointer(sharedId), 'delete')
const StoredPost = Schema.define({
	className: 'ACLStoragePost',
	fields: (field) => ({
		title: field.string({ validation: { required: true } }),
	}),
	extensions: [
		acl({
			default: initialACL,
			resolveInput: ({ currentAcl, inputAcl }) =>
				inputAcl ?? currentAcl ?? initialACL,
		}),
		postgresTable({ name: 'acl_storage_posts' }),
	],
})

let fixture: PostgresWorkerFixture | undefined

const getFixture = (): PostgresWorkerFixture => {
	if (fixture === undefined) {
		throw new TypeError('ACL PostgreSQL fixture has not started')
	}

	return fixture
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture()
}, 30_000)

afterAll(async () => {
	await fixture?.dispose()
})

describe('ACL JSONB storage', { concurrent: false }, () => {
	it('keeps ACL lifecycle atomic in one indexed object row', async () => {
		const ultimabase = new UltimaBase({
			masterAuthority: new MasterAuthority({
				keys: [{ id: 'acl-storage-e2e', value: 'server-only' }],
				onUse: () => undefined,
			}),
			plugins: [
				aclPlugin(),
				postgresPlugin({
					schemaPolicy: 'override',
					url: getFixture().connectionUri,
				}),
			],
			schemas: [PrincipalA, PrincipalB, StoredPost],
		})

		await ultimabase.start()

		try {
			const created = await StoredPost.createOne(
				{ data: { title: 'Protected' } },
				{ ultimabase, useMasterKey: true },
			)
			const createdRow = await getFixture().pool.query<{
				readonly acl: unknown
			}>('SELECT acl FROM acl_storage_posts WHERE id = $1', [created.id])

			expect(created.acl.toJSON()).toStrictEqual(initialACL.toJSON())
			expect(createdRow.rows[0]?.acl).toStrictEqual(initialACL.toJSON())
			expect(initialACL.toJSON().principals).toMatchObject([
				{ className: 'ACLStoragePrincipalA', id: sharedId },
				{ className: 'ACLStoragePrincipalB', id: sharedId },
			])

			const replacement = initialACL
				.revokePublic('read')
				.grantAuthenticated('read')
			const updated = await StoredPost.updateOne(
				{
					where: (where) => where.eq('id', created.id),
					data: { acl: replacement },
				},
				{ ultimabase, useMasterKey: true },
			)

			expect(updated?.acl.toJSON()).toStrictEqual(replacement.toJSON())
			const indexes = await getFixture().pool.query<{
				readonly indexdef: string
				readonly indexname: string
			}>(
				`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'acl_storage_posts'`,
			)
			const aclIndex = indexes.rows.find(({ indexname }) =>
				indexname.includes('_acl_idx_'),
			)

			expect(aclIndex?.indexdef).toContain('USING gin')
			const explainClient = await getFixture().pool.connect()
			let queryPlan: readonly string[]

			try {
				await explainClient.query('SET enable_seqscan TO off')
				const explained = await explainClient.query<{
					readonly 'QUERY PLAN': string
				}>('EXPLAIN SELECT * FROM acl_storage_posts WHERE acl @> $1::jsonb', [
					JSON.stringify({ authenticated: ['read'] }),
				])
				queryPlan = explained.rows.map((row) => row['QUERY PLAN'])
			} finally {
				await explainClient.query('RESET enable_seqscan')
				explainClient.release()
			}

			expect(queryPlan.some((line) => line.includes('Bitmap Index Scan'))).toBe(
				true,
			)
			expect(queryPlan.every((line) => !line.includes('Join'))).toBe(true)

			await StoredPost.deleteOne(
				{ where: (where) => where.eq('id', created.id) },
				{ ultimabase, useMasterKey: true },
			)
			const remaining = await getFixture().pool.query<{
				readonly count: string
			}>('SELECT count(*) FROM acl_storage_posts')
			const aclTables = await getFixture().pool.query<{
				readonly table_name: string
			}>(
				`SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name LIKE '%acl%' AND table_name <> 'acl_storage_posts'`,
			)

			expect(remaining.rows[0]?.count).toBe('0')
			expect(aclTables.rows).toStrictEqual([])
		} finally {
			await ultimabase.dispose()
		}
	})
})
