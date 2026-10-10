import { immutableRecord } from '@ultimabase/shared'
import { describe, expect, it, vi } from 'vitest'

import { fieldPath, type FindManyOperationAst } from '../../query/index.js'
import { definePluginField } from '../../schema/index.js'
import type {
	DatabaseAdapterCapabilities,
	DatabaseOperationExecutor,
} from '../database/contracts.js'
import { databasePluginFieldStructuralContainsCapability } from '../database/contracts.js'
import { assertDatabaseRequestCapabilities } from './database-capability-validation.js'
import { UltimaBase } from '../application/ultima-base.js'
import { QueryBuilder } from '../../plugin.js'

const containedField = definePluginField(
	'fixture.capability.contained',
	{},
	{
		snapshotValue: (value: unknown) => value,
		storageCodec: {
			decode: (value) => value,
			encode: (value) => value,
			format: 'json',
			version: 1,
		},
		structuralContains: {
			snapshotOperand: (value: unknown) => value,
		},
	},
)

const fixtureSchema = UltimaBase.Schema.define({
	className: 'PluginContainmentCapabilityFixture',
	fields: (field) => ({
		nested: field.object({ fields: () => ({ containedField }) }),
		containedField,
	}),
})

const operation = {
	kind: 'find-many',
	query: new QueryBuilder(fixtureSchema).where((where) =>
		where.contains('containedField', { partial: true }),
	).ast,
} satisfies FindManyOperationAst<typeof fixtureSchema>

const nestedOperation = {
	kind: 'find-many',
	query: new QueryBuilder(fixtureSchema).where((where) =>
		where.contains(fieldPath('nested', ['containedField']), { nested: true }),
	).ast,
} satisfies FindManyOperationAst<typeof fixtureSchema>

const createExecutor = (
	capabilities?: DatabaseAdapterCapabilities,
): Readonly<{
	execute: ReturnType<typeof vi.fn>
	executor: DatabaseOperationExecutor
}> => {
	const execute = vi.fn()
	return {
		execute,
		executor: {
			...(capabilities === undefined ? {} : { capabilities }),
			execute,
		},
	}
}

describe('database plugin field containment capability validation', () => {
	it.each([operation, nestedOperation])(
		'rejects unsupported containment before adapter execution',
		(candidate) => {
			const { execute, executor } = createExecutor()

			expect(() => {
				assertDatabaseRequestCapabilities(executor, {
					operation: candidate,
				})
			}).toThrow(
				'must implement plugin field structural containment capability',
			)
			expect(execute).not.toHaveBeenCalled()
		},
	)

	it('accepts the exact versioned marker and rejects stale markers', () => {
		expect(() => {
			assertDatabaseRequestCapabilities(
				createExecutor({
					pluginFieldStructuralContains:
						databasePluginFieldStructuralContainsCapability,
				}).executor,
				{ operation },
			)
		}).not.toThrow()

		const stale: NonNullable<
			DatabaseAdapterCapabilities['pluginFieldStructuralContains']
		> = immutableRecord({
			kind: 'plugin-field-structural-contains',
			version: 0,
		}) as unknown as NonNullable<
			DatabaseAdapterCapabilities['pluginFieldStructuralContains']
		>

		expect(() => {
			assertDatabaseRequestCapabilities(
				createExecutor({ pluginFieldStructuralContains: stale }).executor,
				{ operation },
			)
		}).toThrow('capability version 1')
	})
})
