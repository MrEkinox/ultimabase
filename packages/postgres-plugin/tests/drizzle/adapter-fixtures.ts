import { SchemaRegistry, UltimaBase } from '@ultimabase/core'

import { createPostgresDatabaseAdapter } from '../../src/drizzle/adapter.js'

import { PostgresSchemaCatalog } from '../../src/schema/catalog.js'
import {
	FixtureDriver,
	FixturePool,
} from '../../src/drizzle/database-adapter.test-fixture.js'

export const articleSchema = UltimaBase.Schema.define({
	className: 'Article',
	fields: (field) => ({
		note: field.string(),
		title: field.string({ required: true }),
		views: field.int(),
	}),
})

export const pointerUserSchema = UltimaBase.Schema.define({
	className: 'AdapterPointerUser',
	fields: (field) => ({ name: field.string() }),
})
export const pointerPostSchema = UltimaBase.Schema.define({
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

export const relationTargetSchema = UltimaBase.Schema.define({
	className: 'AdapterRelationTarget',
	fields: (field) => ({
		label: field.string(),
		visible: field.boolean(),
	}),
})
export const relationSourceSchema = UltimaBase.Schema.define({
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

export const createFixture = (transactionCount = 1, connectError?: Error) => {
	const driver = new FixtureDriver()
	const transactionDrivers = Array.from(
		{ length: transactionCount },
		() => new FixtureDriver(),
	)
	const pool = new FixturePool(driver, transactionDrivers, connectError)
	const adapter = createPostgresDatabaseAdapter(
		pool,
		new PostgresSchemaCatalog([articleSchema]),
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
