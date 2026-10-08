import { describe, expect, it } from 'vitest'

import { renderBaseFiles } from './base-template.js'
import { officialPlugins, type PluginId } from './catalog.js'
import { resolveSelection, type SelectionInput } from './config.js'
import { joinSections, renderImports } from './source.js'

const pluginIds: readonly PluginId[] = officialPlugins.map(({ id }) => id)

const isAccepted = (input: SelectionInput): boolean => {
	try {
		resolveSelection({ name: 'clean-notes', ...input }, '/tmp')
		return true
	} catch {
		// The CLI rejects this selection before rendering (an empty GraphQL starter).
		return false
	}
}

/** Representative plans: defaults, each plugin alone, both APIs and everything at once. */
const plans: readonly SelectionInput[] = (['ts', 'js'] as const)
	.flatMap((language) =>
		(['task', 'empty'] as const).flatMap((starter) => [
			{ language, starter },
			{ language, starter, apis: ['rest', 'graphql'] as const },
			{ language, starter, apis: ['rest'] as const },
			{ language, starter, database: 'docker' as const, plugins: pluginIds },
			...pluginIds.map((id) => ({ language, starter, plugins: [id] })),
		]),
	)
	.filter(isAccepted)

const render = (input: SelectionInput): ReadonlyMap<string, string> =>
	renderBaseFiles(
		resolveSelection({ name: 'clean-notes', ...input }, '/tmp'),
		'docker-password',
		'master-key',
	)

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
		// Security plugins deny ordinary reads, so the existence check uses Master too.
		const secured =
			render({ language: 'js', plugins: ['access-plugin'] }).get(
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
