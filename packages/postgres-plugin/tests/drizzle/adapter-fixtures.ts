import { Schema, SchemaRegistry } from '@ultimabase/core'
import { isPlainRecord } from '@ultimabase/shared'

import { createPostgresDatabaseAdapter } from '../../src/drizzle/adapter.js'

import type { PostgresConstraintCompilerRegistry } from '../../src/constraints/compiler.js'
import {
	postgresConstraintCompiler,
	type PostgresConstraintCompilerDefinition,
} from '../../src/constraints/definition.js'
import { PostgresSchemaCatalog } from '../../src/schema/catalog.js'
import {
	FixtureDriver,
	FixturePool,
} from '../../src/drizzle/database-adapter.test-fixture.js'

export const articleSchema = Schema.define({
	className: 'Article',
	fields: (field) => ({
		note: field.string(),
		title: field.string({ required: true }),
		views: field.int(),
	}),
})

export const pointerUserSchema = Schema.define({
	className: 'AdapterPointerUser',
	fields: (field) => ({ name: field.string() }),
})
export const pointerPostSchema = Schema.define({
	className: 'AdapterPointerPost',
	fields: (field) => ({
		author: field.pointer({ target: 'AdapterPointerUser' }),
	}),
})
export const pointerRegistry = new SchemaRegistry([
	pointerUserSchema,
	pointerPostSchema,
])
export const pointerCatalog = new PostgresSchemaCatalog(
	pointerRegistry.values(),
	pointerRegistry.resolveSchemaTargets(),
)

export const relationTargetSchema = Schema.define({
	className: 'AdapterRelationTarget',
	fields: (field) => ({
		label: field.string(),
		visible: field.boolean(),
	}),
})
export const relationSourceSchema = Schema.define({
	className: 'AdapterRelationSource',
	fields: (field) => ({
		targets: field.relation({ target: 'AdapterRelationTarget' }),
	}),
})
export const relationRegistry = new SchemaRegistry([
	relationSourceSchema,
	relationTargetSchema,
])
export const relationCatalog = new PostgresSchemaCatalog(
	relationRegistry.values(),
	relationRegistry.resolveSchemaTargets(),
)

export const decodeTenantPayload = (
	payload: unknown,
): { readonly tenantId: string } => {
	if (!isPlainRecord(payload) || typeof payload.tenantId !== 'string') {
		throw new TypeError('invalid tenant payload')
	}

	return { tenantId: payload.tenantId }
}

export const tenantCompiler = postgresConstraintCompiler({
	kind: 'fixture.tenant',
	version: 1,
	decode: decodeTenantPayload,
	compile: ({ field, payload, sql }) =>
		sql`${field('note')} = ${payload.tenantId}`,
})
export const visibilityCompiler = postgresConstraintCompiler({
	kind: 'fixture.visibility',
	version: 1,
	decode: (payload) => {
		if (typeof payload !== 'string') {
			throw new TypeError('invalid visibility payload')
		}

		return payload
	},
	compile: ({ field, payload, sql }) => sql`${field('title')} = ${payload}`,
})

/** Creates one live-looking read view without duplicating Core registry behavior. */
export const createConstraintCompilerRegistry = (
	...definitions: readonly PostgresConstraintCompilerDefinition[]
): PostgresConstraintCompilerRegistry => {
	const contributions = definitions.map((definition) => ({
		definition,
		ownerPlugin: 'fixture.constraint-owner',
	}))

	return Object.freeze({ values: () => contributions })
}

export const createFixture = (
	transactionCount = 1,
	connectError?: Error,
	constraintCompilers?: PostgresConstraintCompilerRegistry,
) => {
	const driver = new FixtureDriver()
	const transactionDrivers = Array.from(
		{ length: transactionCount },
		() => new FixtureDriver(),
	)
	const pool = new FixturePool(driver, transactionDrivers, connectError)
	const adapter = createPostgresDatabaseAdapter(
		pool,
		new PostgresSchemaCatalog([articleSchema]),
		constraintCompilers,
	)

	return { adapter, driver, pool, transactionDrivers }
}

export const getTransactionDriver = (
	fixture: ReturnType<typeof createFixture>,
	index = 0,
): FixtureDriver => {
	const driver = fixture.transactionDrivers[index]

	if (driver === undefined) {
		throw new TypeError('Missing transaction fixture driver')
	}

	return driver
}

export const firstId = '0198c3d4-1000-7000-8000-000000000001'
export const secondId = '0198c3d4-1000-7000-8000-000000000002'
export const timestamp = '2026-08-01T10:00:00.000Z'

export const articleRow = (
	note: string | null,
	title: string,
	views: number,
	id: string,
): readonly unknown[] => [note, title, views, id, timestamp, timestamp]
