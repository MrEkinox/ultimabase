import {
	bigintField,
	binaryField,
	booleanField,
	dateField,
	dateTimeField,
	decimalField,
	definePluginField,
	Schema,
	enumField,
	floatField,
	intField,
	jsonField,
	objectField,
	pointerField,
	stringField,
	timeField,
	uuidField,
	SchemaRegistry,
	type SchemaDefinition,
} from '@ultimabase/core'
import { getTableConfig, type PgColumn } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'

import { postgresColumn } from '../naming/column.js'
import { PostgresSchemaCatalog } from './catalog.js'
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

		expect(compiled.fields.author).toMatchObject({
			column: { notNull: true },
			pointer: {
				onDelete: 'cascade',
				targetColumn: 'id',
				targetSchema: User,
				targetTable: 'pointer_users',
			},
			storage: 'uuid',
		})
		expect(compiled.indexes).toHaveLength(1)
		expect(foreignKey?.onDelete).toBe('cascade')
		expect(foreignKey?.getName()).toBe(
			compiled.fields.author?.pointer?.constraintName,
		)
		expect(reference?.columns.map(({ name }) => name)).toStrictEqual(['author'])
		expect(reference?.foreignColumns.map(({ name }) => name)).toStrictEqual([
			'id',
		])
		expect(reference?.foreignTable).toBe(catalog.get(User).table)
	})

	it('rejects pointer compilation without a closed application graph', () => {
		const User = Schema.define({ className: 'DetachedUser', fields: {} })
		const Post = Schema.define({
			className: 'DetachedPost',
			fields: { author: pointerField({ target: () => User }) },
		})

		expect(() => compilePostgresSchema(Post)).toThrow(
			new TypeError(
				'PostgreSQL pointer target is unavailable: DetachedPost.author',
			),
		)
	})

	it('resolves circular pointer tables before Drizzle evaluates foreign keys', () => {
		const rightReference: { current?: SchemaDefinition } = {}
		const Left = Schema.define({
			className: 'CircularLeft',
			fields: {
				right: pointerField({
					target: () => {
						if (rightReference.current === undefined) {
							throw new TypeError('Circular right schema is unavailable')
						}

						return rightReference.current
					},
				}),
			},
		})

		const Right = Schema.define({
			className: 'CircularRight',
			fields: { left: pointerField({ target: () => Left }) },
		})

		// The lazy target closes the cycle only after both declarations exist.
		rightReference.current = Right

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
			fields: {
				active: booleanField({ default: true }),
				amount: decimalField({
					validation: { precision: 12, scale: 4 },
				}),
				birthday: dateField(),
				blob: binaryField({ default: Uint8Array.from([1, 2]) }),
				count: intField(),
				counter: intField({ autoIncrement: true }),
				document: jsonField({ default: { valid: true } }),
				eventAt: dateTimeField({ timezone: false }),
				huge: bigintField({ default: 9_007_199_254_740_993n }),
				labels: stringField({ list: true, default: ['one', 'two'] }),
				optional: stringField(),
				profile: objectField({ fields: { name: stringField() } }),
				rating: floatField({ default: 4.5 }),
				required: stringField({ validation: { required: true } }),
				runtime: stringField({ default: runtimeDefault }),
				status: enumField({ values: { Draft: 'draft', Live: 'live' } }),
				token: uuidField(),
				wakeAt: timeField({ timezone: true }),
			},
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
		expect(columns.status?.enumValues).toStrictEqual(['draft', 'live'])
		expect(columns.document?.default).toStrictEqual({ valid: true })
		expect(columns.labels?.default).toStrictEqual(['one', 'two'])
		expect(runtimeDefault).not.toHaveBeenCalled()
	})

	it('keeps optional nullable fields physically nullable', () => {
		const schema = Schema.define({
			className: 'NullableFixture',
			fields: {
				nullable: stringField({
					default: 'fallback',
				}),
			},
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

	it('encodes structured static defaults before Drizzle stores JSONB metadata', () => {
		const schema = Schema.define({
			className: 'StructuredDefaultFixture',
			fields: {
				profile: objectField({
					fields: {
						avatar: binaryField(),
						count: bigintField(),
						seenAt: dateTimeField(),
					},
					default: {
						avatar: Uint8Array.from([255]),
						count: 42n,
						seenAt: '2026-08-01T10:00:00.000Z',
					},
				}),
			},
		})
		const column = getTableConfig(
			compilePostgresSchema(schema).table,
		).columns.find((candidate) => candidate.name === 'profile')

		expect(column?.default).toStrictEqual({
			avatar: '/w==',
			count: '42',
			seenAt: '2026-08-01T10:00:00.000Z',
		})
	})

	it('rejects nested indexes, unsupported plugin fields, and invalid sequence combinations', () => {
		const nestedIndexSchema = Schema.define({
			className: 'NestedIndexFixture',
			fields: {
				profile: objectField({
					fields: { email: stringField({ indexed: true }) },
				}),
			},
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
			fields: { custom: pluginField },
		})
		const invalidSequenceSchema = Schema.define({
			className: 'InvalidSequenceFixture',
			fields: { sequence: intField({ autoIncrement: true, default: 1 }) },
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
			fields: {
				first: stringField({
					extensions: [postgresColumn({ renamedFrom: 'legacy' })],
				}),
				second: stringField({
					extensions: [postgresColumn({ renamedFrom: 'legacy' })],
				}),
			},
		})
		const declaredSource = Schema.define({
			className: 'DeclaredRenameFixture',
			fields: {
				legacy: stringField(),
				title: stringField({
					extensions: [postgresColumn({ renamedFrom: 'legacy' })],
				}),
			},
		})
		const nestedRename = Schema.define({
			className: 'NestedRenameFixture',
			fields: {
				profile: objectField({
					fields: {
						title: stringField({
							extensions: [postgresColumn({ renamedFrom: 'headline' })],
						}),
					},
				}),
			},
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
