import type { InitializerPlan } from './config.js'
import { templateFile } from './template.js'

/** Two-space JSON with a final newline, as Prettier prints package.json. */
export const json = (value: unknown): string =>
	`${JSON.stringify(value, null, 2)}\n`

/** Node runs the sources; the build configuration emits them to dist/. */
export const typescriptConfigs = (): readonly (readonly [string, string])[] => [
	['tsconfig.json', templateFile('tsconfig.json')],
	['tsconfig.build.json', templateFile('tsconfig.build.json')],
]

export const packageScripts = (
	plan: InitializerPlan,
): Record<string, string> => {
	const main = `src/main.${plan.language}`
	const test =
		plan.starter === 'task' ? 'vitest run' : 'vitest run --passWithNoTests'
	return plan.language === 'ts'
		? {
				dev: `node --watch --env-file=.env ${main}`,
				build: 'tsc -p tsconfig.build.json',
				start: 'node --env-file=.env dist/main.js',
				typecheck: 'tsc',
				test,
			}
		: {
				dev: `node --watch --env-file=.env ${main}`,
				start: `node --env-file=.env ${main}`,
				test,
			}
}

/** `.env` lines; the file exists when the database URL is known. */
export const environmentFile = (
	plan: InitializerPlan,
	dockerPassword: string | undefined,
): string | undefined => {
	let databaseUrl = plan.databaseUrl
	let compose = ''
	if (plan.database === 'docker') {
		if (!dockerPassword)
			throw new Error('A random Docker password is required.')
		compose = `POSTGRES_PASSWORD=${dockerPassword}\n`
		databaseUrl = `postgres://ultimabase:${dockerPassword}@127.0.0.1:54329/ultimabase`
	}
	if (databaseUrl === undefined) return undefined
	return `${compose}DATABASE_URL=${databaseUrl}\n`
}
