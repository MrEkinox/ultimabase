import { expectTypeOf, test } from 'vitest'

import {
	defineExtensions,
	defineFieldExtension,
	defineSchemaExtension,
	type SchemaExtension,
} from '../index.js'

interface FixturePluginConfig {
	mode: 'strict' | 'permissive'
}

const fixtureSchemaPlugin = <const TConfig extends FixturePluginConfig>(
	config: TConfig,
): SchemaExtension<'fixture.permissions', TConfig> =>
	defineSchemaExtension('fixture.permissions', config)

test('preserves fixture plugin names and configuration literals', () => {
	const extension = fixtureSchemaPlugin({ mode: 'strict' })

	// Plugins retain their exact configuration without Schema knowing its meaning.
	expectTypeOf(extension.scope).toEqualTypeOf<'schema'>()
	expectTypeOf(extension.name).toEqualTypeOf<'fixture.permissions'>()
	expectTypeOf(extension.config.mode).toEqualTypeOf<'strict'>()
})

test('shares one discriminated contract across schema and field extensions', () => {
	const extensions = defineExtensions([
		defineSchemaExtension('fixture.schema', { mode: 'strict' }),
		defineFieldExtension('fixture.field', { redact: true }),
	])
	const inspect = (extension: (typeof extensions)[number]): void => {
		if (extension.name === 'fixture.schema') {
			expectTypeOf(extension.scope).toEqualTypeOf<'schema'>()
			expectTypeOf(extension.config).toEqualTypeOf<
				Readonly<{ readonly mode: 'strict' }>
			>()
		} else {
			expectTypeOf(extension.scope).toEqualTypeOf<'field'>()
			expectTypeOf(extension.config).toEqualTypeOf<
				Readonly<{ readonly redact: true }>
			>()
		}
	}

	// Direct inspection uses discriminants instead of assertions or deep imports.
	expectTypeOf(inspect).toEqualTypeOf<
		(extension: (typeof extensions)[number]) => void
	>()
})
