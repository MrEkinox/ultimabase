import { describe, expect, it } from 'vitest'

import { graphiqlPlugin } from './plugin.js'

describe('graphiqlPlugin', () => {
	it('declares its exact route privilege, provider requirement, and asset claim', () => {
		const plugin = graphiqlPlugin({ environment: 'development' })

		expect(plugin.manifest).toMatchObject({
			capabilities: {
				provides: [{ contributionId: 'official-graphiql-browser-route' }],
				requires: [{ phase: 'materialization', version: '^1.0.0' }],
			},
			environment: ['environment:network'],
			identity: { pluginId: '@ultimabase/graphiql-plugin' },
			privileges: [{ name: 'transport:expose' }],
		})
		expect(plugin.peers).toStrictEqual([
			{ pluginId: '@ultimabase/http-plugin', version: '^0.0.0' },
		])
	})

	it('contributes no capability, privilege, peer, or claim when production disables it', () => {
		const plugin = graphiqlPlugin({ environment: 'production' })

		expect(plugin.manifest).toMatchObject({
			capabilities: { provides: [], requires: [] },
			environment: [],
			privileges: [],
		})
		expect(plugin.peers).toBeUndefined()
	})

	it.each([
		[undefined, 'plain object'],
		[{}, 'environment'],
		[{ environment: 'staging' }, 'environment'],
		[{ environment: 'development', allowInProduction: false }, 'must be true'],
		[{ environment: 'development', path: '/' }, 'normalized route suffix'],
		[
			{ environment: 'development', path: '/__ultimabase/apps/example' },
			'normalized route suffix',
		],
		[{ environment: 'development', unknown: true }, 'unknown option'],
	] as const)('rejects invalid options %#', (options, message) => {
		expect(() => graphiqlPlugin(options as never)).toThrow(message)
	})
})
