import { describe, expect, it } from 'vitest'

import { graphqlPlugin } from './plugin.js'

describe('graphqlPlugin', () => {
	it('declares one unambiguous privileged application capability', () => {
		const plugin = graphqlPlugin()

		expect(plugin.manifest).toMatchObject({
			identity: { pluginId: '@ultimabase/graphql-plugin' },
			capabilities: {
				provides: [{ contributionId: 'official-graphql-application' }],
			},
			environment: [],
			privileges: [{ name: 'schema:declare' }, { name: 'transport:expose' }],
		})
		expect(plugin.manifest.identity).not.toHaveProperty('instanceId')
	})

	it.each([
		[{ acknowledgeUnverifiedProtection: false }, 'must be true'],
		[{ default: { get: 'yes' } }, 'must be a boolean'],
		[{ instanceId: 'secondary' }, 'Unknown'],
	])('rejects malformed options %#', (options, message) => {
		expect(() => graphqlPlugin(options as never)).toThrow(message)
	})
})
