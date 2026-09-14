import { z } from 'zod'

const exceptionSchema = z.object({
	match: z.string().min(1),
	path: z.string().regex(/^content\/docs\/(?:en|fr)\/.+\.mdx$/u),
	reason: z.string().min(12),
})

const exceptionsSchema = z.object({
	exceptions: z.array(exceptionSchema),
	version: z.literal(1),
})

export type DocumentationLintExceptions = z.infer<typeof exceptionsSchema>

interface ProseRule {
	readonly correction: string
	readonly locale: 'en' | 'fr' | 'all'
	readonly match: string
}

const proseRules: readonly ProseRule[] = [
	{ correction: 'TypeScript', locale: 'all', match: 'Typescript' },
	{ correction: 'JavaScript', locale: 'all', match: 'Javascript' },
	{ correction: 'GraphQL', locale: 'all', match: 'GraphQl' },
	{ correction: 'GitHub', locale: 'all', match: 'Github' },
	{ correction: 'PostgreSQL', locale: 'all', match: 'PostgresSQL' },
	{
		correction: 'graphe d’application',
		locale: 'fr',
		match: 'application graph',
	},
	{ correction: 'contexte de requête', locale: 'fr', match: 'request context' },
	{ correction: 'autorité Master', locale: 'fr', match: 'Master authority' },
	{ correction: 'génération de types', locale: 'fr', match: 'type generation' },
	{ correction: 'suppression logique', locale: 'fr', match: 'soft delete' },
]

const stripNonProse = (source: string): string =>
	source
		.replace(/^---\n[\s\S]*?\n---\n?/u, '')
		.replace(/```[\s\S]*?```/gu, '')
		.replace(/`[^`]*`/gu, '')

/** Validates exact, reviewable exceptions for public prose rules. */
export function parseDocumentationLintExceptions(
	input: unknown,
): DocumentationLintExceptions {
	return exceptionsSchema.parse(input)
}

/** Finds focused terminology and heading mistakes without claiming semantic review. */
export function documentationProseDiagnostics(
	repositoryPath: string,
	source: string,
	exceptions: DocumentationLintExceptions,
): readonly string[] {
	const locale = repositoryPath.startsWith('content/docs/fr/') ? 'fr' : 'en'
	const prose = stripNonProse(source)
	const diagnostics: string[] = []
	const isExcepted = (match: string): boolean =>
		exceptions.exceptions.some(
			(exception) =>
				exception.path === repositoryPath && exception.match === match,
		)

	for (const rule of proseRules) {
		if (
			(rule.locale === 'all' || rule.locale === locale) &&
			prose.includes(rule.match) &&
			!isExcepted(rule.match)
		) {
			diagnostics.push(
				`${repositoryPath}: replace “${rule.match}” with “${rule.correction}” or add an exact justified lint exception`,
			)
		}
	}

	let previousHeadingLevel = 1
	for (const heading of prose.matchAll(/^(?<marks>#{2,6}) (?<text>.+)$/gmu)) {
		const marks = heading.groups?.marks
		const text = heading.groups?.text
		if (
			marks !== undefined &&
			marks.length > previousHeadingLevel + 1 &&
			!isExcepted(text ?? marks)
		) {
			diagnostics.push(
				`${repositoryPath}: heading “${text ?? marks}” skips from level ${String(previousHeadingLevel)} to ${String(marks.length)}`,
			)
		}
		if (marks !== undefined) previousHeadingLevel = marks.length
		if (text !== undefined && /[.:;!?]$/u.test(text) && !isExcepted(text)) {
			diagnostics.push(
				`${repositoryPath}: remove terminal punctuation from heading “${text}” or add an exact justified lint exception`,
			)
		}
	}

	return diagnostics
}
