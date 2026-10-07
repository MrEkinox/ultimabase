import { expectTypeOf, test } from 'vitest'

import {
	applicationSchemaMutationSurfaceCapability,
	type ApplicationSchemaMutationSurface,
	type CapabilityConsumerValue,
} from '../../index.js'

test('schema mutation surface capability retains its exact protocol', () => {
	expectTypeOf(
		applicationSchemaMutationSurfaceCapability.capabilityId,
	).toEqualTypeOf<'ultimabase.application-schema-mutation-surface'>()
	expectTypeOf(
		applicationSchemaMutationSurfaceCapability.version,
	).toEqualTypeOf<'1.0.0'>()
	expectTypeOf<
		CapabilityConsumerValue<typeof applicationSchemaMutationSurfaceCapability>
	>().toEqualTypeOf<ApplicationSchemaMutationSurface>()
})
