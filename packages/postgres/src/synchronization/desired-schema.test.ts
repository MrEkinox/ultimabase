import { Schema, intField, stringField } from '@ultimabase/schema'
import { describe, expect, it } from 'vitest'

import { postgresColumn } from '../naming/column.js'
import { compilePostgresSchema } from '../schema/schema-compiler.js'
import { compileDesiredPostgresTables } from './desired-schema.js'

describe('desired PostgreSQL schema', () => {
	it('detaches columns, defaults, identities, renames, and indexes', () => {
		const schema = compilePostgresSchema(
			new Schema({
				className: 'Article',
				fields: {
					sequence: intField({ autoIncrement: true }),
					title: stringField({
						default: "editor's draft",
						extensions: [postgresColumn({ renamedFrom: 'headline' })],
						indexed: 'unique',
					}),
				},
			}),
		)

		const [table] = compileDesiredPostgresTables([schema])

		expect(table).toBeDefined()
		expect(table?.name).toBe('articles')
		expect(table?.columns.slice(0, 2)).toMatchObject([
			{ identity: 'byDefault', name: 'sequence', type: 'bigint' },
			{
				defaultExpression: "'editor''s draft'::text",
				name: 'title',
				renamedFrom: 'headline',
				type: 'text',
			},
		])
		expect(table?.indexes).toMatchObject([{ columns: ['title'], unique: true }])
	})
})
