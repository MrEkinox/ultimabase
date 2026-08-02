import { Query, type QueryFilterNode } from '@ultimabase/core'
import {
	bigintField,
	binaryField,
	booleanField,
	dateField,
	dateTimeField,
	decimalField,
	Schema,
	enumField,
	floatField,
	intField,
	jsonField,
	stringField,
	timeField,
	uuidField,
} from '@ultimabase/core'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import { compilePostgresSchema } from '../schema/schema-compiler.js'
import { compilePostgresFilter } from './filter-compiler.js'

const FilterSchema = new Schema({
	className: 'FilterFixture',
	fields: {
		active: booleanField(),
		attachment: binaryField(),
		birthday: dateField(),
		count: intField(),
		eventAt: dateTimeField(),
		exact: decimalField(),
		huge: bigintField(),
		metadata: jsonField(),
		rating: floatField(),
		status: enumField({ values: ['draft', 'published'] }),
		title: stringField({ validation: { nullable: true } }),
		token: uuidField(),
		wakeAt: timeField(),
	},
})

const compiledSchema = compilePostgresSchema(FilterSchema)
const dialect = new PgDialect()

const renderFilter = (filter: QueryFilterNode<typeof FilterSchema>) =>
	dialect.sqlToQuery(compilePostgresFilter(filter, compiledSchema))

const renderQuery = (query: Query<typeof FilterSchema>) => {
	const expression = query.ast.where?.expression

	if (expression === undefined) {
		throw new TypeError('Filter compiler fixture requires a where expression')
	}

	return renderFilter(expression)
}

