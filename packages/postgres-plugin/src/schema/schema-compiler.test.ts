import {
	definePluginField,
	pointerField,
	Schema,
	Pointer,
	SchemaRegistry,
} from '@ultimabase/core'
import { getTableConfig, type PgColumn } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'

import { PostgresSchemaCatalog } from './catalog.js'
import {
	mapPostgresColumnFromDriver,
	mapPostgresColumnToDriver,
} from './column-value.test-support.js'
import { compilePostgresSchema } from './schema-compiler.js'
import { createPostgresPointerFixture } from './pointer-fixture.test-support.js'

const indexColumns = (
	columns: readonly PgColumn[],
): Readonly<Record<string, PgColumn>> =>
	Object.fromEntries(columns.map((column) => [column.name, column]))

describe('PostgreSQL primitive schema compiler', () => {
	it('compiles pointers to UUID columns, indexes, and named foreign keys', () => {
		const { catalog, Post, User } = createPostgresPointerFixture()
		const compiled = catalog.get(Post)
		const table = getTableConfig(compiled.table)
		const [foreignKey] = table.foreignKeys
		const reference = foreignKey?.reference()
		const authorColumn = compiled.fields.author?.column
		const author = new Pointer(User, '018f0f8c-7b5a-7cc9-98db-123456789abc')

		expect(compiled.fields.author).toMatchObject({
			column: { notNull: true },
			storage: 'uuid',
		})
		expect(table.indexes).toHaveLength(1)
		expect(foreignKey?.onDelete).toBe('cascade')
		expect(foreignKey?.isNameExplicit()).toBe(true)
		expect(reference?.columns.map(({ name }) => name)).toStrictEqual(['author'])
		expect(reference?.foreignColumns.map(({ name }) => name)).toStrictEqual([
			'id',
		])
		expect(reference?.foreignTable).toBe(catalog.get(User).table)
		if (authorColumn === undefined) {
			throw new TypeError('Expected the author column')
		}

		expect(mapPostgresColumnToDriver(authorColumn, author)).toBe(author.id)
		expect(mapPostgresColumnFromDriver(authorColumn, author.id)).toSatisfy(
			(value: unknown) => author.equals(value),
		)
	})

	it('rejects pointer compilation without a closed application graph', () => {
		const User = Schema.define({
			className: 'DetachedUser',
			fields: () => ({}),
		})
		const Post = Schema.define({
			className: 'DetachedPost',
			fields: () => ({
				author: pointerField({ target: () => User }),
			}),
		})

		expect(() => compilePostgresSchema(Post)).toThrow(
			new TypeError(
				'PostgreSQL pointer target is unavailable: DetachedPost.author',
			),
		)
	})

	it('resolves circular pointer tables before Drizzle evaluates foreign keys', () => {
		const Left = Schema.define({
			className: 'CircularLeft',
			fields: (field) => ({
				right: field.pointer({ target: 'CircularRight' }),
			}),
		})

		const Right = Schema.define({
			className: 'CircularRight',
			fields: (field) => ({
				left: field.pointer({ target: 'CircularLeft' }),
			}),
		})

		const registry = new SchemaRegistry([Left, Right])
		const catalog = new PostgresSchemaCatalog(
			registry.values(),
			registry.resolveSchemaTargets(),
		)

		expect(getTableConfig(catalog.get(Left).table).foreignKeys).toHaveLength(1)
		expect(getTableConfig(catalog.get(Right).table).foreignKeys).toHaveLength(1)
	})

	it('maps every built-in scalar and structured value to explicit metadata', () => {
		const runtimeDefault = vi.fn(() => 'runtime')
		const schema = Schema.define({
			className: 'PrimitiveFixture',
			fields: (field) => ({
				active: field.boolean({ default: true }),
				amount: field.decimal({
					validation: { precision: 12, scale: 4 },
				}),
				birthday: field.date(),
				blob: field.binary({ default: Uint8Array.from([1, 2]) }),
				count: field.int(),
				counter: field.int({ autoIncrement: true }),
				document: field.json({ default: { valid: true } }),
				eventAt: field.dateTime({ timezone: false }),
				huge: field.bigint({ default: 9007199254740993n }),
				labels: field.string({ list: true, default: ['one', 'two'] }),
				optional: field.string(),
				profile: field.object({
					fields: (field) => ({ name: field.string() }),
				}),
				rating: field.float({ default: 4.5 }),
				required: field.string({ validation: { required: true } }),
				runtime: field.string({ default: runtimeDefault }),
				status: field.enum({ values: { Draft: 'draft', Live: 'live' } }),
				token: field.uuid(),
				wakeAt: field.time({ timezone: true }),
			}),
		})
		const compiled = compilePostgresSchema(schema)
		const tableConfig = getTableConfig(compiled.table)
		const columns = indexColumns(tableConfig.columns)
		const sqlTypes = Object.fromEntries(
			tableConfig.columns.map((column) => [column.name, column.getSQLType()]),
		)

		expect(tableConfig.name).toBe('primitive_fixtures')
		expect(sqlTypes).toMatchObject({
			active: 'boolean',
			amount: 'numeric(12, 4)',
			birthday: 'date',
			blob: 'bytea',
			count: 'bigint',
			counter: 'bigint',
			createdAt: 'timestamp(3) with time zone',
			document: 'jsonb',
			eventAt: 'timestamp(3)',
			huge: 'bigint',
			id: 'uuid',
			labels: 'jsonb',
			profile: 'jsonb',
			rating: 'double precision',
			status: 'text',
			token: 'uuid',
			updatedAt: 'timestamp(3) with time zone',
			wakeAt: 'time(3) with time zone',
		})
		expect(columns.id).toMatchObject({
			hasDefault: false,
			notNull: true,
			primary: true,
		})
		expect(compiled.fields.id?.generation).toStrictEqual({
			on: 'create',
			uuidVersion: 7,
		})
		expect(compiled.fields.createdAt?.generation).toStrictEqual({
			on: 'create',
		})
		expect(compiled.fields.updatedAt?.generation).toStrictEqual({
			on: 'createAndUpdate',
		})
		expect(columns.required?.notNull).toBe(true)
		expect(columns.optional?.notNull).toBe(false)
		expect(columns.runtime).toMatchObject({ hasDefault: false, notNull: false })
		expect(columns.active).toMatchObject({
			default: true,
			hasDefault: true,
			notNull: false,
		})
		expect(columns.counter?.generatedIdentity?.type).toBe('byDefault')
		expect(columns.blob?.columnType).toBe('PgBytea')
		expect(columns.eventAt?.columnType).toBe('PgTimestampString')
		expect(columns.status?.enumValues).toStrictEqual(['draft', 'live'])
		expect(columns.wakeAt?.columnType).toBe('PgTime')
		expect(columns.document?.default).toStrictEqual({ valid: true })
		expect(columns.labels?.default).toStrictEqual(['one', 'two'])
		expect(runtimeDefault).not.toHaveBeenCalled()
	})

	it('keeps optional nullable fields physically nullable', () => {
		const schema = Schema.define({
			className: 'NullableFixture',
			fields: (field) => ({
				nullable: field.string({
					default: 'fallback',
				}),
			}),
		})
		const column = getTableConfig(
			compilePostgresSchema(schema).table,
		).columns.find((candidate) => candidate.name === 'nullable')

		expect(column).toMatchObject({
			default: 'fallback',
			hasDefault: true,
			notNull: false,
		})
	})

	it('keeps structured defaults logical and lets the Drizzle column encode them', () => {
		const schema = Schema.define({
			className: 'StructuredDefaultFixture',
			fields: (field) => ({
				profile: field.object({
					fields: (field) => ({
						avatar: field.binary(),
						count: field.bigint(),
						seenAt: field.dateTime(),
					}),
					default: {
						avatar: Uint8Array.from([255]),
						count: 42n,
						seenAt: '2026-08-01T10:00:00.000Z',
					},
				}),
			}),
		})
		const column = getTableConfig(
			compilePostgresSchema(schema).table,
		).columns.find((candidate) => candidate.name === 'profile')

		expect(column?.default).toStrictEqual({
			avatar: Uint8Array.from([255]),
			count: 42n,
			seenAt: '2026-08-01T10:00:00.000Z',
		})
		if (column === undefined) {
			throw new TypeError('Expected the profile column')
		}

		expect(mapPostgresColumnToDriver(column, column.default)).toStrictEqual({
			avatar: '/w==',
			count: '42',
			seenAt: '2026-08-01T10:00:00.000Z',
		})
	})

	it('rejects nested indexes, unsupported plugin fields, and invalid sequence combinations', () => {
		const nestedIndexSchema = Schema.define({
			className: 'NestedIndexFixture',
			fields: (field) => ({
				profile: field.object({
					fields: (field) => ({ email: field.string({ indexed: true }) }),
				}),
			}),
		})
		const pluginField = definePluginField(
			'fixture.custom',
			{},
			{
				snapshotValue: (value: unknown): string => {
					if (typeof value !== 'string') {
						throw new TypeError('custom value must be a string')
					}

					return value
				},
			},
		)
		const pluginSchema = Schema.define({
			className: 'PluginFieldFixture',
			fields: () => ({ custom: pluginField }),
		})
		const invalidSequenceSchema = Schema.define({
			className: 'InvalidSequenceFixture',
			fields: (field) => ({
				sequence: field.int({ autoIncrement: true, default: 1 }),
			}),
		})

		expect(() => compilePostgresSchema(nestedIndexSchema)).toThrow(
			new TypeError(
				'PostgreSQL cannot compile nested index without an extension: profile.email',
			),
		)
		expect(() => compilePostgresSchema(pluginSchema)).toThrow(
			new TypeError(
				'No PostgreSQL field compiler is registered for kind: fixture.custom',
			),
		)
		expect(() => compilePostgresSchema(invalidSequenceSchema)).toThrow(
			new TypeError(
				'PostgreSQL autoIncrement cannot be combined with default: sequence',
			),
		)
	})

	it('rejects ambiguous or nested PostgreSQL rename metadata', () => {
		const duplicateSource = Schema.define({
			className: 'DuplicateRenameFixture',
			fields: (field) => ({
				first: field.string({ postgres: { renamedFrom: 'legacy' } }),
				second: field.string({ postgres: { renamedFrom: 'legacy' } }),
			}),
		})
		const declaredSource = Schema.define({
			className: 'DeclaredRenameFixture',
			fields: (field) => ({
				legacy: field.string(),
				title: field.string({ postgres: { renamedFrom: 'legacy' } }),
			}),
		})
		const nestedRename = Schema.define({
			className: 'NestedRenameFixture',
			fields: (field) => ({
				profile: field.object({
					fields: (field) => ({
						title: field.string({
							postgres: { renamedFrom: 'headline' },
						}),
					}),
				}),
			}),
		})

		expect(() => compilePostgresSchema(duplicateSource)).toThrow(
			new TypeError('Duplicate PostgreSQL renamedFrom source: legacy'),
		)
		expect(() => compilePostgresSchema(declaredSource)).toThrow(
			new TypeError(
				'PostgreSQL renamedFrom must not be a declared field: legacy',
			),
		)
		expect(() => compilePostgresSchema(nestedRename)).toThrow(
			new TypeError(
				'PostgreSQL renamedFrom requires a top-level column: profile.title',
			),
		)
	})
})
