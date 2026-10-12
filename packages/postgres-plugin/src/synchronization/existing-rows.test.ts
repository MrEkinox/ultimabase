import { describe, expect, it } from 'vitest'

import type { PostgresSchemaChange } from './contracts.js'
import {
	applyExistingRows,
	describeExistingRows,
	findMissingExistingRows,
	type PostgresExistingRowsColumn,
} from './existing-rows.js'

// ADR-0321 decision 8: a required column added to a table with rows takes the
// value its field declares for existing rows.
const addColumn = (
	existingRows: NonNullable<
		Extract<
			PostgresSchemaChange,
			{ kind: 'add-column' }
		>['column']['existingRows']
	>,
): Extract<PostgresSchemaChange, { kind: 'add-column' }> => ({
	column: {
		defaultExpression: `'{}'::jsonb`,
		existingRows,
		field: 'acl',
		name: 'acl',
		nullable: false,
		primary: false,
		type: 'jsonb',
	},
	kind: 'add-column',
	table: 'posts',
})

describe('PostgreSQL existing rows', () => {
	it('adds the column with the existing-rows value, then restores its default', () => {
		const change = addColumn({ expression: `'{"a":1}'::jsonb` })
		const columns: PostgresExistingRowsColumn[] = [
			{ change, existingRows: change.column.existingRows },
		]

		expect(applyExistingRows([change], columns)).toStrictEqual([
			{
				...change,
				column: { ...change.column, defaultExpression: `'{"a":1}'::jsonb` },
			},
			{
				column: 'acl',
				expression: `'{}'::jsonb`,
				kind: 'set-column-default',
				table: 'posts',
			},
		])
		expect(describeExistingRows(columns)).toBe(
			` Existing rows of "posts" would receive '{"a":1}'::jsonb in "acl".`,
		)
		expect(findMissingExistingRows(columns)).toStrictEqual([])
	})

	it('leaves empty tables unchanged and reports missing values', () => {
		const empty = addColumn({ expression: `'{}'::jsonb` })
		const missing = addColumn({ missing: 'Declare existingRows.' })
		const columns: PostgresExistingRowsColumn[] = [
			{ change: empty, existingRows: undefined },
			{ change: missing, existingRows: missing.column.existingRows },
		]

		expect(applyExistingRows([empty, missing], columns)).toStrictEqual([
			empty,
			missing,
		])
		expect(describeExistingRows(columns)).toBe(' Declare existingRows.')
		expect(findMissingExistingRows(columns)).toStrictEqual([
			'Declare existingRows.',
		])
	})
})
