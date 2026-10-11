import {
	databaseAdapterCapability,
	stringField,
	UltimaBase,
	type SchemaDefinition,
} from '@ultimabase/core'
import {
	addSchemaField,
	contributeApplication,
	contributeDeclarations,
	plugin,
	provideCapability,
} from '@ultimabase/core/plugin'
import { describe, expect, it } from 'vitest'

import { PreparedMutationTestAdapter } from '../../../../tooling/vitest/prepared-mutation-adapter.js'
import { compilePostgresSelection } from '../schema/contracts.js'
import { compilePostgresSchema } from '../schema/schema-compiler.test-support.js'
import {
	preparePostgresRecord,
	projectPostgresRecord,
	readPostgresRecord,
} from './record.js'
import { compilePostgresUpdate } from './update-compiler.js'

// Regression for a reference defect (documented in docs/rebuild/DIFFERENCES.md):
// Core accepts a field named `__proto__` (a schema patch names fields with a
// plain string), but the reference PostgreSQL adapter built selections, record
// copies, update sets and projections with plain assignment
// (`selection[field] = ...`). For that field the write hit the inherited
// `__proto__` setter instead of creating an own key, so the field silently
// vanished from the built object. The rebuild builds those objects with
// `Object.fromEntries`, keeping an ordinary own key.
//
// Drizzle's own `pgTable` assigns columns onto its table object, so a column
// keyed `__proto__` corrupts that object and an end-to-end write targets the
// wrong relation in both versions. These checks therefore exercise the
// adapter's own builders instead of a PostgreSQL round trip.

const protoField = '__proto__'

/** Adds an own enumerable `__proto__` data key, as `JSON.parse` would. */
const withOwnProtoKey = <TValue extends object>(
	target: TValue,
	value: unknown,
): TValue =>
	Object.defineProperty(target, protoField, {
		configurable: true,
		enumerable: true,
		value,
		writable: true,
	})

/** Reads the own `__proto__` data value; inherited prototypes never count. */
const readOwnProto = (record: object): unknown =>
	Object.getOwnPropertyDescriptor(record, protoField)?.value

const Item = UltimaBase.Schema.define({
	className: 'PostgresProtoFieldItem',
	fields: (field) => ({ title: field.string() }),
})

/** Resolves the application schema after a patch adds the `__proto__` field. */
const resolvePatchedSchema = async (): Promise<SchemaDefinition> => {
	const resolved: SchemaDefinition[] = []
	const patch = plugin({
		contributions: [
			contributeDeclarations({
				schema: ({ schemas }) => {
					schemas.patch({
						operations: [
							addSchemaField({
								contributionId: 'proto-field',
								field: stringField(),
								name: protoField,
							}),
						],
						targets: schemas.select({ className: Item.className }),
					})
				},
			}),
			contributeApplication(({ schemas }) => {
				resolved.push(...schemas.values())
				return {}
			}),
		],
		core: '^0.0.0',
		id: 'fixture.postgres-proto-field',
		permissions: { 'schema:declare': 'Adds a field named __proto__.' },
		version: '1.0.0',
	})
	const database = plugin({
		contributions: [
			provideCapability(databaseAdapterCapability, {
				contributionId: 'database-adapter',
				create: () => ({
					value: new PreparedMutationTestAdapter({
						description: 'PostgreSQL __proto__ field fixture',
						prepare: () =>
							Promise.reject(new TypeError('Unexpected prepared work')),
					}),
				}),
			}),
		],
		core: '^0.0.0',
		id: 'fixture.postgres-proto-field-database',
		version: '1.0.0',
	})
	const ultimabase = new (UltimaBase.use(patch, database))({
		logger: false,
		schemas: [Item],
	})
	try {
		await ultimabase.start()
	} finally {
		await ultimabase.dispose()
	}
	const [schema] = resolved
	if (schema === undefined || !Object.hasOwn(schema.fields, protoField)) {
		throw new TypeError('Expected Core to keep the __proto__ schema field')
	}
	return schema
}

describe('PostgreSQL field named __proto__ (reference defect regression)', () => {
	it('keeps the field as an own key in selections, records, update sets and projections', async () => {
		const schema = compilePostgresSchema(await resolvePatchedSchema())
		const column = schema.fields[protoField]?.column
		if (column === undefined) throw new TypeError('Expected a column')

		// Selections: the reference replaced the selection's prototype instead.
		const selection = compilePostgresSelection(schema, [protoField, 'title'])
		expect(Object.keys(selection).sort()).toStrictEqual([protoField, 'title'])
		expect(readOwnProto(selection)).toBe(column)

		// Record copies, before writes and after reads: the reference dropped
		// the value (a string never changes a prototype).
		const prepared = preparePostgresRecord(
			schema,
			withOwnProtoKey({ title: 'created' }, 'inserted'),
		)
		expect(readOwnProto(prepared)).toBe('inserted')
		const read = readPostgresRecord(
			schema,
			withOwnProtoKey({ title: 'created' }, 'stored'),
		)
		expect(readOwnProto(read)).toBe('stored')

		// Update sets: the reference compiled no assignment for this field.
		const update = compilePostgresUpdate(schema, {
			kind: 'update-expression',
			operations: [{ field: protoField, kind: 'set', value: 'updated' }],
		})
		expect(Object.keys(update)).toStrictEqual([protoField])
		expect(readOwnProto(update)).toBe('updated')

		// Projections of returned records keep the selected field.
		const projected = projectPostgresRecord(
			withOwnProtoKey({ id: 'record-id', title: 'created' }, 'projected'),
			{
				fields: [{ field: protoField, kind: 'selected-field' }],
				kind: 'selection',
			},
		)
		expect(Object.keys(projected)).toStrictEqual([protoField])
		expect(readOwnProto(projected)).toBe('projected')
	})
})
