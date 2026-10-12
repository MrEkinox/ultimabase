import { describe, expect, it } from 'vitest'

import {
	generatedPlans as plans,
	officialPluginIds as pluginIds,
	renderPlan as render,
} from './generated-plans.test-support.js'
import { joinSections, renderImports } from './source.js'

describe('generated source cleanliness', () => {
	it('covers every plugin in both languages', () => {
		expect(plans.length).toBeGreaterThan(4 * pluginIds.length)
	})

	it('merges named imports per module in first-use order', () => {
		expect(
			renderImports([
				['@ultimabase/core', 'MasterAuthority'],
				['@ultimabase/access-plugin', 'schemaAccess'],
				['@ultimabase/core', 'plugin, MasterAuthority'],
			]),
		).toBe(
			"import { MasterAuthority, plugin } from '@ultimabase/core'\nimport { schemaAccess } from '@ultimabase/access-plugin'",
		)
	})

	it('joins only present sections with one blank line', () => {
		expect(joinSections(['a', '', 'b\nc', ''])).toBe('a\n\nb\nc\n')
	})

	it.each(plans)(
		'writes no duplicate import or repeated blank line for %j',
		(input) => {
			for (const [name, contents] of render(input)) {
				const lines = contents.split('\n')
				expect(contents, name).not.toMatch(/\n[ \t]*\n[ \t]*\n/u)
				expect(contents, name).not.toMatch(/^\s*\n/u)
				expect(contents, name).toMatch(/[^\n]\n$/u)
				expect(
					lines.filter((line) => /[ \t]$/u.test(line)),
					name,
				).toEqual([])
				const modules = [
					...contents.matchAll(/^(?:import .*|\}) from '([^']+)'$/gmu),
				].map(([, module]) => module)
				expect(modules, name).toEqual([...new Set(modules)])
			}
		},
	)

	it('seeds the Task example only into an empty table', () => {
		const direct = render({ language: 'ts' }).get('src/main.ts') ?? ''
		expect(direct).toMatch(
			/const task =\s+\(await Task\.findOne\(\)\) \?\?\s+\(await Task\.createOne\(/u,
		)
		expect(direct.match(/Task\.createOne\(/gu)).toHaveLength(1)
		// An empty ACL hides the seed, so the existence check uses Master too.
		const secured =
			render({ language: 'js', plugins: ['acl-permissions-plugin'] }).get(
				'src/main.js',
			) ?? ''
		expect(secured).toContain(
			'(await Task.findOne({}, { useMasterKey: true })) ??',
		)
		expect(secured.match(/useMasterKey: true/gu)).toHaveLength(2)
		expect(render({ language: 'ts' }).get('README.md')).toContain(
			'later runs print that record instead of writing another',
		)
	})
})
