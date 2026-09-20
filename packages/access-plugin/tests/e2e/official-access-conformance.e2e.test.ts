import {
	definePluginConformanceSuite,
	runPluginConformance,
} from '@ultimabase/testing'
import { describe, expect, it } from 'vitest'
import {
	requireSchema,
	expectConformanceFailure,
} from '../../../../tests/fixtures/official-conformance-support.js'
import {
	createInvalidAccessProviderFixture,
	createOfficialAccessConformanceFixture,
	getOfficialAccessConformanceEvidence,
} from './fixtures/official-access-conformance.js'

// Preserve the original public-export scenarios under their contract owner.
describe('official Access capability conformance', () => {
	it('proves Access denial, filters, item and field narrowing, relations, and transitions', async () => {
		const suite = definePluginConformanceSuite({
			createFixture: createOfficialAccessConformanceFixture,
			expected: {
				core: '^0.0.0',
				environment: [],
				pluginId: '@ultimabase/access-plugin',
				privileges: ['schema:declare', 'runtime:constrain'],
				version: '0.0.0',
			},
		}).check('persistence', async (context) => {
			const fixture = context.createUltimaBase()
			const document = requireSchema(fixture.schemas[0], 'Access document')
			const evidence = getOfficialAccessConformanceEvidence(document)
			await fixture.ultimabase.start()

			const rows = await document.findMany(undefined, {
				ultimabase: fixture.ultimabase,
			})
			expect(rows).toEqual([expect.not.objectContaining({ secret: 'hidden' })])
			expect(evidence.database.requests.at(-1)?.rowFilter).toBeDefined()
			await expect(
				document.count(undefined, { ultimabase: fixture.ultimabase }),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
			await expect(
				document.createOne(
					{ data: { secret: 'forbidden', title: 'field-denied' } },
					{ ultimabase: fixture.ultimabase },
				),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
			await expect(
				document.createOne(
					{ data: { title: 'denied-item' } },
					{ ultimabase: fixture.ultimabase },
				),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
			await expect(
				document.updateOne(
					{
						data: { title: 'denied-transition' },
						where: { id: { eq: '019c0000-0000-7000-8000-000000000101' } },
					},
					{ ultimabase: fixture.ultimabase },
				),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
			expect(evidence.database.rollbacks).toBeGreaterThan(0)

			const visible = rows[0]
			if (visible === undefined)
				throw new TypeError('Visible row is unavailable')
			await expect(
				visible.relation('tags').findMany(undefined, {
					ultimabase: fixture.ultimabase,
				}),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		})

		const report = await runPluginConformance(suite)
		expect(report.checks).toContainEqual({
			contract: 'persistence',
			status: 'passed',
		})
	})

	it('reports actionable public diagnostics for an invalid Access provider', async () => {
		const suite = definePluginConformanceSuite({
			createFixture: createInvalidAccessProviderFixture,
			expected: {
				core: '^0.0.0',
				pluginId: 'community.invalid-access-provider',
				privileges: ['runtime:constrain'],
				version: '1.0.0',
			},
		})
		const failure = await runPluginConformance(suite).catch(
			(error: unknown) => error,
		)

		expectConformanceFailure(
			failure,
			'community.invalid-access-provider',
			'targets an unavailable field',
		)
	})
})
