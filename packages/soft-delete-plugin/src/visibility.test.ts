import { onTestFinished, describe, expect, it } from 'vitest'
import {
	MasterAuthority,
	UltimaBase,
	databaseAdapterCapability,
	databaseFilterOperatorCapabilityVersion,
	databasePersistencePlanCapability,
	type DatabaseAdapter,
	type DatabaseFilterOperatorCapability,
} from '@ultimabase/core'
import { plugin, provideCapability } from '@ultimabase/core/plugin'

import { softDeletePlugin } from './plugin.js'
import { ScriptedTestDatabase } from '../../../tooling/vitest/test-database.js'

/** Declares the built-in operators these fixtures filter with (ADR-0301). */
const testDatabaseFilterOperators: DatabaseFilterOperatorCapability = {
	kind: 'filter-operators',
	version: databaseFilterOperatorCapabilityVersion,
	families: {
		boolean: ['equal', 'not-equal', 'null'],
		string: ['equal', 'not-equal', 'in', 'starts-with', 'null'],
		uuid: ['equal', 'not-equal', 'in', 'not-in', 'null'],
	},
}

class VisibilityReadAdapter extends ScriptedTestDatabase {
	constructor(result: unknown) {
		super({
			capabilities: {
				filterOperators: testDatabaseFilterOperators,
				persistencePlans: databasePersistencePlanCapability,
			},
			description: 'Visibility read fixture',
			result,
		})
	}
}

const databasePlugin = (adapter: DatabaseAdapter) =>
	plugin({
		core: '^0.0.0',
		id: 'fixture.soft-delete-database',
		version: '1.0.0',
		contributions: [
			provideCapability(databaseAdapterCapability, {
				contributionId: 'database-adapter',
				create: () => ({ value: adapter }),
			}),
		],
	})

const VisibilitySchemaApplication = UltimaBase.use(softDeletePlugin())
const declareDocument = (className: string) =>
	VisibilitySchemaApplication.Schema.define({
		className,
		fields: (field) => ({ title: field.string({ required: true }) }),
	})

const activeRow = {
	createdAt: '2026-09-10T00:00:00.000Z',
	deletedAt: null,
	id: '019d0000-0000-7000-8000-000000000001',
	isDeleted: false,
	title: 'visible',
	updatedAt: '2026-09-10T00:00:00.000Z',
}

describe('soft-delete visibility', () => {
	it('keeps the active-row predicate private from contradictory developer filters', async () => {
		const Document = VisibilitySchemaApplication.Schema.define({
			className: 'SoftDeleteVisibleDocument',
			fields: (field) => ({ title: field.string({ required: true }) }),
			softDelete: { mode: 'command' },
		})
		const adapter = new VisibilityReadAdapter([])
		const ultimabase = new (VisibilitySchemaApplication.use(
			databasePlugin(adapter),
		))({ logger: false, schemas: [Document] })
		onTestFinished(() => ultimabase.dispose())

		try {
			await ultimabase.start()
			await Document.findMany({ where: { isDeleted: { eq: true } } })

			expect(adapter.requests).toHaveLength(1)
			expect(adapter.requests[0]).toMatchObject({
				operation: {
					query: {
						where: {
							expression: {
								field: 'isDeleted',
								kind: 'equal',
								value: true,
							},
						},
					},
				},
				rowFilter: { field: 'isDeleted', kind: 'equal', value: false },
			})
		} finally {
			await ultimabase.dispose()
		}
	})

	it('keeps the filter for Master unless its where names isDeleted, and leaves disabled schemas untouched', async () => {
		const Enabled = VisibilitySchemaApplication.Schema.define({
			className: 'SoftDeleteMasterDocument',
			fields: (field) => ({ title: field.string({ required: true }) }),
			softDelete: true,
		})
		const Disabled = declareDocument('SoftDeletePlainDocument')
		const enabledAdapter = new VisibilityReadAdapter([activeRow])
		const enabled = new (VisibilitySchemaApplication.use(
			databasePlugin(enabledAdapter),
		))({
			masterAuthority: new MasterAuthority({
				keys: [{ id: 'soft-delete-master', value: 'unused' }],
				onUse: () => undefined,
			}),
			logger: false,
			schemas: [Enabled],
		})
		onTestFinished(() => enabled.dispose())
		const disabledAdapter = new VisibilityReadAdapter([
			{
				createdAt: activeRow.createdAt,
				id: activeRow.id,
				title: activeRow.title,
				updatedAt: activeRow.updatedAt,
			},
		])
		const disabled = new (VisibilitySchemaApplication.use(
			databasePlugin(disabledAdapter),
		))({ logger: false, schemas: [Disabled] })
		onTestFinished(() => disabled.dispose())

		try {
			await enabled.start()
			await Enabled.findMany(undefined, {
				useMasterKey: true,
			})
			await Enabled.findMany(
				{ where: { NOT: { title: 'x', isDeleted: true } } },
				{ useMasterKey: true },
			)
			// No policy grants `readDeleted` to anonymous callers (fail-closed).
			await Enabled.findMany({ where: { isDeleted: true } })
			await enabled.dispose()
			await disabled.start()
			await Disabled.findMany(undefined)

			const visible = { field: 'isDeleted', kind: 'equal', value: false }
			// Master's default read keeps the trash filter (ADR-0317, 6.1 amendment).
			expect(enabledAdapter.requests[0]?.rowFilter).toEqual(visible)
			// Any condition on isDeleted in its own where, even under NOT, lifts it.
			expect(enabledAdapter.requests[1]?.rowFilter).toBeUndefined()
			// A non-holder naming isDeleted still gets the filter.
			expect(enabledAdapter.requests[2]?.rowFilter).toEqual(visible)
			expect(disabledAdapter.requests[0]?.rowFilter).toBeUndefined()
		} finally {
			await enabled.dispose()
			await disabled.dispose()
		}
	})
})
