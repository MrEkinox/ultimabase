import {
	FrameworkApplication,
	plugin,
	contributeApplication,
	provideCapability,
	requireCapability,
} from '@ultimabase/core'
import { describe, expect, it, vi } from 'vitest'
import { httpApplicationCapability } from './application-capability.js'
import {
	httpApplicationProtocolVersion,
	httpOriginalHeaderMode,
} from './constants.js'

// Protocol compatibility is checked during capability composition, before server effects.
describe('HTTP application capability compatibility', () => {
	it.each([
		{
			patch: { protocolVersion: '2.0.0' },
			message: 'Unsupported HTTP application protocol version',
		},
		{
			patch: { originalHeaderMode: 'normalized' },
			message: 'requires ordered original header pairs',
		},
		{ patch: { appId: '' }, message: 'must be a non-empty string' },
		{ patch: { authority: {} }, message: 'capability is malformed' },
		{ patch: { requestTimeoutMs: 0 }, message: 'capability is malformed' },
	])(
		'rejects incompatible provider values before setup: $message',
		async ({ patch, message }) => {
			const seen = vi.fn()
			const requirement = requireCapability(
				httpApplicationCapability,
				'^1.0.0',
				{ phase: 'setup' },
			)
			const application = new FrameworkApplication({
				schemas: [],
				pluginPrivileges: { logger: false },
				plugins: [
					plugin({
						id: 'fixture.http-provider',
						version: '1.0.0',
						core: '^0.0.0',
						contributions: [
							provideCapability(httpApplicationCapability, {
								contributionId: 'http',
								create: () => ({
									value: {
										appId: 'valid',
										authority: { master: { enabled: false } },
										protocolVersion: httpApplicationProtocolVersion,
										originalHeaderMode: httpOriginalHeaderMode,
										requestTimeoutMs: undefined,
										routeGraph: {
											browserBootstraps: [],
											endpoints: [],
											mounts: [],
											routes: [],
										},
										fetch: () => Promise.resolve(new Response()),
										...patch,
									} as never,
								}),
							}),
						],
					}),
					plugin({
						id: 'fixture.server',
						version: '1.0.0',
						core: '^0.0.0',
						contributions: [
							requirement,
							contributeApplication((context) => {
								seen(context)
								return { exports: undefined }
							}),
						],
					}),
				],
			})
			try {
				await expect(application.initialize()).rejects.toThrow(message)
				expect(seen).not.toHaveBeenCalled()
			} finally {
				await application.dispose()
			}
		},
	)
})
