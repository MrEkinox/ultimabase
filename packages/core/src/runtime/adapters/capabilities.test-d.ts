import { expectTypeOf, test } from 'vitest'

import {
	requireCapability,
	type CapabilityConsumerValue,
} from '../../plugins/capabilities.js'
import {
	adapterSupport,
	adapterValueStorageCapability,
	provideAdapterCapability,
} from './capabilities.js'
import {
	defineAdapterContributionCapability,
	provideAdapterContribution,
	type AdapterContributionSnapshot,
} from './contributions.js'
import {
	defineAdapterRawCapability,
	type AdapterAccess,
	type AdapterRawFacade,
} from './raw-access.js'

interface FixtureRawFacade {
	readonly dialect: 'fixture'
	read(key: string): Promise<unknown>
}

declare const adapters: AdapterAccess

test('preserves exact adapter support, contribution, and raw facade types', () => {
	const support = adapterSupport({
		adapterId: 'fixture.database',
		family: 'value-storage' as const,
		formats: ['json'] as const,
	})
	const supportProvider = provideAdapterCapability(
		adapterValueStorageCapability,
		{ contributionId: 'json', value: support },
	)
	expectTypeOf(supportProvider.token).toEqualTypeOf<
		typeof adapterValueStorageCapability
	>()

	const contributionToken = defineAdapterContributionCapability<
		Readonly<{ readonly column: string }>
	>()({
		adapterId: 'fixture.database',
		capabilityId: 'fixture.database-physical',
		family: 'physical-schema',
		version: '1.0.0',
	})
	provideAdapterContribution(contributionToken, {
		contributionId: 'column',
		payload: { column: 'workflow_state' },
		protocolVersion: 1,
	})
	expectTypeOf<
		CapabilityConsumerValue<typeof contributionToken>
	>().toEqualTypeOf<
		readonly AdapterContributionSnapshot<
			Readonly<{ readonly column: string }>
		>[]
	>()

	const rawToken = defineAdapterRawCapability<FixtureRawFacade>()({
		capabilityId: 'fixture.database-raw',
		version: '1.0.0',
	})
	const rawRequirement = requireCapability(rawToken, '^1.0.0')
	void adapters.withRaw(rawRequirement, (facade) => {
		expectTypeOf(facade).toEqualTypeOf<FixtureRawFacade>()
		return facade.read('key')
	})
	expectTypeOf<
		AdapterRawFacade<typeof rawToken>
	>().toEqualTypeOf<FixtureRawFacade>()
})
