import { MasterAuthority, UltimaBase } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'
import { createOfficialAccessConformanceFixture } from '../../packages/access-plugin/tests/e2e/fixtures/official-access-conformance.js'
import { requireSchema } from '../fixtures/official-conformance-support.js'

const createMasterAuthority = () =>
	new MasterAuthority({
		keys: [{ id: 'official-conformance', value: 'server-only' }],
		onUse: () => undefined,
	})
// Preserve the original public-export scenarios under their contract owner.
describe('official optional capability composition', () => {
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
