import type {
	AdapterContributionSnapshot,
	AdapterMigrationPlan,
} from '@ultimabase/core'
import { expectTypeOf, test } from 'vitest'

import { FakeAdapterMigrationHistory } from './fake-migration-history.js'

test('types immutable adapter migration histories', () => {
	const snapshots: readonly AdapterContributionSnapshot[] = []
	const history = new FakeAdapterMigrationHistory(snapshots)

	expectTypeOf(history.snapshots).toEqualTypeOf<
		readonly AdapterContributionSnapshot[]
	>()
	expectTypeOf(history.plan(snapshots)).toEqualTypeOf<AdapterMigrationPlan>()
	expectTypeOf(
		history.accept(snapshots),
	).toEqualTypeOf<FakeAdapterMigrationHistory>()
})
