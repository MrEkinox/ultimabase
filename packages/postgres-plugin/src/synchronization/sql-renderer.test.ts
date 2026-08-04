import { describe, expect, it } from 'vitest'

import { renderPostgresSchemaChange } from './sql-renderer.js'

describe('PostgreSQL schema SQL renderer', () => {
	it('renders quoted pointer constraints and referential actions', () => {
		expect(
			renderPostgresSchemaChange('tenant"one', {
				foreignKey: {
					column: 'author',
					name: 'posts_author_fk',
					onDelete: 'setNull',
					targetColumn: 'id',
					targetTable: 'User.Items',
				},
				kind: 'add-foreign-key',
				table: 'Post.Items',
			}),
		).toStrictEqual([
			'ALTER TABLE "tenant""one"."Post.Items" ADD CONSTRAINT "posts_author_fk" FOREIGN KEY ("author") REFERENCES "tenant""one"."User.Items" ("id") ON DELETE SET NULL',
		])
	})

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
					foreignKeys: [],
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
