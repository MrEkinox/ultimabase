import {
	Schema,
	type QueryBuilder,
	type QueryFilterNode,
} from '@ultimabase/core'
import { PgDialect } from 'drizzle-orm/pg-core'

import { compilePostgresSchema } from '../../src/schema/schema-compiler.test-support.js'
import { compilePostgresFilter } from '../../src/query/filter-compiler.js'

export const FilterSchema = Schema.define({
	className: 'FilterFixture',
	fields: (field) => ({
		active: field.boolean(),
		attachment: field.binary(),
		birthday: field.date(),
		count: field.int(),
		eventAt: field.dateTime(),
		exact: field.decimal(),
		huge: field.bigint(),
		hugeValues: field.bigint({ list: true }),
		metadata: field.json(),
		profile: field.object({
			fields: (field) => ({
				label: field.string(),
				stats: field.object({ fields: (field) => ({ exact: field.bigint() }) }),
			}),
		}),
		rating: field.float(),
		status: field.enum({ values: ['draft', 'published'] }),
		title: field.string(),
		tags: field.string({ list: true }),
		token: field.uuid(),
		wakeAt: field.time(),
	}),
})

const compiledSchema = compilePostgresSchema(FilterSchema)
export const dialect = new PgDialect()

const renderFilter = (filter: QueryFilterNode<typeof FilterSchema>) =>
	dialect.sqlToQuery(compilePostgresFilter(filter, compiledSchema))

export const renderQuery = (query: QueryBuilder<typeof FilterSchema>) => {
	const expression = query.ast.where?.expression

	if (expression === undefined) {
		throw new TypeError('Filter compiler fixture requires a where expression')
	}

	return renderFilter(expression)
}
