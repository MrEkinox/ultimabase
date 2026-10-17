import { describe, expect, it } from 'vitest'

import {
	describePostgresSchemaChange,
	explainPostgresSynchronizationFailure,
	summarizePostgresSchemaChanges,
} from './change-description.js'
import type { PostgresSchemaChange } from './contracts.js'

const requiredHeadline = {
	kind: 'add-column',
	table: 'posts',
	column: { name: 'headline', nullable: false, primary: false, type: 'text' },
} satisfies PostgresSchemaChange

describe('PostgreSQL schema change descriptions', () => {
	it('names tables, columns and types without values', () => {
		expect(describePostgresSchemaChange(requiredHeadline)).toBe(
			'add column "posts"."headline" (text, required)',
		)
		expect(
			describePostgresSchemaChange({
				kind: 'rename-column',
				table: 'posts',
				from: 'title',
				to: 'headline',
			}),
		).toBe('rename column "posts"."title" to "headline"')
		expect(
			describePostgresSchemaChange({
				kind: 'set-column-nullability',
				table: 'posts',
				column: 'views',
				nullable: true,
			}),
		).toBe('make "posts"."views" optional')
	})

	it('lists ten changes and counts the rest', () => {
		const changes = Array.from({ length: 12 }, (_, index) => ({
			...requiredHeadline,
			table: `table_${String(index)}`,
		}))
		const summary = summarizePostgresSchemaChanges(changes)

		expect(summary.split('; add column')).toHaveLength(10)
		expect(summary.endsWith('; and 2 more')).toBe(true)
	})

	// Regression: renaming a required field without renamedFrom failed with an
	// opaque "synchronization failed" message.
	it('explains a NOT NULL violation on a new required column', () => {
		expect(
			explainPostgresSynchronizationFailure(requiredHeadline, '23502'),
		).toContain('renamedFrom')
		expect(
			explainPostgresSynchronizationFailure(requiredHeadline, '42P07'),
		).toBe('')
		expect(
			explainPostgresSynchronizationFailure(
				{
					...requiredHeadline,
					column: { ...requiredHeadline.column, nullable: true },
				},
				'23502',
			),
		).toBe('')
	})

	// ADR-0340: a default makes an existing column NOT NULL; rows created
	// before may hold null there.
	it('names nullable: true when an existing column becomes NOT NULL', () => {
		expect(
			explainPostgresSynchronizationFailure(
				{
					kind: 'set-column-nullability',
					table: 'orders',
					column: 'status',
					nullable: false,
				},
				'23502',
			),
		).toContain('`nullable: true` beside a default')
	})
})
