import { expectTypeOf, test } from 'vitest'

import {
	defineCapability,
	readCurrentCapabilityProvider,
	type CurrentCapabilityProvider,
} from '../../plugin.js'

interface Greeter {
	greet(name: string): string
}

const greeterCapability = defineCapability<Greeter>()({
	capabilityId: 'fixture.current-capability.types',
	version: '1.0.0',
	cardinality: 'single',
	lifetime: 'application',
	compose: ([provider]) => provider,
})

test('types the provider value and attributed calls of one capability', () => {
	const provider = readCurrentCapabilityProvider(greeterCapability)
	expectTypeOf(provider).toEqualTypeOf<
		CurrentCapabilityProvider<typeof greeterCapability> | undefined
	>()
	expectTypeOf<NonNullable<typeof provider>['value']>().toEqualTypeOf<Greeter>()
	expectTypeOf(provider?.run(() => 1)).toEqualTypeOf<number | undefined>()
})
