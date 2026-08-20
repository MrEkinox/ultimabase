import { accessPlugin } from '@ultimabase/access-plugin'
import { aclPlugin } from '@ultimabase/acl-permissions-plugin'
import { UltimaBase, type FrameworkPlugin } from '@ultimabase/core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createAlternativePolicyEngine } from './fixtures/alternative-policy-engine.js'
import {
	OfficialConformanceDatabase,
	officialConformanceDatabasePlugin,
} from './fixtures/official-conformance-database.js'
import {
	createPublicTransportDiagnosticPlugin,
	publicTransportDiagnosticOperation,
	publicTransportDiagnosticProtocol,
} from './fixtures/public-transport-protection.js'

const verifyProviderPresence = async (
	provider: FrameworkPlugin,
): Promise<void> => {
	const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
	const ultimabase = new UltimaBase({
		pluginPrivileges: { logger: false },
		plugins: [
			officialConformanceDatabasePlugin(new OfficialConformanceDatabase()),
			provider,
			createPublicTransportDiagnosticPlugin(),
		],
		schemas: [],
	})

	try {
		await ultimabase.start()
		ultimabase.exposeOperations({
			operations: [publicTransportDiagnosticOperation],
			transport: publicTransportDiagnosticProtocol,
		})
		expect(warning).toHaveBeenCalledWith(
			'[UltimaBase] Unverified public transport protection',
			{
				code: 'UNVERIFIED_PUBLIC_TRANSPORT_PROTECTION',
				message:
					'Public transport protection is unverified because protected policy presence does not prove coverage of exposed operations.',
				policy: {
					coverage: 'unverified',
					providerPresence: 'present',
				},
				transport: {
					name: publicTransportDiagnosticProtocol.name,
					version: publicTransportDiagnosticProtocol.version,
				},
			},
		)
	} finally {
		await ultimabase.dispose()
	}
}

afterEach(() => {
	vi.restoreAllMocks()
})

describe('public transport protection through public package exports', () => {
	it('keeps official Access presence informational', async () => {
		await verifyProviderPresence(accessPlugin())
	})

	it('keeps independent ACL presence informational', async () => {
		await verifyProviderPresence(aclPlugin())
	})

	it('keeps an alternative policy engine presence informational', async () => {
		await verifyProviderPresence(
			createAlternativePolicyEngine({ instanceId: 'transport' }).plugin,
		)
	})
})
