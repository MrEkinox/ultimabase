import { describe, expect, it } from 'vitest'

import {
	defineExtensions,
	defineFieldExtension,
	defineSchemaExtension,
	type SchemaExtension,
} from '../src/index.js'

interface FixturePluginConfig {
	mode: 'strict' | 'permissive'
}

const fixtureSchemaPlugin = <const TConfig extends FixturePluginConfig>(
	config: TConfig,
): SchemaExtension<'fixture.permissions', TConfig> =>
	defineSchemaExtension('fixture.permissions', config)

describe('typed extensions', () => {
	it('lets a fixture plugin contribute immutable opaque configuration', () => {
		const source: FixturePluginConfig = { mode: 'strict' }
		const extension = fixtureSchemaPlugin(source)

		source.mode = 'permissive'

		expect(extension).toStrictEqual({
			scope: 'schema',
			name: 'fixture.permissions',
			config: { mode: 'strict' },
		})
		expect(Object.isFrozen(extension)).toBe(true)
		expect(Object.isFrozen(extension.config)).toBe(true)
	})

	it('returns a frozen copy of an extension list', () => {
		const source = [fixtureSchemaPlugin({ mode: 'strict' })]
		const extensions = defineExtensions(source)

		source.push(fixtureSchemaPlugin({ mode: 'strict' }))

		expect(extensions).toHaveLength(1)
		expect(Object.isFrozen(extensions)).toBe(true)
	})

	it('rejects duplicate names within one scope', () => {
		const first = fixtureSchemaPlugin({ mode: 'strict' })
		const second = fixtureSchemaPlugin({ mode: 'permissive' })

		expect(() => defineExtensions([first, second])).toThrow(
			new TypeError('Duplicate schema extension: fixture.permissions'),
		)
	})

	it('allows the same name in schema and field scopes', () => {
		const schemaExtension = fixtureSchemaPlugin({ mode: 'strict' })
		const fieldExtension = defineFieldExtension('fixture.permissions', {
			mode: 'strict',
		})

		expect(defineExtensions([schemaExtension, fieldExtension])).toHaveLength(2)
	})
})
