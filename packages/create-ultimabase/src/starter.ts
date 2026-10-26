// The starter's files (D-130): the template as it is, its `gitignore` as
// `.gitignore`, and the package.json and README that name the application.
import {
	cpSync,
	mkdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export type Manager = 'npm' | 'yarn' | 'pnpm'

const template = fileURLToPath(new URL('../template', import.meta.url))

/** The packages the starter runs beside UltimaBase's, as the repository tests them. */
export const others = {
	'@types/node': '^24.19.2',
	graphql: '^17.0.2',
	vite: '^8.3.4',
	vitest: '^5.0.5',
} as const

/** `create-ultimabase`'s version, which the official packages share (D-60). */
export function ownVersion(): string {
	const manifest: unknown = JSON.parse(
		readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
	)
	return String(Reflect.get(Object(manifest), 'version'))
}

const manifestOf = (name: string): object => {
	const ours = `^${ownVersion()}`
	return {
		name,
		private: true,
		type: 'module',
		engines: { node: '>=24.7.0' },
		scripts: { start: 'node src/server.ts', test: 'vitest' },
		dependencies: {
			'@ultimabase/graphql': ours,
			'@ultimabase/http': ours,
			graphql: others.graphql,
			ultimabase: ours,
		},
		devDependencies: {
			'@types/node': others['@types/node'],
			'@ultimabase/testing': ours,
			vite: others.vite,
			vitest: others.vitest,
		},
	}
}

const readme = (name: string, manager: Manager): string => `# ${name}

An UltimaBase application. Node runs its TypeScript as it is written.

- \`${manager} start\` serves it on http://localhost:3000, GraphQL on
  \`/graphql\`; \`PORT\` sets another port.
- \`${manager} test\` runs its tests, each on a new in-memory database.

\`src/models.ts\` declares the models, \`src/app.ts\` the database and the
plugins.
`

/** Writes the starter named `name` in `target`, an empty or missing directory. */
export function write(target: string, name: string, manager: Manager): void {
	mkdirSync(target, { recursive: true })
	cpSync(template, target, { recursive: true })
	renameSync(join(target, 'gitignore'), join(target, '.gitignore'))
	writeFileSync(
		join(target, 'package.json'),
		`${JSON.stringify(manifestOf(name), undefined, '\t')}\n`,
	)
	writeFileSync(join(target, 'README.md'), readme(name, manager))
}
