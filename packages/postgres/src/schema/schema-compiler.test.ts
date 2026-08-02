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
	stringField,
	timeField,
	uuidField,
} from '@ultimabase/schema'
import { getTableConfig, type PgColumn } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'

import { postgresColumn } from '../naming/column.js'
import { compilePostgresSchema } from './schema-compiler.js'

const indexColumns = (
	columns: readonly PgColumn[],
): Readonly<Record<string, PgColumn>> =>
	Object.fromEntries(columns.map((column) => [column.name, column]))

describe('PostgreSQL primitive schema compiler', () => {
	it('maps every built-in scalar and structured value to explicit metadata', () => {
		const runtimeDefault = vi.fn(() => 'runtime')
		const schema = new Schema({
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
		expect(columns.runtime).toMatchObject({ hasDefault: false, notNull: true })
		expect(columns.active).toMatchObject({
			default: true,
			hasDefault: true,
			notNull: true,
		})
		expect(columns.counter?.generatedIdentity?.type).toBe('byDefault')
		expect(columns.status?.enumValues).toStrictEqual(['draft', 'live'])
		expect(columns.document?.default).toStrictEqual({ valid: true })
		expect(columns.labels?.default).toStrictEqual(['one', 'two'])
		expect(runtimeDefault).not.toHaveBeenCalled()
	})

	it('keeps optional nullable fields physically nullable', () => {
		const schema = new Schema({
			className: 'NullableFixture',
			fields: {
				nullable: stringField({
					default: 'fallback',
					validation: { nullable: true },
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
		const schema = new Schema({
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
		const nestedIndexSchema = new Schema({
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
		const pluginSchema = new Schema({
			className: 'PluginFieldFixture',
			fields: { custom: pluginField },
		})
		const invalidSequenceSchema = new Schema({
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
		const duplicateSource = new Schema({
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
		const declaredSource = new Schema({
			className: 'DeclaredRenameFixture',
			fields: {
				legacy: stringField(),
				title: stringField({
					extensions: [postgresColumn({ renamedFrom: 'legacy' })],
				}),
			},
		})
		const nestedRename = new Schema({
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
