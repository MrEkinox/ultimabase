import { describe, expect, it } from 'vitest'

import { renderPostgresSchemaChange } from './sql-renderer.js'

describe('PostgreSQL schema SQL renderer', () => {
	it('quotes developer-selected identifiers and renders data-preserving renames', () => {
		expect(
			renderPostgresSchemaChange('tenant"one', {
				from: 'Old title',
				kind: 'rename-column',
				table: 'Content.Items',
				to: 'title',
			}),
		).toStrictEqual([
			'ALTER TABLE "tenant""one"."Content.Items" RENAME COLUMN "Old title" TO "title"',
		])
	})

	it('renders a complete table and its declared indexes', () => {
		expect(
			renderPostgresSchemaChange('public', {
				kind: 'create-table',
				table: {
					columns: [
						{
							name: 'id',
							nullable: false,
							primary: true,
							type: 'uuid',
						},
						{
							defaultExpression: "'draft'::text",
							name: 'title',
							nullable: false,
							primary: false,
							type: 'text',
						},
					],
					indexes: [
						{
							columns: ['title'],
							name: 'articles_title_idx',
							unique: true,
						},
					],
					name: 'articles',
				},
			}),
		).toStrictEqual([
			'CREATE TABLE "public"."articles" ("id" uuid NOT NULL PRIMARY KEY, "title" text DEFAULT \'draft\'::text NOT NULL)',
			'CREATE UNIQUE INDEX "articles_title_idx" ON "public"."articles" ("title")',
		])
	})
})
