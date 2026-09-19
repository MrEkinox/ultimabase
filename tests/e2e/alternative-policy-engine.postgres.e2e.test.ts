import { MasterAuthority, Schema, UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	alternativePolicyPluginId,
	alternativeTenantPolicy,
	createAlternativePolicyEngine,
} from './fixtures/alternative-policy-engine.js'
import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../fixtures/postgres-worker-fixture.js'

let fixture: PostgresWorkerFixture | undefined

const getFixture = (): PostgresWorkerFixture => {
	if (fixture === undefined) {
		throw new TypeError('Alternative policy PostgreSQL fixture has not started')
	}
	return fixture
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'alternative_policy' })
}, 30_000)

afterAll(async () => {
	await fixture?.dispose()
})

describe('alternative policy PostgreSQL proof', { concurrent: false }, () => {
	it('enforces tenant rows and hidden fields while audited Master stays independent', async () => {
		const audit: string[] = []
		const Document = Schema.define({
			className: 'AlternativePolicyPostgresDocument',
			alternativePolicy: alternativeTenantPolicy({
				hiddenFields: ['secret'],
				tenant: 'community',
			}),
			fields: (field) => ({
				secret: field.string({ required: true }),
				tenant: field.string({ required: true }),
				title: field.string({ required: true }),
			}),
			postgres: { table: 'alternative_policy_documents' },
		})
		const engine = createAlternativePolicyEngine({ instanceId: 'postgres' })
		const ultimabase = new UltimaBase({
			masterAuthority: new MasterAuthority({
				keys: [{ id: 'postgres-master', value: 'unused-by-terminal' }],
				onUse: ({ reason }) => {
					audit.push(reason)
				},
			}),
			pluginPrivileges: { logger: false },
			plugins: [
				postgresPlugin({
					pool: getFixture().pool,
					schemaPolicy: 'override',
				}),
				engine.plugin,
			],
			schemas: [Document],
		})
		await ultimabase.start()

		try {
			await Document.createMany(
				{
					data: [
						{
							secret: 'community-secret',
							tenant: 'community',
							title: 'Community',
						},
						{
							secret: 'private-secret',
							tenant: 'private',
							title: 'Private',
						},
					],
				},
				{ ultimabase, useMasterKey: true },
			)
			const anonymous = await Document.findMany(
				{ orderBy: { title: 'asc' } },
				{ ultimabase },
			)
			const master = await Document.findMany(
				{ orderBy: { title: 'asc' } },
				{ ultimabase, useMasterKey: true },
			)

			expect(anonymous).toHaveLength(1)
			expect(anonymous[0]).toMatchObject({
				tenant: 'community',
				title: 'Community',
			})
			expect(anonymous[0]).not.toHaveProperty('secret')
			expect(master).toHaveLength(2)
			expect(master.map(({ secret }) => secret)).toStrictEqual([
				'community-secret',
				'private-secret',
			])
			// Generated collection creates are itemized singular master operations.
			expect(audit).toHaveLength(3)
			expect(
				ultimabase.application
					.getPlugin({
						instanceId: 'postgres',
						pluginId: alternativePolicyPluginId,
					})
					.diagnostics(),
			).toStrictEqual([
				{
					operation: 'find-many',
					schema: Document.className,
					tenant: 'community',
				},
			])
		} finally {
			await ultimabase.dispose()
		}
	}, 30_000)
})
