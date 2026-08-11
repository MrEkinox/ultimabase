import { expectTypeOf, test } from 'vitest'

import {
	defineCapability,
	definePlugin,
	optionalCapability,
	provideCapability,
	requireCapability,
	type CapabilityConsumerValue,
	type CapabilityProviderValue,
} from '../index.js'

interface AuditProvider {
	readonly write: (entry: { readonly message: string }) => Promise<void>
}

interface AuditConsumer {
	readonly record: (message: string) => Promise<void>
}

test('preserves exact provider, consumer, protocol, and manifest types', () => {
	const token = defineCapability<AuditProvider, AuditConsumer>()({
		capabilityId: 'fixture.audit',
		version: '3.1.0',
		cardinality: 'single',
		lifetime: 'application',
	})
	const provider = provideCapability(token)
	const required = requireCapability(token, '^3.0.0')
	const optional = optionalCapability(token, '^3.1.0')
	const plugin = definePlugin({
		pluginId: 'fixture.audit-plugin',
		version: '1.0.0',
		core: '^0.0.0',
		capabilities: {
			provides: [provider] as const,
			requires: [required] as const,
			optional: [optional] as const,
		},
	})

	expectTypeOf<
		CapabilityProviderValue<typeof token>
	>().toEqualTypeOf<AuditProvider>()
	expectTypeOf<
		CapabilityConsumerValue<typeof token>
	>().toEqualTypeOf<AuditConsumer>()
	expectTypeOf(token.capabilityId).toEqualTypeOf<'fixture.audit'>()
	expectTypeOf(token.version).toEqualTypeOf<'3.1.0'>()
	expectTypeOf(token.cardinality).toEqualTypeOf<'single'>()
	expectTypeOf(token.lifetime).toEqualTypeOf<'application'>()
	expectTypeOf(plugin.manifest.capabilities.provides[0]).toEqualTypeOf<
		typeof provider
	>()
	expectTypeOf(plugin.manifest.capabilities.requires[0]).toEqualTypeOf<
		typeof required
	>()
	expectTypeOf(plugin.manifest.capabilities.optional[0]).toEqualTypeOf<
		typeof optional
	>()
})

test('rejects values and provider phases that do not match the token', () => {
	const declarationToken = defineCapability<{
		readonly format: 'json'
	}>()({
		capabilityId: 'fixture.audit-format',
		version: '1.0.0',
		cardinality: 'single',
		lifetime: 'declaration',
	})
	const applicationToken = defineCapability<AuditProvider>()({
		capabilityId: 'fixture.audit-runtime',
		version: '1.0.0',
		cardinality: 'single',
		lifetime: 'application',
	})

	provideCapability(declarationToken, { format: 'json' })
	// @ts-expect-error -- Declaration providers require their exact value.
	provideCapability(declarationToken)
	// @ts-expect-error -- Provider values retain their exact protocol shape.
	provideCapability(declarationToken, { format: 'text' })
	provideCapability(applicationToken)
	// @ts-expect-error -- Application factories and values arrive only in issue 1404.
	provideCapability(applicationToken, {
		write: () => Promise.resolve(),
	})
})
