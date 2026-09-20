import { describe, expect, it } from 'vitest'
import { definePlugin, pluginPrivilegeMetadata } from '../../src/index.js'

describe('removed kernel powers', () => {
	it.each(['decorates', 'replaces'])(
		'rejects the retired %s manifest group for JavaScript callers',
		(group) => {
			// Runtime validation must reject old configuration even when TypeScript is absent.
			expect(() =>
				definePlugin({
					pluginId: 'fixture.retired-group',
					version: '1.0.0',
					core: '^0.0.0',
					capabilities: { [group]: [] } as never,
				}),
			).toThrow(`capabilities contains unknown option: ${group}`)
		},
	)
	it.each([
		'capability:decorate',
		'capability:replace',
		'schema:replace',
		'runtime:replace',
	])('rejects the retired %s privilege', (name) => {
		expect(() =>
			definePlugin({
				pluginId: 'fixture.retired-privilege',
				version: '1.0.0',
				core: '^0.0.0',
				privileges: [
					{ name: name as never, reason: 'Invalid retired privilege.' },
				],
			}),
		).toThrow()
		expect(pluginPrivilegeMetadata).not.toHaveProperty(name)
	})
	it('retains the event and diagnostic privilege used by independent product capabilities', () => {
		expect(pluginPrivilegeMetadata).toHaveProperty('runtime:observe')
	})
})
