import {
	collectQueryRelationPredicates,
	fieldPath,
	QueryBuilder,
	UltimaBase,
} from '@ultimabase/core'
import { SchemaRegistry } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'
import {
	FilterSchema,
	dialect,
	renderQuery,
} from './filter-compiler-fixtures.js'

import {
	compilePostgresFilter,
	compilePostgresRowFilter,
} from '../../src/query/filter-compiler.js'
import { PostgresSchemaCatalog } from '../../src/schema/catalog.js'
import { createPostgresRelationPredicateCompiler } from '../../src/query/relation-predicate-compiler.js'
import {
	PostgresRelationArticle,
	PostgresRelationAuthor,
	PostgresRelationPost,
	PostgresRelationTag,
} from '../fixtures/relation-fixture.js'

describe('PostgreSQL filter compiler', () => {
	it('compiles one-dimensional list filters through parameterized JSONB operators', () => {
		const query = new QueryBuilder(FilterSchema).where({
			hugeValues: { has: 42n },
			tags: {
				eq: ['backend', 'typescript'],
				has: 'typescript',
				hasEvery: ['backend', 'typescript'],
				hasSome: ['node', 'runtime'],
				isEmpty: true,
			},
		})
		const rendered = renderQuery(query)

		expect(rendered.sql).toContain('jsonb_array_elements')
		expect(rendered.sql).toContain(' = ')
		expect(rendered.params).toEqual(
			expect.arrayContaining([
				'"42"',
				'["backend","typescript"]',
				'"typescript"',
				'"node"',
				'"runtime"',
				'[]',
			]),
		)
	})

	it('compiles relation predicates owned by a private Runtime row filter', () => {
		const Target = UltimaBase.Schema.define({
			className: 'FilterAccessRelationTarget',
			fields: (field) => ({ label: field.string(), visible: field.boolean() }),
		})
		const Source = UltimaBase.Schema.define({
			className: 'FilterAccessRelationSource',
			fields: (field) => ({
				targets: field.relation({ target: 'FilterAccessRelationTarget' }),
			}),
		})
		const registry = new SchemaRegistry([Source, Target])
		const catalog = new PostgresSchemaCatalog(
			registry.values(),
			registry.resolveSchemaTargets(),
		)
		const rowFilter = new QueryBuilder(Source).where({
			targets: { some: { label: { eq: 'policy-value' } } },
		}).ast.where?.expression
		const targetAccess = new QueryBuilder(Target).where({
			visible: { eq: true },
		}).ast.where?.expression

		if (rowFilter === undefined || targetAccess === undefined) {
			throw new TypeError('Access relation compiler fixture is incomplete')
		}

		const [predicate] = collectQueryRelationPredicates(rowFilter)

		if (predicate === undefined) {
			throw new TypeError(
				'Access relation compiler fixture requires a predicate',
			)
		}

		const compiler = createPostgresRelationPredicateCompiler(catalog, [
			{ predicate, rowFilter: targetAccess },
		])
		const rendered = dialect.sqlToQuery(
			compilePostgresRowFilter(rowFilter, catalog.get(Source), compiler),
		)

		expect(rendered.sql.toLowerCase()).toContain('exists')
		expect(rendered.params).toContain('policy-value')
		expect(rendered.params).toContain(true)
	})

	it('parameterizes correlated relation predicates and private target Access', () => {
		const Target = UltimaBase.Schema.define({
			className: 'FilterRelationTarget',
			fields: (field) => ({ label: field.string(), visible: field.boolean() }),
		})
		const Source = UltimaBase.Schema.define({
			className: 'FilterRelationSource',
			fields: (field) => ({
				targets: field.relation({ target: 'FilterRelationTarget' }),
			}),
		})
		const registry = new SchemaRegistry([Source, Target])
		const catalog = new PostgresSchemaCatalog(
			registry.values(),
			registry.resolveSchemaTargets(),
		)
		const query = new QueryBuilder(Source).where((where) =>
			where.some('targets', (target) => target.eq('label', 'developer-value')),
		)
		const expression = query.ast.where?.expression

		if (expression === undefined) {
			throw new TypeError('Relation compiler fixture requires an expression')
		}

		const [predicate] = collectQueryRelationPredicates(expression)
		const targetAccess = new QueryBuilder(Target).where((where) =>
			where.eq('visible', true),
		).ast.where?.expression

		if (predicate === undefined || targetAccess === undefined) {
			throw new TypeError('Relation compiler fixture is incomplete')
		}

		const compiler = createPostgresRelationPredicateCompiler(catalog, [
			{ predicate, rowFilter: targetAccess },
		])
		const rendered = dialect.sqlToQuery(
			compilePostgresFilter(expression, catalog.get(Source), compiler),
		)

		expect(rendered.sql.toLowerCase()).toContain('exists')
		expect(rendered.sql).not.toContain('developer-value')
		expect(rendered.params).toContain('developer-value')
		expect(rendered.params).toContain(true)
	})

	it('compiles pointer target traversal with target Access through Drizzle relations', () => {
		const Target = UltimaBase.Schema.define({
			className: 'FilterPointerPredicateTarget',
			fields: (field) => ({ label: field.string(), visible: field.boolean() }),
		})
		const Source = UltimaBase.Schema.define({
			className: 'FilterPointerPredicateSource',
			fields: (field) => ({
				target: field.pointer({ target: 'FilterPointerPredicateTarget' }),
			}),
		})
		const registry = new SchemaRegistry([Source, Target])
		const catalog = new PostgresSchemaCatalog(
			registry.values(),
			registry.resolveSchemaTargets(),
		)
		const query = new QueryBuilder(Source).where({
			target: {
				is: { label: { eq: 'developer-value' } },
				isNot: { label: { eq: 'blocked-value' } },
			},
		})
		const expression = query.ast.where?.expression
		const targetAccess = new QueryBuilder(Target).where({
			visible: { eq: true },
		}).ast.where?.expression

		if (expression === undefined || targetAccess === undefined) {
			throw new TypeError('Pointer predicate compiler fixture is incomplete')
		}

		const predicates = collectQueryRelationPredicates(expression)
		const compiler = createPostgresRelationPredicateCompiler(
			catalog,
			predicates.map((predicate) => ({
				predicate,
				rowFilter: targetAccess,
			})),
		)
		const rendered = dialect.sqlToQuery(
			compilePostgresFilter(expression, catalog.get(Source), compiler),
		)

		expect(rendered.sql.toLowerCase()).toContain('exists')
		expect(rendered.sql.toLowerCase()).toContain('not (exists')
		expect(rendered.params).toContain('developer-value')
		expect(rendered.params).toContain('blocked-value')
		expect(rendered.params.filter((value) => value === true)).toHaveLength(2)
	})

	it('compiles join and inverse-pointer cardinality through correlated Drizzle subqueries', () => {
		const relationSchemas = [
			PostgresRelationArticle,
			PostgresRelationTag,
			PostgresRelationAuthor,
			PostgresRelationPost,
		] as const
		const registry = new SchemaRegistry(relationSchemas)
		const catalog = new PostgresSchemaCatalog(
			registry.values(),
			registry.resolveSchemaTargets(),
		)
		const renderCount = <
			TSchema extends
				typeof PostgresRelationArticle | typeof PostgresRelationAuthor,
		>(
			query: QueryBuilder<TSchema>,
		) => {
			const expression = query.ast.where?.expression

			if (expression === undefined) {
				throw new TypeError('Relation count fixture requires an expression')
			}

			const [predicate] = collectQueryRelationPredicates(expression)

			if (predicate === undefined) {
				throw new TypeError('Relation count fixture requires a predicate')
			}

			const compiler = createPostgresRelationPredicateCompiler(catalog, [
				{ predicate },
			])

			return dialect.sqlToQuery(
				compilePostgresFilter(
					expression,
					catalog.get(predicate.source.definition),
					compiler,
				),
			)
		}
		const join = renderCount(
			new QueryBuilder(PostgresRelationArticle).where({
				tags: {
					count: {
						where: {
							id: { ne: '018f0f8c-7b5a-7cc9-98db-123456789abc' },
						},
						eq: 2,
						ne: 3,
						gt: 0,
						gte: 1,
						lt: 10,
						lte: 9,
						in: [1, 2],
						notIn: [4, 5],
						between: { lower: 1, upper: 5 },
						notBetween: { lower: 6, upper: 8 },
					},
				},
			}),
		)
		const pointer = renderCount(
			new QueryBuilder(PostgresRelationAuthor).where({
				posts: { count: { eq: 1 } },
			}),
		)

		expect(join.sql.match(/select count\(\*\)/gu)).toHaveLength(1)
		expect(join.sql).toContain('exists (select count(*)')
		expect(join.sql).toContain('inner join')
		expect(join.sql).toContain(
			'"source_id" = "postgres_relation_articles"."id"',
		)
		expect(join.sql).toContain('count(*) = $2')
		expect(join.sql).toContain('count(*) <> $3')
		expect(join.sql).toContain('count(*) > $4')
		expect(join.sql).toContain('count(*) >= $5')
		expect(join.sql).toContain('count(*) < $6')
		expect(join.sql).toContain('count(*) <= $7')
		expect(join.sql).toContain('count(*) in ($8, $9)')
		expect(join.sql).toContain('count(*) not in ($10, $11)')
		expect(join.sql).toContain('count(*) between $12 and $13')
		expect(join.sql).toContain('count(*) not between $14 and $15')
		expect(join.params).toStrictEqual([
			'018f0f8c-7b5a-7cc9-98db-123456789abc',
			2,
			3,
			0,
			1,
			10,
			9,
			1,
			2,
			4,
			5,
			1,
			5,
			6,
			8,
		])
		expect(pointer.sql).toContain('select count(*)')
		expect(pointer.sql).not.toContain('inner join')
		expect(pointer.sql).toContain('"author" = "postgres_relation_authors"."id"')
		expect(pointer.sql).toContain(' = $1')
		expect(pointer.params).toStrictEqual([1])
	})

	it('parameterizes pointer predicates as target UUIDs', () => {
		const User = UltimaBase.Schema.define({
			className: 'FilterPointerUser',
			fields: () => ({}),
		})
		const Post = UltimaBase.Schema.define({
			className: 'FilterPointerPost',
			fields: (field) => ({
				author: field.pointer({ target: 'FilterPointerUser' }),
			}),
		})
		const registry = new SchemaRegistry([User, Post])
		const catalog = new PostgresSchemaCatalog(
			registry.values(),
			registry.resolveSchemaTargets(),
		)
		const pointerId = '018f0f8c-7b5a-7cc9-98db-123456789abc'
		const expression = new QueryBuilder(Post).where((where) =>
			where.eq('author', pointerId),
		).ast.where?.expression

		if (expression === undefined) {
			throw new TypeError('Pointer filter fixture requires an expression')
		}

		const rendered = dialect.sqlToQuery(
			compilePostgresFilter(expression, catalog.get(Post)),
		)

		expect(rendered.sql).toContain(' = $1')
		expect(rendered.sql).not.toContain(pointerId)
		expect(rendered.params).toStrictEqual([pointerId])
	})

	it('compiles every primitive operator through Drizzle parameters', () => {
		const cases: readonly {
			readonly fragment: string
			readonly query: QueryBuilder<typeof FilterSchema>
		}[] = [
			{
				fragment: ' = $1',
				query: new QueryBuilder(FilterSchema).where((where) =>
					where.eq('title', 'a'),
				),
			},
			{
				fragment: ' <> $1',
				query: new QueryBuilder(FilterSchema).where((where) =>
					where.ne('title', 'a'),
				),
			},
			{
				fragment: ' > $1',
				query: new QueryBuilder(FilterSchema).where((where) =>
					where.gt('count', 1),
				),
			},
			{
				fragment: ' >= $1',
				query: new QueryBuilder(FilterSchema).where((where) =>
					where.gte('count', 1),
				),
			},
			{
				fragment: ' < $1',
				query: new QueryBuilder(FilterSchema).where((where) =>
					where.lt('count', 1),
				),
			},
			{
				fragment: ' <= $1',
				query: new QueryBuilder(FilterSchema).where((where) =>
					where.lte('count', 1),
				),
			},
			{
				fragment: ' between $1 and $2',
				query: new QueryBuilder(FilterSchema).where((where) =>
					where.between('count', 1, 10),
				),
			},
			{
				fragment: ' not between $1 and $2',
				query: new QueryBuilder(FilterSchema).where((where) =>
					where.notBetween('count', 1, 10),
				),
			},
			{
				fragment: ' in ($1, $2)',
				query: new QueryBuilder(FilterSchema).where((where) =>
					where.in('status', ['draft', 'published']),
				),
			},
			{
				fragment: ' not in ($1)',
				query: new QueryBuilder(FilterSchema).where((where) =>
					where.notIn('status', ['draft']),
				),
			},
			{
				fragment: ' LIKE $1',
				query: new QueryBuilder(FilterSchema).where((where) =>
					where.contains('title', 'a'),
				),
			},
			{
				fragment: ' LIKE $1',
				query: new QueryBuilder(FilterSchema).where((where) =>
					where.startsWith('title', 'a'),
				),
			},
			{
				fragment: ' LIKE $1',
				query: new QueryBuilder(FilterSchema).where((where) =>
					where.endsWith('title', 'a'),
				),
			},
			{
				fragment: ' ~ $1',
				query: new QueryBuilder(FilterSchema).where((where) =>
					where.matches('title', {
						source: '^a',
						flags: [],
					}),
				),
			},
			{
				fragment: ' is not null',
				query: new QueryBuilder(FilterSchema).where((where) =>
					where.isNotNull('title'),
				),
			},
			{
				fragment: ' is null',
				query: new QueryBuilder(FilterSchema).where((where) =>
					where.isNull('title'),
				),
			},
		]

		for (const fixture of cases) {
			expect(renderQuery(fixture.query).sql).toContain(fixture.fragment)
		}
	})

	it('preserves SQL null semantics for equality and membership', () => {
		const equalNull = renderQuery(
			new QueryBuilder(FilterSchema).where((where) => where.eq('title', null)),
		)
		const includesNull = renderQuery(
			new QueryBuilder(FilterSchema).where((where) =>
				where.in('title', ['draft', null]),
			),
		)
		const excludesNull = renderQuery(
			new QueryBuilder(FilterSchema).where((where) =>
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
				new QueryBuilder(FilterSchema).where((where) => where.in('title', [])),
			),
		).toMatchObject({
			params: [],
			sql: 'false',
		})
	})

	it('compiles logical trees without changing declaration order', () => {
		const query = new QueryBuilder(FilterSchema).where({
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
			new QueryBuilder(FilterSchema).where((where) =>
				where.eq('huge', 9_007_199_254_740_993n),
			),
		)
		const binaryQuery = renderQuery(
			new QueryBuilder(FilterSchema).where((where) =>
				where.eq('attachment', bytes),
			),
		)
		const jsonQuery = renderQuery(
			new QueryBuilder(FilterSchema).where((where) =>
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
			new QueryBuilder(FilterSchema).where((where) =>
				where.contains('metadata', { nested: true }),
			),
		)
		const objectContains = renderQuery(
			new QueryBuilder(FilterSchema).where((where) =>
				where.contains('profile', {
					stats: { exact: 9_007_199_254_740_993n },
				}),
			),
		)
		const containedBy = renderQuery(
			new QueryBuilder(FilterSchema).where((where) =>
				where.containedBy('metadata', {
					nested: true,
					extra: false,
				}),
			),
		)
		const hasKey = renderQuery(
			new QueryBuilder(FilterSchema).where((where) =>
				where.hasKey('metadata', 'nested'),
			),
		)
		const hasAnyKeys = renderQuery(
			new QueryBuilder(FilterSchema).where((where) =>
				where.hasAnyKeys('profile', ['label', 'stats']),
			),
		)
		const hasAllKeys = renderQuery(
			new QueryBuilder(FilterSchema).where((where) =>
				where.hasAllKeys('profile', ['label', 'stats']),
			),
		)
		const pathEquality = renderQuery(
			new QueryBuilder(FilterSchema).where((where) =>
				where.eq(
					fieldPath('profile', ['stats', 'exact']),
					9_007_199_254_740_993n,
				),
			),
		)
		const pathString = renderQuery(
			new QueryBuilder(FilterSchema).where((where) =>
				where.contains(fieldPath('profile', ['label']), 'typed'),
			),
		)
		const dynamicPath = renderQuery(
			new QueryBuilder(FilterSchema).where((where) =>
				where.eq(fieldPath('metadata', ['nested', 'count']), 42),
			),
		)
		const jsonPathExists = renderQuery(
			new QueryBuilder(FilterSchema).where((where) =>
				where.jsonPathExists('metadata', {
					source: '$.items[*] ? (@.price > $minimum)',
					variables: { minimum: 10 },
				}),
			),
		)
		const jsonPathMatches = renderQuery(
			new QueryBuilder(FilterSchema).where((where) =>
				where.jsonPathMatches('profile', {
					source: 'exists($.stats ? (@.exact == $expected))',
					variables: { expected: '9007199254740993' },
				}),
			),
		)
		const jsonPathExistsOperator = renderQuery(
			new QueryBuilder(FilterSchema).where((where) =>
				where.jsonPathExists('metadata', {
					source: '$.items[*]',
				}),
			),
		)
		const jsonPathMatchesOperator = renderQuery(
			new QueryBuilder(FilterSchema).where((where) =>
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
		const cases: readonly QueryBuilder<typeof FilterSchema>[] = [
			new QueryBuilder(FilterSchema).where((where) => where.eq('active', true)),
			new QueryBuilder(FilterSchema).where((where) =>
				where.eq('birthday', '2026-08-01'),
			),
			new QueryBuilder(FilterSchema).where((where) => where.eq('count', 42)),
			new QueryBuilder(FilterSchema).where((where) =>
				where.eq('eventAt', '2026-08-01T10:00:00.000Z'),
			),
			new QueryBuilder(FilterSchema).where((where) =>
				where.eq('exact', '123.45'),
			),
			new QueryBuilder(FilterSchema).where((where) => where.eq('rating', 4.5)),
			new QueryBuilder(FilterSchema).where((where) =>
				where.eq('status', 'draft'),
			),
			new QueryBuilder(FilterSchema).where((where) =>
				where.eq('title', 'typed'),
			),
			new QueryBuilder(FilterSchema).where((where) =>
				where.eq('token', '018f0f8c-7b5a-7cc9-98db-123456789abc'),
			),
			new QueryBuilder(FilterSchema).where((where) =>
				where.eq('wakeAt', '10:30:00.000'),
			),
		]

		for (const query of cases) {
			const rendered = renderQuery(query)

			expect(rendered.sql).toContain(' = $1')
			expect(rendered.params).toHaveLength(1)
		}
	})
})
