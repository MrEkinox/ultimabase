import { expectTypeOf, test } from 'vitest'

import {
	defineCapability,
	definePlugin,
	optionalCapability,
	provideCapability,
	requireCapability,
	type CompiledSchemaRegistry,
} from '../index.js'

interface Provider {
	readonly write: (message: string) => Promise<void>
}

interface Consumer {
	readonly record: (message: string) => Promise<void>
}

test('preserves exact provider, factory, and reader types', () => {
	const token = defineCapability<Provider, Consumer>()({
		capabilityId: 'fixture.typed-composition',
		version: '1.0.0',
		cardinality: 'single',
		lifetime: 'application',
		compose: ([provider]) => ({ record: provider.write }),
	})
	const required = requireCapability(token, '^1.0.0')
	const optional = optionalCapability(token, '^1.0.0')
	const setupOptional = optionalCapability(token, '^1.0.0', {
		phase: 'setup',
	})
	expectTypeOf(required.phase).toEqualTypeOf<'materialization'>()
	expectTypeOf(optional.phase).toEqualTypeOf<'materialization'>()
	expectTypeOf(setupOptional.phase).toEqualTypeOf<'setup'>()
	const provider = provideCapability(token, {
		contributionId: 'primary',
		create: ({ capabilities, schemas }) => {
			expectTypeOf(schemas).toEqualTypeOf<CompiledSchemaRegistry>()
			expectTypeOf(capabilities.get(required)).toEqualTypeOf<Consumer>()
			expectTypeOf(capabilities.get(optional)).toEqualTypeOf<
				Consumer | undefined
			>()
			// @ts-expect-error -- Factories run before setup-phase requirements become readable.
			capabilities.get(setupOptional)
			return { value: { write: () => Promise.resolve() } }
		},
	})
	const plugin = definePlugin({
		pluginId: 'fixture.typed-plugin',
		version: '1.0.0',
		core: '^0.0.0',
		capabilities: [provider, required, optional, setupOptional],
		setup: ({ capabilities }) => {
			expectTypeOf(capabilities.get(required)).toEqualTypeOf<Consumer>()
			expectTypeOf(capabilities.get(optional)).toEqualTypeOf<
				Consumer | undefined
			>()
			expectTypeOf(capabilities.get(setupOptional)).toEqualTypeOf<
				Consumer | undefined
			>()
		},
	})
	expectTypeOf(plugin.manifest.capabilities.provides[0]).toEqualTypeOf<
		typeof provider
	>()
})

test('rejects lifetime-incompatible contribution values', () => {
	const declaration = defineCapability<{ readonly mode: 'strict' }>()({
		capabilityId: 'fixture.typed-declaration',
		version: '1.0.0',
		cardinality: 'single',
		lifetime: 'declaration',
		compose: ([provider]) => provider,
	})
	provideCapability(declaration, {
		contributionId: 'valid',
		value: { mode: 'strict' },
	})
	provideCapability(declaration, {
		contributionId: 'invalid',
		// @ts-expect-error -- Declaration providers cannot install application factories.
		create: () => ({ value: { mode: 'strict' } }),
	})
})
