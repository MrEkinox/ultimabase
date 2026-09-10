import {
	MasterAuthority,
	Schema,
	UltimaBase,
	databaseAdapterCapability,
	databasePersistencePlanCapability,
	definePlugin,
	provideCapability,
	type DatabaseAdapter,
	type DatabaseOperationAst,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
	type DatabaseTransactionAdapter,
} from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import type { SoftDeleteSchemaOption } from './contracts.js'
import { softDeletePlugin } from './plugin.js'

class VisibilityReadAdapter implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
	readonly capabilities = {
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
	definePlugin({
		core: '^0.0.0',
		pluginId: 'fixture.soft-delete-database',
		version: '1.0.0',
		capabilities: {
			provides: [
				provideCapability(databaseAdapterCapability, {
					contributionId: 'database-adapter',
					create: () => ({ value: adapter }),
				}),
			],
		},
	})

const documentSchema = (
	className: string,
	softDelete?: SoftDeleteSchemaOption,
) =>
	Schema.define({
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
		const ultimabase = new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [softDeletePlugin(), databasePlugin(adapter)],
			schemas: [Document],
		})

		try {
			await ultimabase.start()
			await Document.findMany({ where: { isDeleted: { eq: true } } } as never, {
				ultimabase,
			})

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
		const enabled = new UltimaBase({
			masterAuthority: new MasterAuthority({
				keys: [{ id: 'soft-delete-master', value: 'unused' }],
				onUse: () => undefined,
			}),
			pluginPrivileges: { logger: false },
			plugins: [softDeletePlugin(), databasePlugin(enabledAdapter)],
			schemas: [Enabled],
		})
		const disabledAdapter = new VisibilityReadAdapter([
			{
				createdAt: activeRow.createdAt,
				id: activeRow.id,
				title: activeRow.title,
				updatedAt: activeRow.updatedAt,
			},
		])
		const disabled = new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [softDeletePlugin(), databasePlugin(disabledAdapter)],
			schemas: [Disabled],
		})

		try {
			await enabled.start()
			await disabled.start()
			await Enabled.findMany(undefined, {
				ultimabase: enabled,
				useMasterKey: true,
			})
			await Disabled.findMany(undefined, { ultimabase: disabled })

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
