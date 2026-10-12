import {
	definePluginConformanceSuite,
	runPluginConformance,
	waitForAfterCommit,
} from '@ultimabase/testing/plugins'
import { describe, expect, it } from 'vitest'
import {
	requireSchema,
	expectConformanceFailure,
} from '../../../../tests/fixtures/official-conformance-support.js'
import {
	createInvalidHooksProviderFixture,
	createOfficialHooksConformanceFixture,
	getOfficialHooksConformanceEvidence,
} from './fixtures/official-hooks-conformance.js'

// Preserve the original public-export scenarios under their contract owner.
describe('official Hooks capability conformance', () => {
	it('proves Hooks ordering, immutability, rollback, commit delivery, and isolation', async () => {
		const suite = definePluginConformanceSuite({
			createFixture: createOfficialHooksConformanceFixture,
			expected: {
				core: '^0.0.0',
				environment: [],
				pluginId: '@ultimabase/hooks-plugin',
				privileges: ['schema:declare', 'runtime:intercept'],
				version: '0.0.0',
			},
		}).check('middleware', async (context) => {
			const success = context.createUltimaBase()
			const successSchema = requireSchema(success.schemas[0], 'Hooks success')
			const successEvidence = getOfficialHooksConformanceEvidence(successSchema)
			await success.ultimabase.start()
			await successSchema.createOne({ data: { title: '  published  ' } })
			// Events reach consumers after commit, without delaying the call.
			await waitForAfterCommit()
			expect(successEvidence.trace).toStrictEqual([
				'developer:field',
				'provider:before',
				'developer:before',
				'developer:after',
				'provider:after',
				'database:commit',
				'event:official-hooks.created',
			])
			expect(successEvidence.database.commits).toBe(1)

			await success.ultimabase.dispose()
			const rollback = context.createUltimaBase()
			const rollbackSchema = requireSchema(
				rollback.schemas[0],
				'Hooks rollback',
			)
			const rollbackEvidence =
				getOfficialHooksConformanceEvidence(rollbackSchema)
			await rollback.ultimabase.start()
			await expect(
				rollbackSchema.createOne({ data: { title: 'rollback' } }),
			).rejects.toThrow('Hooks conformance requested rollback')
			await waitForAfterCommit()
			expect(rollbackEvidence.database.rollbacks).toBe(1)
			expect(rollbackEvidence.trace).not.toContain(
				'event:official-hooks.created',
			)

			await rollback.ultimabase.dispose()
			const first = context.createUltimaBase()
			const second = context.createUltimaBase()
			const firstSchema = requireSchema(first.schemas[0], 'First Hooks')
			const secondSchema = requireSchema(second.schemas[0], 'Second Hooks')
			const firstEvidence = getOfficialHooksConformanceEvidence(firstSchema)
			const secondEvidence = getOfficialHooksConformanceEvidence(secondSchema)
			await first.ultimabase.start()
			await firstSchema.createOne({ data: { title: 'first' } })
			expect(firstEvidence.trace).not.toStrictEqual([])
			await first.ultimabase.dispose()
			await second.ultimabase.start()
			expect(secondEvidence.trace).toStrictEqual([])
		})

		const report = await runPluginConformance(suite)
		expect(report.checks).toContainEqual({
			contract: 'middleware',
			status: 'passed',
		})
		expect(report.checks).toContainEqual({
			contract: 'lifecycle-cleanup',
			status: 'passed',
		})
	})

	it('reports actionable public diagnostics for an invalid Hooks provider', async () => {
		const suite = definePluginConformanceSuite({
			createFixture: createInvalidHooksProviderFixture,
			expected: {
				core: '^0.0.0',
				pluginId: 'community.invalid-hooks-provider',
				privileges: ['runtime:intercept'],
				version: '1.0.0',
			},
		})
		const failure = await runPluginConformance(suite).catch(
			(error: unknown) => error,
		)

		expectConformanceFailure(
			failure,
			'community.invalid-hooks-provider',
			'targets a schema outside its application',
		)
	})
})
