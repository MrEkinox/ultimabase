import { accessPlugin } from '@ultimabase/access-plugin'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import {
	createPluginConformanceFixture,
	definePluginConformanceSuite,
	runPluginConformance,
	withPluginTypegenConformance,
} from '@ultimabase/testing'
import {
	MasterAuthority,
	UltimaBase,
	type PluginDefinition,
} from '@ultimabase/core'
import { describe, expect, it } from 'vitest'
import { createOfficialAccessConformanceFixture } from '../../packages/access-plugin/tests/e2e/fixtures/official-access-conformance.js'
import {
	createProofSchema,
	requireSchema,
} from '../fixtures/official-conformance-support.js'

const createMasterAuthority = () =>
	new MasterAuthority({
		keys: [{ id: 'official-conformance', value: 'server-only' }],
		onUse: () => undefined,
	})
// Preserve the original public-export scenarios under their contract owner.
describe('official optional capability composition', () => {
	// One orchestration table preserves both public provider contracts and Typegen checks.
	it.each([
		{
			name: 'access',
			create: accessPlugin,
			privileges: ['schema:declare', 'runtime:constrain'] as const,
			types: ['FieldAccessOption', 'SchemaAccessOption'],
		},
		{
			name: 'hooks',
			create: hooksPlugin,
			privileges: ['schema:declare', 'runtime:intercept'] as const,
			types: ['FieldHooksOption', 'SchemaHooksOption'],
		},
	])(
		'proves $name manifest and Typegen contracts',
		async ({ name, create, privileges, types }) => {
			const pluginId = `@ultimabase/${name}-plugin`
			const suite = definePluginConformanceSuite({
				createFixture: () => {
					const subject: PluginDefinition = create()
					return createPluginConformanceFixture({
						schemas: [createProofSchema()],
						subject,
					})
				},
				expected: {
					core: '^0.0.0',
					environment: [],
					pluginId,
					privileges,
					version: '0.0.0',
				},
			})
			const report = await runPluginConformance(
				withPluginTypegenConformance(suite, {
					applicationId: `official-${name}-conformance`,
					verify: ({ contents }) => {
						for (const value of [pluginId, ...types])
							expect(contents).toContain(value)
					},
				}),
			)
			expect(report.checks.map(({ contract }) => contract)).toContain('typegen')
		},
	)

	it('proves master bypass and monotonic compatible-provider composition', async () => {
		const fixture = createOfficialAccessConformanceFixture('deny')
		const document = requireSchema(fixture.schemas[0], 'Access deny')
		const ultimabase = new UltimaBase({
			masterAuthority: createMasterAuthority(),
			plugins: fixture.plugins,
			schemas: fixture.schemas,
		})
		try {
			await ultimabase.start()
			await expect(
				document.findMany(undefined, { ultimabase }),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
			await expect(
				document.findMany(undefined, {
					ultimabase,
					useMasterKey: true,
				}),
			).resolves.toHaveLength(1)
		} finally {
			await ultimabase.dispose()
		}
	})
})
