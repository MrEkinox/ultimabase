import type { AdapterContributionSnapshot } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import type { PostgresPhysicalColumnPayload } from '../adapter-capabilities.js'
import type { DesiredPostgresTable } from './contracts.js'
import { applyPostgresPhysicalContributions } from './physical-contributions.js'

const table: DesiredPostgresTable = {
	columns: [
		{
			name: 'id',
			nullable: false,
			primary: true,
			type: 'uuid',
		},
	],
	foreignKeys: [],
	indexes: [],
	name: 'workflow_items',
}

const contribution: AdapterContributionSnapshot<PostgresPhysicalColumnPayload> =
	{
		adapterId: 'ultimabase.postgres',
		contributionId: 'workflow-state',
		family: 'physical-schema',
		instanceId: 'primary',
		normalizedStaticOptions: { nullable: true },
		packageVersion: '2.0.0',
		payload: {
			column: { name: 'workflow_state', nullable: true, type: 'text' },
			kind: 'column',
			table: 'workflow_items',
		},
		pluginId: 'fixture.workflow-postgres',
		protocolVersion: 1,
	}

describe('PostgreSQL physical contributions', () => {
	it('compiles attributed columns without changing the logical catalog', () => {
		const compiled = applyPostgresPhysicalContributions([table], [contribution])

		expect(compiled).toStrictEqual([
			{
				...table,
				columns: [
					...table.columns,
					{
						name: 'workflow_state',
						nullable: true,
						primary: false,
						type: 'text',
					},
				],
			},
		])
		expect(table.columns).toHaveLength(1)
	})

	it('rejects unknown targets and physical column conflicts', () => {
		expect(() =>
			applyPostgresPhysicalContributions(
				[table],
				[
					{
						...contribution,
						payload: { ...contribution.payload, table: 'missing' },
					},
				],
			),
		).toThrow(expect.objectContaining({ code: 'PLUGIN_DECLARATION_INVALID' }))
		expect(() =>
			applyPostgresPhysicalContributions(
				[table],
				[
					{
						...contribution,
						payload: {
							...contribution.payload,
							column: { name: 'id', nullable: false, type: 'uuid' },
						},
					},
				],
			),
		).toThrow(expect.objectContaining({ code: 'PLUGIN_CAPABILITY_CONFLICT' }))
	})
})