describe('PostgreSQL filter compiler', () => {
	it('compiles every primitive operator through Drizzle parameters', () => {
		const cases: readonly {
			readonly fragment: string
			readonly query: Query<typeof FilterSchema>
		}[] = [
			{
				fragment: ' = $1',
				query: new Query(FilterSchema).equalTo('title', 'a'),
			},
			{
				fragment: ' <> $1',
				query: new Query(FilterSchema).notEqualTo('title', 'a'),
			},
			{
				fragment: ' > $1',
				query: new Query(FilterSchema).greaterThan('count', 1),
			},
			{
				fragment: ' >= $1',
				query: new Query(FilterSchema).greaterThanOrEqualTo('count', 1),
			},
			{
				fragment: ' < $1',
				query: new Query(FilterSchema).lessThan('count', 1),
			},
			{
				fragment: ' <= $1',
				query: new Query(FilterSchema).lessThanOrEqualTo('count', 1),
			},
			{
				fragment: ' in ($1, $2)',
				query: new Query(FilterSchema).containedIn('status', [
					'draft',
					'published',
				]),
			},
			{
				fragment: ' not in ($1)',
				query: new Query(FilterSchema).notContainedIn('status', ['draft']),
			},
			{
				fragment: ' LIKE $1',
				query: new Query(FilterSchema).contains('title', 'a'),
			},
			{
				fragment: ' LIKE $1',
				query: new Query(FilterSchema).startsWith('title', 'a'),
			},
			{
				fragment: ' LIKE $1',
				query: new Query(FilterSchema).endsWith('title', 'a'),
			},
			{
				fragment: ' ~ $1',
				query: new Query(FilterSchema).matches('title', {
					source: '^a',
					flags: [],
				}),
			},
			{
				fragment: ' is not null',
				query: new Query(FilterSchema).exists('title'),
			},
			{
				fragment: ' is null',
				query: new Query(FilterSchema).doesNotExist('title'),
			},
		]

		for (const fixture of cases) {
			expect(renderQuery(fixture.query).sql).toContain(fixture.fragment)
		}
	})

	it('preserves SQL null semantics for equality and membership', () => {
		const equalNull = renderQuery(
			new Query(FilterSchema).equalTo('title', null),
		)
		const includesNull = renderQuery(
			new Query(FilterSchema).containedIn('title', ['draft', null]),
		)
		const excludesNull = renderQuery(
			new Query(FilterSchema).notContainedIn('title', ['draft', null]),
		)

		expect(equalNull.params).toStrictEqual([])
		expect(equalNull.sql).toContain(' is null')
		expect(includesNull.params).toStrictEqual(['draft'])
		expect(includesNull.sql).toMatch(/in \(\$1\).*or.*is null/u)
		expect(excludesNull.params).toStrictEqual(['draft'])
		expect(excludesNull.sql).toMatch(/not in \(\$1\).*and.*is not null/u)
		expect(
			renderQuery(new Query(FilterSchema).containedIn('title', [])),
		).toMatchObject({
			params: [],
			sql: 'false',
		})
	})

	it('compiles logical trees without changing declaration order', () => {
		const published = new Query(FilterSchema).equalTo('status', 'published')
		const popular = new Query(FilterSchema).greaterThan('count', 10)
		const query = published
			.or(popular)
			.not(new Query(FilterSchema).equalTo('active', false))
		const rendered = renderQuery(query)

		expect(rendered.params).toStrictEqual(['published', 10, false])
		expect(rendered.sql).toMatch(/\(.* or .*\) and not /u)
	})

	it('encodes exact and structured values through compiled field codecs', () => {
		const bytes = Uint8Array.from([1, 2, 3])
		const bigintQuery = renderQuery(
			new Query(FilterSchema).equalTo('huge', 9_007_199_254_740_993n),
		)
		const binaryQuery = renderQuery(
			new Query(FilterSchema).equalTo('attachment', bytes),
		)
		const jsonQuery = renderQuery(
			new Query(FilterSchema).equalTo('metadata', { nested: true }),
		)

		expect(bigintQuery.params).toStrictEqual([9_007_199_254_740_993n])
		expect(binaryQuery.params).toHaveLength(1)
		expect(binaryQuery.params[0]).toBeInstanceOf(Uint8Array)
		expect(binaryQuery.params[0]).not.toBe(bytes)
		expect(jsonQuery.params).toStrictEqual(['{"nested":true}'])
	})

	it('parameterizes every built-in equality storage family', () => {
		const cases: readonly Query<typeof FilterSchema>[] = [
			new Query(FilterSchema).equalTo('active', true),
			new Query(FilterSchema).equalTo('birthday', '2026-08-01'),
			new Query(FilterSchema).equalTo('count', 42),
			new Query(FilterSchema).equalTo('eventAt', '2026-08-01T10:00:00.000Z'),
			new Query(FilterSchema).equalTo('exact', '123.45'),
			new Query(FilterSchema).equalTo('rating', 4.5),
			new Query(FilterSchema).equalTo('status', 'draft'),
			new Query(FilterSchema).equalTo('title', 'typed'),
			new Query(FilterSchema).equalTo(
				'token',
				'018f0f8c-7b5a-7cc9-98db-123456789abc',
			),
			new Query(FilterSchema).equalTo('wakeAt', '10:30:00.000'),
		]

		for (const query of cases) {
			const rendered = renderQuery(query)

			expect(rendered.sql).toContain(' = $1')
			expect(rendered.params).toHaveLength(1)
		}
	})

	it('keeps injection payloads in parameters and escapes LIKE wildcards', () => {
		const payload = "x%'_\\ OR true --"
		const equality = renderQuery(
			new Query(FilterSchema).equalTo('title', payload),
		)
		const contains = renderQuery(
			new Query(FilterSchema).contains('title', payload),
		)
		const regex = renderQuery(
			new Query(FilterSchema).matches('title', {
				flags: [],
				source: payload,
			}),
		)

		expect(equality.sql).not.toContain(payload)
		expect(equality.params).toStrictEqual([payload])
		expect(contains.sql).not.toContain(payload)
		expect(contains.params).toStrictEqual(["%x\\%'\\_\\\\ OR true --%", '\\'])
		expect(regex.sql).not.toContain(payload)
		expect(regex.params).toStrictEqual([`(?p)${payload}`])
	})

	it('maps independent JavaScript regex newline flags to PostgreSQL modes', () => {
		const cases: readonly {
			readonly flags: readonly (
				'case-insensitive' | 'dot-matches-newline' | 'multiline'
			)[]
			readonly prefix: string
		}[] = [
			{ flags: [], prefix: '(?p)' },
			{ flags: ['multiline'], prefix: '(?n)' },
			{ flags: ['dot-matches-newline'], prefix: '(?s)' },
			{
				flags: ['dot-matches-newline', 'multiline'],
				prefix: '(?w)',
			},
			{ flags: ['case-insensitive'], prefix: '(?p)' },
		]

		for (const fixture of cases) {
			const rendered = renderQuery(
				new Query(FilterSchema).matches('title', {
					flags: fixture.flags,
					source: '^value$',
				}),
			)

			expect(rendered.params).toStrictEqual([`${fixture.prefix}^value$`])

			if (fixture.flags.includes('case-insensitive')) {
				expect(rendered.sql).toContain(' ~* $1')
			}
		}
	})
})
