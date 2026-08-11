import { expectTypeOf, test } from 'vitest'

import {
	decorateCapability,
	defineCapability,
	definePlugin,
	optionalCapability,
	provideCapability,
	replaceCapability,
	requireCapability,
	type CapabilityDecoratorDeclaration,
	type CapabilityReplacementDeclaration,
} from '../index.js'

interface Provider {
	readonly write: (message: string) => Promise<void>
}

interface Consumer {
	readonly record: (message: string) => Promise<void>
}

test('preserves exact provider, decorator, replacement, factory, and reader types', () => {
	const token = defineCapability<Provider, Consumer>()({
		capabilityId: 'fixture.typed-composition',
		version: '1.0.0',
		cardinality: 'single',
		lifetime: 'application',
		compose: ([provider]) => ({ record: provider.write }),
	})
	const required = requireCapability(token, '^1.0.0')
	const optional = optionalCapability(token, '^1.0.0')
	const provider = provideCapability(token, {
		contributionId: 'primary',
		create: ({ capabilities }) => {
			expectTypeOf(capabilities.get(required)).toEqualTypeOf<Consumer>()
			expectTypeOf(capabilities.get(optional)).toEqualTypeOf<
				Consumer | undefined
			>()
			return { value: { write: () => Promise.resolve() } }
		},
	})
	const decorator = decorateCapability(token, {
		contributionId: 'decorator',
		decorate: (consumer) => consumer,
	})
	const replacement = replaceCapability(token, {
		contributionId: 'replacement',
		target: {
			owner: { pluginId: 'fixture.provider', instanceId: 'primary' },
			contributionId: 'primary',
		},
		create: () => ({ value: { write: () => Promise.resolve() } }),
	})
	const plugin = definePlugin({
		pluginId: 'fixture.typed-plugin',
		version: '1.0.0',
		core: '^0.0.0',
		privileges: [
			{ name: 'capability:decorate', reason: 'Typed decorator fixture.' },
			{ name: 'capability:replace', reason: 'Typed replacement fixture.' },
		],
		capabilities: {
			provides: [provider],
			decorates: [decorator],
			replaces: [replacement],
			requires: [required],
			optional: [optional],
		},
		setup: ({ capabilities }) => {
			expectTypeOf(capabilities.get(required)).toEqualTypeOf<Consumer>()
			expectTypeOf(capabilities.get(optional)).toEqualTypeOf<
				Consumer | undefined
			>()
		},
	})

	expectTypeOf(decorator).toEqualTypeOf<
		CapabilityDecoratorDeclaration<typeof token>
	>()
	expectTypeOf(replacement).toEqualTypeOf<
		CapabilityReplacementDeclaration<typeof token>
	>()
	expectTypeOf(plugin.manifest.capabilities.decorates[0]).toEqualTypeOf<
		typeof decorator
	>()
	expectTypeOf(plugin.manifest.capabilities.replaces[0]).toEqualTypeOf<
		typeof replacement
	>()
})

test('rejects multiple decorators and lifetime-incompatible contribution values', () => {
	const multiple = defineCapability<string, readonly string[]>()({
		capabilityId: 'fixture.typed-multiple',
		version: '1.0.0',
		cardinality: 'multiple',
		lifetime: 'declaration',
		compose: (providers) => providers,
	})
	// @ts-expect-error -- Multiple capabilities expose independent providers and cannot be decorated.
	decorateCapability(multiple, {
		contributionId: 'invalid',
		decorate: (consumer) => consumer,
	})

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
