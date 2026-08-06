import {
	collectQueryRelationPredicates,
	fieldPath,
	Query,
	relationField,
	type QueryFilterNode,
} from '@ultimabase/core'
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
	objectField,
	pointerField,
	stringField,
	SchemaRegistry,
	timeField,
	uuidField,
} from '@ultimabase/core'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import { compilePostgresSchema } from '../schema/schema-compiler.js'
import { compilePostgresFilter } from './filter-compiler.js'
import { PostgresSchemaCatalog } from '../schema/catalog.js'
import { emptyPostgresConstraintCompilerRegistry } from '../constraints/compiler.js'
import { createPostgresRelationPredicateCompiler } from './relation-predicate-compiler.js'

const FilterSchema = Schema.define({
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
		profile: objectField({
			fields: {
				label: stringField(),
				stats: objectField({ fields: { exact: bigintField() } }),
			},
		}),
		rating: floatField(),
		status: enumField({ values: ['draft', 'published'] }),
		title: stringField(),
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
	it('parameterizes correlated relation predicates and private target Access', () => {
		const Target = Schema.define({
			className: 'FilterRelationTarget',
			fields: { label: stringField(), visible: booleanField() },
		})
		const Source = Schema.define({
			className: 'FilterRelationSource',
			fields: { targets: relationField({ target: () => Target }) },
		})
		const registry = new SchemaRegistry([Source, Target])
		const catalog = new PostgresSchemaCatalog(
			registry.values(),
			registry.resolveSchemaTargets(),
		)
		const query = Source.query().where((where) =>
			where.some('targets', (target) => target.eq('label', 'developer-value')),
		)
		const expression = query.ast.where?.expression

		if (expression === undefined) {
			throw new TypeError('Relation compiler fixture requires an expression')
		}

		const [predicate] = collectQueryRelationPredicates(expression)
		const targetAccess = Target.query().where((where) =>
			where.eq('visible', true),
		).ast.where?.expression

		if (predicate === undefined || targetAccess === undefined) {
			throw new TypeError('Relation compiler fixture is incomplete')
		}

		const compiler = createPostgresRelationPredicateCompiler(
			catalog,
			emptyPostgresConstraintCompilerRegistry,
			[{ constraints: [], predicate, rowFilter: targetAccess }],
		)
		const rendered = dialect.sqlToQuery(
			compilePostgresFilter(expression, catalog.get(Source), compiler),
		)

		expect(rendered.sql.toLowerCase()).toContain('exists')
		expect(rendered.sql).not.toContain('developer-value')
		expect(rendered.params).toContain('developer-value')
		expect(rendered.params).toContain(true)
	})

	it('parameterizes pointer predicates as target UUIDs', () => {
		const User = Schema.define({ className: 'FilterPointerUser', fields: {} })
		const Post = Schema.define({
			className: 'FilterPointerPost',
			fields: { author: pointerField({ target: () => User }) },
		})
		const registry = new SchemaRegistry([User, Post])
		const catalog = new PostgresSchemaCatalog(
			registry.values(),
			registry.resolveSchemaTargets(),
		)
		const pointer = User.pointer('018f0f8c-7b5a-7cc9-98db-123456789abc')
		const expression = new Query(Post).where((where) =>
			where.eq('author', pointer),
		).ast.where?.expression

		if (expression === undefined) {
			throw new TypeError('Pointer filter fixture requires an expression')
		}

		const rendered = dialect.sqlToQuery(
			compilePostgresFilter(expression, catalog.get(Post)),
		)

		expect(rendered.sql).toContain(' = $1')
		expect(rendered.sql).not.toContain(pointer.id)
		expect(rendered.params).toStrictEqual([pointer.id])
	})

	it('compiles every primitive operator through Drizzle parameters', () => {
		const cases: readonly {
			readonly fragment: string
			readonly query: Query<typeof FilterSchema>
		}[] = [
			{
				fragment: ' = $1',
				query: new Query(FilterSchema).where((where) => where.eq('title', 'a')),
			},
			{
				fragment: ' <> $1',
				query: new Query(FilterSchema).where((where) => where.ne('title', 'a')),
			},
			{
				fragment: ' > $1',
				query: new Query(FilterSchema).where((where) => where.gt('count', 1)),
			},
			{
				fragment: ' >= $1',
				query: new Query(FilterSchema).where((where) => where.gte('count', 1)),
			},
			{
				fragment: ' < $1',
				query: new Query(FilterSchema).where((where) => where.lt('count', 1)),
			},
			{
				fragment: ' <= $1',
				query: new Query(FilterSchema).where((where) => where.lte('count', 1)),
			},
			{
				fragment: ' between $1 and $2',
				query: new Query(FilterSchema).where((where) =>
					where.between('count', 1, 10),
				),
			},
			{
				fragment: ' not between $1 and $2',
				query: new Query(FilterSchema).where((where) =>
					where.notBetween('count', 1, 10),
				),
			},
			{
				fragment: ' in ($1, $2)',
				query: new Query(FilterSchema).where((where) =>
					where.in('status', ['draft', 'published']),
				),
			},
			{
				fragment: ' not in ($1)',
				query: new Query(FilterSchema).where((where) =>
					where.notIn('status', ['draft']),
				),
			},
			{
				fragment: ' LIKE $1',
				query: new Query(FilterSchema).where((where) =>
					where.contains('title', 'a'),
				),
			},
			{
				fragment: ' LIKE $1',
				query: new Query(FilterSchema).where((where) =>
					where.startsWith('title', 'a'),
				),
			},
			{
				fragment: ' LIKE $1',
				query: new Query(FilterSchema).where((where) =>
					where.endsWith('title', 'a'),
				),
			},
			{
				fragment: ' ~ $1',
				query: new Query(FilterSchema).where((where) =>
					where.matches('title', {
						source: '^a',
						flags: [],
					}),
				),
			},
			{
				fragment: ' is not null',
				query: new Query(FilterSchema).where((where) =>
					where.isNotNull('title'),
				),
			},
			{
				fragment: ' is null',
				query: new Query(FilterSchema).where((where) => where.isNull('title')),
			},
		]

		for (const fixture of cases) {
			expect(renderQuery(fixture.query).sql).toContain(fixture.fragment)
		}
	})

	it('preserves SQL null semantics for equality and membership', () => {
		const equalNull = renderQuery(
			new Query(FilterSchema).where((where) => where.eq('title', null)),
		)
		const includesNull = renderQuery(
			new Query(FilterSchema).where((where) =>
				where.in('title', ['draft', null]),
			),
		)
		const excludesNull = renderQuery(
			new Query(FilterSchema).where((where) =>
				where.notIn('title', ['draft', null]),
			),
		)

		expect(equalNull.params).toStrictEqual([])
		expect(equalNull.sql).toContain(' is null')
		expect(includesNull.params).toStrictEqual(['draft'])
		expect(includesNull.sql).toMatch(/in \(\$1\).*or.*is null/u)
		expect(excludesNull.params).toStrictEqual(['draft'])
		expect(excludesNull.sql).toMatch(/not in \(\$1\).*and.*is not null/u)
		expect(
			renderQuery(
				new Query(FilterSchema).where((where) => where.in('title', [])),
			),
		).toMatchObject({
			params: [],
			sql: 'false',
		})
	})

	it('compiles logical trees without changing declaration order', () => {
		const query = new Query(FilterSchema).where({
			OR: [{ status: { eq: 'published' } }, { count: { gt: 10 } }],
			NOT: { active: { eq: false } },
		})
		const rendered = renderQuery(query)

		expect(rendered.params).toStrictEqual(['published', 10, false])
		expect(rendered.sql).toMatch(/\(.* or .*\).* and \(not /u)
	})

	it('encodes exact and structured values through compiled field codecs', () => {
		const bytes = Uint8Array.from([1, 2, 3])
		const bigintQuery = renderQuery(
			new Query(FilterSchema).where((where) =>
				where.eq('huge', 9_007_199_254_740_993n),
			),
		)
		const binaryQuery = renderQuery(
			new Query(FilterSchema).where((where) => where.eq('attachment', bytes)),
		)
		const jsonQuery = renderQuery(
			new Query(FilterSchema).where((where) =>
				where.eq('metadata', { nested: true }),
			),
		)

		expect(bigintQuery.params).toStrictEqual([9_007_199_254_740_993n])
		expect(binaryQuery.params).toHaveLength(1)
		expect(binaryQuery.params[0]).toBeInstanceOf(Uint8Array)
		expect(binaryQuery.params[0]).not.toBe(bytes)
		// Drizzle's driver codec owns the final JSON wire serialization in v1.
		expect(jsonQuery.params).toStrictEqual([{ nested: true }])
	})

	it('compiles structural fields and typed paths through JSONB parameters', () => {
		const jsonContains = renderQuery(
			new Query(FilterSchema).where((where) =>
				where.contains('metadata', { nested: true }),
			),
		)
		const objectContains = renderQuery(
			new Query(FilterSchema).where((where) =>
				where.contains('profile', {
					stats: { exact: 9_007_199_254_740_993n },
				}),
			),
		)
		const containedBy = renderQuery(
			new Query(FilterSchema).where((where) =>
				where.containedBy('metadata', {
					nested: true,
					extra: false,
				}),
			),
		)
		const hasKey = renderQuery(
			new Query(FilterSchema).where((where) =>
				where.hasKey('metadata', 'nested'),
			),
		)
		const hasAnyKeys = renderQuery(
			new Query(FilterSchema).where((where) =>
				where.hasAnyKeys('profile', ['label', 'stats']),
			),
		)
		const hasAllKeys = renderQuery(
			new Query(FilterSchema).where((where) =>
				where.hasAllKeys('profile', ['label', 'stats']),
			),
		)
		const pathEquality = renderQuery(
			new Query(FilterSchema).where((where) =>
				where.eq(
					fieldPath('profile', ['stats', 'exact']),
					9_007_199_254_740_993n,
				),
			),
		)
		const pathString = renderQuery(
			new Query(FilterSchema).where((where) =>
				where.contains(fieldPath('profile', ['label']), 'typed'),
			),
		)
		const dynamicPath = renderQuery(
			new Query(FilterSchema).where((where) =>
				where.eq(fieldPath('metadata', ['nested', 'count']), 42),
			),
		)
		const jsonPathExists = renderQuery(
			new Query(FilterSchema).where((where) =>
				where.jsonPathExists('metadata', {
					source: '$.items[*] ? (@.price > $minimum)',
					variables: { minimum: 10 },
				}),
			),
		)
		const jsonPathMatches = renderQuery(
			new Query(FilterSchema).where((where) =>
				where.jsonPathMatches('profile', {
					source: 'exists($.stats ? (@.exact == $expected))',
					variables: { expected: '9007199254740993' },
				}),
			),
		)
		const jsonPathExistsOperator = renderQuery(
			new Query(FilterSchema).where((where) =>
				where.jsonPathExists('metadata', {
					source: '$.items[*]',
				}),
			),
		)
		const jsonPathMatchesOperator = renderQuery(
			new Query(FilterSchema).where((where) =>
				where.jsonPathMatches('profile', {
					source: '$.label == "typed"',
				}),
			),
		)

		expect(jsonContains.sql).toContain(' @> $1::jsonb')
		expect(jsonContains.params).toStrictEqual(['{"nested":true}'])
		expect(objectContains.params).toStrictEqual([
			'{"stats":{"exact":"9007199254740993"}}',
		])
		expect(containedBy.sql).toContain(' <@ $1::jsonb')
		expect(hasKey.sql).toContain(' ? $1')
		expect(hasKey.params).toStrictEqual(['nested'])
		expect(hasAnyKeys.sql).toContain(' ?| $1::text[]')
		expect(hasAnyKeys.params).toStrictEqual([['label', 'stats']])
		expect(hasAllKeys.sql).toContain(' ?& $1::text[]')
		expect(hasAllKeys.params).toStrictEqual([['label', 'stats']])
		expect(pathEquality.sql).toContain(' #> $1::text[] = $2::jsonb')
		expect(pathEquality.params).toStrictEqual([
			['stats', 'exact'],
			'"9007199254740993"',
		])
		expect(pathString.sql).toContain(' #>> $1::text[] LIKE $2')
		expect(pathString.params).toStrictEqual([['label'], '%typed%', '\\'])
		expect(dynamicPath.params).toStrictEqual([['nested', 'count'], '42'])
		expect(jsonPathExists.sql).toContain(
			'jsonb_path_exists("filter_fixtures"."metadata", $1::jsonpath, $2::jsonb, $3)',
		)
		expect(jsonPathExists.params).toStrictEqual([
			'$.items[*] ? (@.price > $minimum)',
			'{"minimum":10}',
			true,
		])
		expect(jsonPathMatches.sql).toContain(
			'jsonb_path_match("filter_fixtures"."profile", $1::jsonpath, $2::jsonb, $3)',
		)
		expect(jsonPathMatches.params).toStrictEqual([
			'exists($.stats ? (@.exact == $expected))',
			'{"expected":"9007199254740993"}',
			true,
		])
		expect(jsonPathExistsOperator.sql).toContain('"metadata" @? $1::jsonpath')
		expect(jsonPathExistsOperator.params).toStrictEqual(['$.items[*]'])
		expect(jsonPathMatchesOperator.sql).toContain('"profile" @@ $1::jsonpath')
		expect(jsonPathMatchesOperator.params).toStrictEqual(['$.label == "typed"'])
	})

	it('parameterizes every built-in equality storage family', () => {
		const cases: readonly Query<typeof FilterSchema>[] = [
			new Query(FilterSchema).where((where) => where.eq('active', true)),
			new Query(FilterSchema).where((where) =>
				where.eq('birthday', '2026-08-01'),
			),
			new Query(FilterSchema).where((where) => where.eq('count', 42)),
			new Query(FilterSchema).where((where) =>
				where.eq('eventAt', '2026-08-01T10:00:00.000Z'),
			),
			new Query(FilterSchema).where((where) => where.eq('exact', '123.45')),
			new Query(FilterSchema).where((where) => where.eq('rating', 4.5)),
			new Query(FilterSchema).where((where) => where.eq('status', 'draft')),
			new Query(FilterSchema).where((where) => where.eq('title', 'typed')),
			new Query(FilterSchema).where((where) =>
				where.eq('token', '018f0f8c-7b5a-7cc9-98db-123456789abc'),
			),
			new Query(FilterSchema).where((where) =>
				where.eq('wakeAt', '10:30:00.000'),
			),
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
			new Query(FilterSchema).where((where) => where.eq('title', payload)),
		)
		const contains = renderQuery(
			new Query(FilterSchema).where((where) =>
				where.contains('title', payload),
			),
		)
		const range = renderQuery(
			new Query(FilterSchema).where((where) =>
				where.between('title', payload, `${payload}z`),
			),
		)
		const regex = renderQuery(
			new Query(FilterSchema).where((where) =>
				where.matches('title', {
					flags: [],
					source: payload,
				}),
			),
		)

		expect(equality.sql).not.toContain(payload)
		expect(equality.params).toStrictEqual([payload])
		expect(contains.sql).not.toContain(payload)
		expect(contains.params).toStrictEqual(["%x\\%'\\_\\\\ OR true --%", '\\'])
		expect(range.sql).not.toContain(payload)
		expect(range.params).toStrictEqual([payload, `${payload}z`])
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
				new Query(FilterSchema).where((where) =>
					where.matches('title', {
						flags: fixture.flags,
						source: '^value$',
					}),
				),
			)

			expect(rendered.params).toStrictEqual([`${fixture.prefix}^value$`])

			if (fixture.flags.includes('case-insensitive')) {
				expect(rendered.sql).toContain(' ~* $1')
			}
		}
	})
})
