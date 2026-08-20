import { SchemaRegistry } from '../schema/index.js'
import { describe, expect, it } from 'vitest'

import { PluginSetupRegistries } from './setup-registries.js'

describe('PluginSetupRegistries', () => {
	it('exposes only exact frozen setup facades', () => {
		const registries = new PluginSetupRegistries(new SchemaRegistry([]))
		const context = registries.forPlugin('fixture.plugin')

		expect(Object.keys(context).sort()).toStrictEqual([
			'access',
			'adapters',
			'capabilities',
			'constraintCompilers',
			'fieldBuilderMethods',
			'schemas',
			'typegenGraph',
		])
		expect(context).not.toHaveProperty('runtime')
		expect(context).not.toHaveProperty('events')
		expect(context).not.toHaveProperty('pipeline')
		expect(context).not.toHaveProperty('registries')
		expect(context).not.toHaveProperty('services')
		expect(Object.isFrozen(context)).toBe(true)
		expect(registries.forPlugin('fixture.plugin')).toBe(context)
	})
})
