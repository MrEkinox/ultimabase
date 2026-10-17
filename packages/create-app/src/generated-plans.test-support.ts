import { renderBaseFiles } from './base-template.js'
import { officialPlugins, type PluginId } from './catalog.js'
import { resolveSelection, type SelectionInput } from './config.js'

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
export const generatedPlans: readonly SelectionInput[] = (['ts', 'js'] as const)
	.flatMap((language) =>
		(['task', 'empty'] as const).flatMap((starter) => [
			{ language, starter },
			{ language, starter, apis: ['rest', 'graphql'] as const },
			{ language, starter, apis: ['rest'] as const },
			{
				language,
				starter,
				apis: ['rest'] as const,
				plugins: ['access-plugin'] as const,
				database: 'docker' as const,
			},
			{ language, starter, database: 'docker' as const, plugins: pluginIds },
			...pluginIds.map((id) => ({ language, starter, plugins: [id] })),
		]),
	)
	.filter(isAccepted)

/** Every file of one plan, with fixed local secrets. */
export const renderPlan = (
	input: SelectionInput,
): ReadonlyMap<string, string> =>
	renderBaseFiles(
		resolveSelection({ name: 'clean-notes', ...input }, '/tmp'),
		'docker-password',
	)

export const officialPluginIds = pluginIds

/**
 * The factory module and every schema module of one project, joined: the
 * sources that install the plugins and declare the schemas.
 */
export const pluginAndSchemaSources = (
	files: ReadonlyMap<string, string>,
	language: 'ts' | 'js',
): string =>
	[...files]
		.filter(
			([name]) =>
				name === `src/app.${language}` ||
				(name.startsWith('src/schemas/') && name.endsWith(`.${language}`)),
		)
		.map(([, contents]) => contents)
		.join('\n')
