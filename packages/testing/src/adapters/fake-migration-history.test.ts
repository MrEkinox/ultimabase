import type { AdapterContributionSnapshot } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import { FakeAdapterMigrationHistory } from './fake-migration-history.js'

const physical = (
	version: string,
	contributionId = 'column',
): AdapterContributionSnapshot => ({
	adapterId: 'fixture.database',
	contributionId,
	family: 'physical-schema',
	normalizedStaticOptions: {},
	packageVersion: version,
	payload: { column: 'workflow_state' },
	pluginId: 'fixture.workflow',
	protocolVersion: 1,
})

describe('FakeAdapterMigrationHistory', () => {
	it('keeps snapshots isolated and reports orphaned metadata', () => {
		const previous = physical('1.0.0', 'removed')
		const history = new FakeAdapterMigrationHistory([previous])
		const next = history.accept([])

		expect(history.plan([]).orphaned).toStrictEqual([
			{ previous, reason: 'plugin-or-contribution-removed' },
		])
		expect(history.snapshots).toStrictEqual([previous])
		expect(next.snapshots).toStrictEqual([])
		expect(next).not.toBe(history)
	})

	it('retains Core missing-upgrade diagnostics', () => {
		const history = new FakeAdapterMigrationHistory([physical('1.0.0')])

		expect(() => history.plan([physical('2.0.0')])).toThrow(
			expect.objectContaining({ code: 'PLUGIN_ADAPTER_CAPABILITY_MISSING' }),
		)
	})
})
