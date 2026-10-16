import { immutableArray, immutableRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import { createApplication } from '../../application/framework-application.js'
import {
	addSchemaField,
	addSchemaIndex,
	contributeDeclarations,
	plugin as createPlugin,
} from '../../plugin.js'
import { stringField, type SchemaDefinition } from '../../schema/index.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'
import { createQueryAst } from '../ast/factory.js'
import { normalizeUniqueUpsertTarget } from './upsert.js'

// ADR-0332 amendment: Runtime accepts the targets the types offer, and only
// those: `id`, unique fields, and non-partial unique indexes of `define`.
const refusal = new TypeError(
	'upsert target must match id, a unique field or one non-partial unique index of define',
)

const Account = UltimaBase.Schema.define({
	className: 'UniqueOriginAccount',
	fields: (field) => ({
		archived: field.boolean(),
		code: field.string(),
		email: field.string({ indexed: 'unique' }),
		handle: field.string(),
		region: field.string(),
		tenant: field.string(),
	}),
	indexes: [
		{ fields: ['tenant', 'handle'], unique: true },
		{
			fields: ['region'],
			unique: true,
			where: { createdAt: { gte: '2026-01-01T00:00:00.000Z' } },
		},
		{ fields: ['code'], unique: true, where: { archived: false } },
	],
})

/** Builds one equality target on the exact definition, as untyped transports do. */
const targetOn = (
	schema: SchemaDefinition,
	values: Readonly<Record<string, string>>,
) => {
	const expressions = Object.entries(values).map(([field, value]) =>
		immutableRecord({ kind: 'equal' as const, field, value }),
	)
	const [first] = expressions

	return immutableRecord({
		...createQueryAst(schema),
		where: immutableRecord({
			kind: 'where' as const,
			expression:
				expressions.length === 1 && first !== undefined
					? first
					: immutableRecord({
							kind: 'and' as const,
							expressions: immutableArray(expressions),
						}),
		}),
	})
}

const normalize = (
	schema: SchemaDefinition,
	values: Readonly<Record<string, string>>,
) => normalizeUniqueUpsertTarget(schema, targetOn(schema, values))

describe('unique target origins', () => {
	it('accepts id, unique fields and complete unique indexes of define', () => {
		expect(normalize(Account, { id: 'a' }).fields).toEqual(['id'])
		expect(normalize(Account, { email: 'a' }).fields).toEqual(['email'])
		expect(normalize(Account, { handle: 'a', tenant: 'b' }).fields).toEqual([
			'tenant',
			'handle',
		])
	})

	it('refuses partial unique indexes', () => {
		// Partial indexes of define, on a system field and on a declared one.
		expect(() => normalize(Account, { region: 'eu' })).toThrow(refusal)
		expect(() => normalize(Account, { code: 'c-1' })).toThrow(refusal)
	})

	it('accepts a unique field a plugin adds, not a unique index it adds', async () => {
		const Member = UltimaBase.Schema.define({
			className: 'UniqueOriginMember',
			fields: (field) => ({ team: field.string(), seat: field.string() }),
		})
		const plugin = createPlugin({
			core: '^0.0.0',
			id: 'fixture.unique-target-origins',
			permissions: { 'schema:declare': 'Adds one unique field and index.' },
			version: '1.0.0',
			contributions: [
				contributeDeclarations({
					schema: ({ schemas }) => {
						schemas.patch({
							operations: [
								addSchemaField({
									contributionId: 'badge',
									field: stringField({ indexed: 'unique' }),
									name: 'badge',
								}),
								addSchemaIndex({
									contributionId: 'team-seat',
									fields: ['team', 'seat'],
									unique: true,
								}),
							],
							targets: schemas.select({ className: Member.className }),
						})

						return undefined
					},
				}),
			],
		})
		const application = await createApplication({
			plugins: [plugin],
			schemas: [Member],
		})

		try {
			expect(normalize(Member, { badge: 'b-1' }).fields).toEqual(['badge'])
			expect(() => normalize(Member, { seat: '1', team: 't' })).toThrow(refusal)
		} finally {
			await application.dispose()
		}
	})
})
