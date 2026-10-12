import { accessPlugin } from '@ultimabase/access-plugin'
import { aclPlugin } from '@ultimabase/acl-permissions-plugin'
import { UltimaBase } from '@ultimabase/core'
import type { FrameworkPlugin } from '@ultimabase/core/plugin'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createAlternativePolicyEngine } from './fixtures/alternative-policy-engine.js'
import {
	OfficialConformanceDatabase,
	officialConformanceDatabasePlugin,
} from '../fixtures/official-conformance-database.js'
import {
	createPublicTransportDiagnosticPlugin,
	publicTransportDiagnosticOperation,
	publicTransportDiagnosticProtocol,
} from './fixtures/public-transport-protection.js'

const verifyProviderPresence = async (
	provider: FrameworkPlugin,
): Promise<void> => {
	const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
	// The default console logger: the warning is visible at `warn` (ADR-0313).
	const ultimabase = new (UltimaBase.use(
		officialConformanceDatabasePlugin(new OfficialConformanceDatabase()),
		provider,
		createPublicTransportDiagnosticPlugin(),
	))({
		logLevel: 'warn',
		schemas: [],
	})

	try {
		await ultimabase.start()
		ultimabase.exposeOperations({
			operations: [publicTransportDiagnosticOperation],
			transport: publicTransportDiagnosticProtocol,
		})
		// Core no longer reports unverified protection (ADR-0325): REST and
		// GraphQL refuse public writes themselves (ADR-0294).
		expect(
			warning.mock.calls.some((call) =>
				call.some((value) => String(value).includes('public transport')),
			),
		).toBe(false)
	} finally {
		await ultimabase.dispose()
	}
}

afterEach(() => {
	vi.restoreAllMocks()
})

describe('public transport protection through public package exports', () => {
	it('exposes operations without a warning when Access is installed', async () => {
		await verifyProviderPresence(accessPlugin())
	})

	it('counts an Access write opening as an installed policy (ADR-0317, ADR-0294)', async () => {
		// Access is a protected policy whatever it opens: a transport never
		// needs a separate public-writes acknowledgment for it.
		await verifyProviderPresence(
			accessPlugin({ allowWithoutRule: { write: true } }),
		)
	})

	it('exposes operations without a warning when ACL is installed', async () => {
		await verifyProviderPresence(aclPlugin())
	})

	it('exposes operations without a warning with an alternative policy engine', async () => {
		await verifyProviderPresence(
			createAlternativePolicyEngine({ instanceId: 'transport' }).plugin,
		)
	})
})
