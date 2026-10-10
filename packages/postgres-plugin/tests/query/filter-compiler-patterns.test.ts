import { describe, expect, it } from 'vitest'
import { FilterSchema, renderQuery } from './filter-compiler-fixtures.js'
import { QueryBuilder } from '@ultimabase/core/plugin'

describe('PostgreSQL filter pattern compilation', () => {
	it('keeps injection payloads in parameters and escapes LIKE wildcards', () => {
		const payload = "x%'_\\ OR true --"
		const equality = renderQuery(
			new QueryBuilder(FilterSchema).where((where) =>
				where.eq('title', payload),
			),
		)
		const contains = renderQuery(
			new QueryBuilder(FilterSchema).where((where) =>
				where.contains('title', payload),
			),
		)
		const range = renderQuery(
			new QueryBuilder(FilterSchema).where((where) =>
				where.between('title', payload, `${payload}z`),
			),
		)
		// The portable regex subset (ADR-0302) rejects the `\\ ` escape.
		const regexPayload = "x%'_ OR true --"
		const regex = renderQuery(
			new QueryBuilder(FilterSchema).where((where) =>
				where.matches('title', {
					flags: [],
					source: regexPayload,
				}),
			),
		)

		expect(equality.sql).not.toContain(payload)
		expect(equality.params).toStrictEqual([payload])
		expect(contains.sql).not.toContain(payload)
		expect(contains.params).toStrictEqual(["%x\\%'\\_\\\\ OR true --%", '\\'])
		expect(range.sql).not.toContain(payload)
		expect(range.params).toStrictEqual([payload, `${payload}z`])
		expect(regex.sql).not.toContain(regexPayload)
		expect(regex.params).toStrictEqual([`(?p)${regexPayload}`])
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
				new QueryBuilder(FilterSchema).where((where) =>
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
