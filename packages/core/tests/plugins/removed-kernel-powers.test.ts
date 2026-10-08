import { describe, expect, it } from 'vitest'
import { plugin } from '../../src/index.js'
import { pluginPrivilegeMetadata } from '../../src/plugins/manifest.js'

describe('removed kernel powers', () => {
	it.each(['decorates', 'replaces'])(
		'rejects the retired %s manifest group for JavaScript callers',
		(group) => {
			// Runtime validation must reject old configuration even when TypeScript is absent.
			expect(() =>
				plugin({
					id: 'fixture.retired-group',
					version: '1.0.0',
					core: '^0.0.0',
					contributions: { [group]: [] } as never,
				}),
			).toThrow('plugin contributions must be an array')
		},
	)
	it.each([
		'capability:decorate',
		'capability:replace',
		'schema:replace',
		'runtime:replace',
	])('rejects the retired %s privilege', (name) => {
		expect(() =>
			plugin({
				id: 'fixture.retired-privilege',
				version: '1.0.0',
				core: '^0.0.0',
				contributions: [],
				permissions: { [name]: 'Invalid retired privilege.' } as never,
			}),
		).toThrow()
		expect(pluginPrivilegeMetadata).not.toHaveProperty(name)
	})
	it('retains the event and diagnostic privilege used by independent product capabilities', () => {
		expect(pluginPrivilegeMetadata).toHaveProperty('runtime:observe')
	})
})
