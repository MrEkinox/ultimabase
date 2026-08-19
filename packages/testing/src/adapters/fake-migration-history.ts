import {
	planAdapterMigrations,
	type AdapterContributionSnapshot,
	type AdapterMigrationPlan,
} from '@ultimabase/core'
import { immutableArray } from '@ultimabase/shared'

/**
 * Retains one immutable migration snapshot for adapter bridge conformance tests.
 *
 * `accept` returns a new history, so one test can compare old and new application
 * graphs without sharing mutable migration state.
 */
export class FakeAdapterMigrationHistory {
	readonly snapshots: readonly AdapterContributionSnapshot[]

	constructor(snapshots: readonly AdapterContributionSnapshot[] = []) {
		this.snapshots = immutableArray(snapshots)
		Object.freeze(this)
	}

	/** Plans an upgrade without inferring destructive work for removed metadata. */
	plan(
		current: readonly AdapterContributionSnapshot[],
		intents: readonly AdapterContributionSnapshot[] = [],
	): AdapterMigrationPlan {
		return planAdapterMigrations(this.snapshots, current, intents)
	}

	/** Creates the next persisted history after an adapter accepts a reviewed plan. */
	accept(
		current: readonly AdapterContributionSnapshot[],
	): FakeAdapterMigrationHistory {
		return new FakeAdapterMigrationHistory(current)
	}
}
