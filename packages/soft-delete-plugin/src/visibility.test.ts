import { onTestFinished, describe, expect, it } from 'vitest'
import {
	MasterAuthority,
	UltimaBase,
	databaseAdapterCapability,
	databaseFilterOperatorCapabilityVersion,
	databasePersistencePlanCapability,
	type DatabaseAdapter,
	type DatabaseFilterOperatorCapability,
	type DatabaseOperationAst,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
	type DatabaseTransactionAdapter,
} from '@ultimabase/core'
import { plugin, provideCapability } from '@ultimabase/core/plugin'

import type { SoftDeleteSchemaOption } from './contracts.js'
import { softDeletePlugin } from './plugin.js'

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

class VisibilityReadAdapter implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
	readonly checkHealth = (): Promise<void> => Promise.resolve()
	readonly capabilities = {
		filterOperators: testDatabaseFilterOperators,
		persistencePlans: databasePersistencePlanCapability,
	}
	readonly requests: DatabaseOperationRequest[] = []

	constructor(private readonly result: unknown) {}

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		this.requests.push(request)
		return Promise.resolve(this.result as DatabaseOperationResult<TOperation>)
	}

	beginTransaction(): Promise<DatabaseTransactionAdapter> {
		throw new TypeError('Visibility read fixture does not execute mutations')
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
const documentSchema = (
	className: string,
	softDelete?: SoftDeleteSchemaOption,
) =>
	VisibilitySchemaApplication.Schema.define({
		className,
		...(softDelete === undefined ? {} : { softDelete }),
		fields: (field) => ({ title: field.string({ required: true }) }),
	})

const activeRow = {
	createdAt: '2026-09-10T00:00:00.000Z',
	id: '019d0000-0000-7000-8000-000000000001',
	isDeleted: false,
	title: 'visible',
	updatedAt: '2026-09-10T00:00:00.000Z',
}

describe('soft-delete visibility', () => {
	it('keeps the active-row predicate private from contradictory developer filters', async () => {
		const Document = documentSchema('SoftDeleteVisibleDocument', 'explicit')
		const adapter = new VisibilityReadAdapter([])
		const ultimabase = new (VisibilitySchemaApplication.use(
			databasePlugin(adapter),
		))({ logger: false, schemas: [Document] })
		onTestFinished(() => ultimabase.dispose())

		try {
			await ultimabase.start()
			await Document.findMany({ where: { isDeleted: { eq: true } } } as never)

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

	it('enforces the same visibility for Master and leaves disabled schemas untouched', async () => {
		const Enabled = documentSchema('SoftDeleteMasterDocument', 'replace-delete')
		const Disabled = documentSchema('SoftDeletePlainDocument', false)
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
			await enabled.dispose()
			await disabled.start()
			await Disabled.findMany(undefined)

			expect(enabledAdapter.requests[0]?.rowFilter).toEqual({
				field: 'isDeleted',
				kind: 'equal',
				value: false,
			})
			expect(disabledAdapter.requests[0]?.rowFilter).toBeUndefined()
		} finally {
			await enabled.dispose()
			await disabled.dispose()
		}
	})
})
