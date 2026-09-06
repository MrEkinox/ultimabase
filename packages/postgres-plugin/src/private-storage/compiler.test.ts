import {
	Schema,
	stringField,
	uuidField,
	type GenericField,
	type PrivateStorageAdapterCollection,
	type PrivateStorageAdapterField,
} from '@ultimabase/core'
import { immutableRecord } from '@ultimabase/shared'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import { PostgresSchemaCatalog } from '../schema/catalog.js'
import { compilePostgresPrivateCollection } from './compiler.js'

const Account = Schema.define({
	className: 'PrivateStorageAccount',
	fields: (field) => ({ name: field.string() }),
})

const fieldPlan = (field: GenericField): PrivateStorageAdapterField =>
	immutableRecord({
		create: immutableRecord({
			field,
			kind: 'scalar' as const,
			nullable: false,
			presence: 'required' as const,
		}),
		update: immutableRecord({
			field,
			kind: 'scalar' as const,
			nullable: false,
			presence: 'optional' as const,
		}),
	})

const privateCollection = (
	instanceId: string,
	onDelete: 'cascade' | 'fail' = 'cascade',
): PrivateStorageAdapterCollection =>
	immutableRecord({
		contributionId: 'credentials',
		fields: immutableRecord({
			accountId: fieldPlan(uuidField({ required: true })),
			secret: fieldPlan(stringField({ required: true })),
		}),
		indexes: [{ fields: ['accountId'] }, { fields: ['secret'] }],
		normalizedStaticOptions: immutableRecord({ algorithm: 'fixture-v1' }),
		owner: immutableRecord({ instanceId, pluginId: 'fixture.private' }),
		packageVersion: '2.0.0',
		protocolVersion: 1,
		references: [{ field: 'accountId', onDelete, target: Account }],
	})

describe('PostgreSQL private collection compiler', () => {
	it('compiles hashed owner-isolated tables, unique indexes, and public references', () => {
		const catalog = new PostgresSchemaCatalog([Account])
		const first = compilePostgresPrivateCollection(
			privateCollection('first'),
			catalog,
		)
		const second = compilePostgresPrivateCollection(
			privateCollection('second', 'fail'),
			catalog,
		)
		const firstConfig = getTableConfig(first.table)
		const secondConfig = getTableConfig(second.table)

		expect(first.tableName).toMatch(/^_ub_private_[a-f0-9]{32}$/u)
		expect(first.tableName).not.toBe(second.tableName)
		expect(first.tableName).not.toContain('credentials')
		expect(firstConfig.indexes).toHaveLength(2)
		expect(firstConfig.indexes.every((index) => index.config.unique)).toBe(true)
		expect(firstConfig.foreignKeys[0]?.onDelete).toBe('cascade')
		expect(secondConfig.foreignKeys[0]?.onDelete).toBe('restrict')
		expect(first.definition).toMatchObject({
			owner: { instanceId: 'first', pluginId: 'fixture.private' },
			packageVersion: '2.0.0',
			protocolVersion: 1,
		})
	})

	it('keeps private tables out of public schema lookup while including physical intent', () => {
		const catalog = new PostgresSchemaCatalog([Account])
		const collection = privateCollection('configured')
		catalog.configurePrivateStorage([collection])

		expect(catalog.values()).toHaveLength(1)
		expect(catalog.privateValues()).toHaveLength(1)
		expect(catalog.tableNames()).toHaveLength(2)
		expect(() => catalog.getPrivateCollection({ ...collection })).toThrow(
			'PostgreSQL private collection is not registered',
		)
	})
})
