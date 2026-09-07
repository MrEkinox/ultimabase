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
		[{ limits: null }, 'plain object'],
		[{ limits: { maxPageSize: 0 } }, 'greater than or equal to 1'],
		[{ limits: { defaultPageSize: 10, maxPageSize: 5 } }, 'must not exceed'],
		[{ limits: { unknown: 1 } }, 'unknown option'],
		[{ instanceId: 'secondary' }, 'Unknown'],
	])('rejects malformed options %#', (options, message) => {
		expect(() => graphqlPlugin(options as never)).toThrow(message)
	})
})
