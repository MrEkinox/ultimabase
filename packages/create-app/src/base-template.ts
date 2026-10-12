import path from 'node:path'

import {
	apiNextCommands,
	apiReadmeNotes,
	apiSchemaPluginEntries,
	apiSchemaPluginImports,
	indentRest,
	pluginImports,
} from './api-template.js'
import type { PluginId } from './catalog.js'
import {
	hasPlugin as has,
	included,
	type InitializerPlan,
	type PackageManager,
} from './config.js'
import {
	needsMasterKey,
	securityApplicationImports,
	securityApplicationOption,
	securityMasterSource,
	securityReadmeNotes,
	securitySchemaDeclarations,
	securitySchemaImports,
	securitySchemaPluginEntries,
	securitySchemaNames,
	taskRulesChain,
} from './security-template.js'
import { mainSource } from './main-template.js'
import { joinSections, renderImports } from './source.js'
import {
	environmentFile,
	json,
	packageScripts,
	typescriptConfigs,
} from './project-files.js'
import { taskTestSource, vitestConfigSource } from './test-template.js'

export type ProjectFiles = ReadonlyMap<string, string>

/** Optional plugins in generated package.json dependency order. */
const dependencyOrder: readonly PluginId[] = [
	'access-plugin',
	'acl-permissions-plugin',
	'auth-plugin',
	'roles-plugin',
	'http-plugin',
	'hono-server-plugin',
	'rest-plugin',
	'graphql-plugin',
	'graphql-yoga-plugin',
	'graphql-explorer-plugin',
	'hooks-plugin',
	'soft-delete-plugin',
	'validation-plugin',
]

/** Data and behavior plugins installed on the schema factory: [plugin, factory, entry]. */
const behaviorPlugins: readonly (readonly [PluginId, string, string])[] = [
	['hooks-plugin', 'hooksPlugin', 'hooksPlugin()'],
	['soft-delete-plugin', 'softDeletePlugin', 'softDeletePlugin()'],
	['validation-plugin', 'validationPlugin', 'validationPlugin()'],
]

const applicationSchemaNames = (plan: InitializerPlan): readonly string[] => [
	...(plan.starter === 'task' ? ['Task'] : []),
	...securitySchemaNames(plan),
]

const scriptCommand = (
	manager: PackageManager,
	script: 'dev' | 'test',
): string => {
	if (manager === 'npm')
		return script === 'test' ? 'npm test' : `npm run ${script}`
	return `${manager} ${script}`
}

/**
 * The one plugin list, as Prettier prints it: on one line when it fits,
 * otherwise one entry per line. Leading `//` lines of an entry are comments
 * above it.
 */
const pluginList = (entries: readonly string[]): string => {
	const single = `export const SchemaApplication = UltimaBase.use(${entries.join(', ')})`
	if (single.length <= 80 && !entries.some((entry) => entry.includes('\n')))
		return single
	return `export const SchemaApplication = UltimaBase.use(\n  ${entries
		.map((entry) => indentRest(entry, 2))
		.join(',\n  ')},\n)`
}

/** A relative import of a generated module; Node 24 runs `.ts` sources. */
const local = (plan: InitializerPlan, name: string): string =>
	`./${name}.${plan.language}`

/** The initializer writes `.env` when it knows the database URL. */
export const writesEnv = (plan: InitializerPlan): boolean =>
	plan.database === 'docker' || plan.databaseUrl !== undefined

/** These commands come from the same scripts written into package.json. */
export const nextCommands = (plan: InitializerPlan): readonly string[] => [
	`cd ${path.relative(process.cwd(), plan.destination) || plan.destination}`,
	...(plan.database === 'docker'
		? ['docker compose up -d --wait']
		: writesEnv(plan)
			? []
			: [
					`Create .env from .env.example and set DATABASE_URL for a disposable PostgreSQL database${needsMasterKey(plan) ? ' and a private random ULTIMABASE_MASTER_KEY' : ''}.`,
				]),
	...(!plan.install ? [`${plan.packageManager} install`] : []),
	scriptCommand(plan.packageManager, 'dev'),
	...apiNextCommands(plan),
]

/** ADR-0297 amendment 1: one `Register` declaration per application. */
const registerSource = (plan: InitializerPlan): string =>
	plan.language !== 'ts'
		? ''
		: `// One declaration per application gives name-keyed editor types.
declare module '@ultimabase/core' {
  interface Register {
    readonly app: typeof ultimabase
  }
}`

const applicationSource = (plan: InitializerPlan): string =>
	joinSections([
		renderImports([
			...securityApplicationImports(plan),
			[
				local(plan, 'schema'),
				['SchemaApplication', ...applicationSchemaNames(plan)].join(', '),
			],
		]),
		securityMasterSource(plan),
		`export const ultimabase = new SchemaApplication({
${[
	`  schemas: [${applicationSchemaNames(plan).join(', ')}],`,
	securityApplicationOption(plan),
]
	.filter((line) => line !== '')
	.join('\n')}
})`,
		registerSource(plan),
	])

/** Prettier keeps one call on the closing line and breaks two or more. */
const shapeChain = (calls: readonly string[]): string =>
	calls.length < 2
		? calls.join('')
		: calls.map((call) => `\n  ${indentRest(call, 2)}`).join('')

// Form D (ADR-0297): data in `define`, shape methods, then rules in `.with`.
const taskSchemaSource = (
	plan: InitializerPlan,
): string => `// The same declaration drives TypeScript inference and Runtime validation.
export const Task = SchemaApplication.Schema.define({
  className: 'Task',
  fields: (f) => ({
    title: f.string({
      required: true,
${has(plan, 'hooks-plugin') ? '      hooks: { resolveInput: ({ value }) => value.trim() },\n' : ''}${has(plan, 'validation-plugin') ? '      validation: z.string().min(1).max(200),\n' : ''}    }),
    done: f.boolean({ default: false }),
  }),
})${shapeChain([
	...(has(plan, 'soft-delete-plugin') ? ['.softDelete()'] : []),
	...taskRulesChain(plan),
])}`

const schemaSource = (plan: InitializerPlan): string => {
	const task = plan.starter === 'task'
	// One plugin list: postgresPlugin() reads DATABASE_URL at start (ADR-0312).
	const entries = [
		...behaviorPlugins
			.filter(([id]) => has(plan, id))
			.map(([, , entry]) => entry),
		...securitySchemaPluginEntries(plan),
		...apiSchemaPluginEntries(plan),
		'postgresPlugin()',
	]
	return joinSections([
		renderImports([
			['@ultimabase/core', 'UltimaBase'],
			...pluginImports(plan, behaviorPlugins),
			...(task && has(plan, 'validation-plugin')
				? [['zod', 'z'] as const]
				: []),
			...securitySchemaImports(plan),
			...apiSchemaPluginImports(plan),
			['@ultimabase/postgres-plugin', 'postgresPlugin'],
		]),
		pluginList(entries),
		task
			? taskSchemaSource(plan)
			: `// Add your first SchemaApplication.Schema.define() declaration here.
export {}`,
		securitySchemaDeclarations(plan),
	])
}

const composeFile = `services:
  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: ultimabase
      POSTGRES_USER: ultimabase
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
    ports:
      - '127.0.0.1:54329:5432'
    volumes:
      - ultimabase-data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U ultimabase -d ultimabase']
      interval: 2s
      timeout: 2s
      retries: 20

volumes:
  ultimabase-data:
`

const behaviorReadmeNotes = (plan: InitializerPlan): string[] => {
	const task = plan.starter === 'task'
	return included([
		[
			has(plan, 'hooks-plugin') && task,
			'Hooks normalize Task titles before the database mutation.',
		],
		[
			has(plan, 'validation-plugin') && task,
			'Validation rejects Task titles outside 1–200 characters after input resolution.',
		],
		[
			has(plan, 'soft-delete-plugin') && task,
			`Soft Delete replaces native Task deletion with a recoverable tombstone. Restore and purge require trusted, audited Master access; ${needsMasterKey(plan) ? 'this starter configures local Master for development but does not add restore or purge commands.' : 'this starter does not configure it.'}`,
		],
		[
			plan.starter === 'empty' && plan.plugins.length > 1,
			'Optional plugins are configured, but this empty application has no schema for schema-local behavior.',
		],
	])
}

const commandList = (commands: readonly string[]): string =>
	commands.map((command) => `    ${command}`).join('\n')

const projectReadme = (plan: InitializerPlan): string =>
	joinSections([
		`# ${plan.name}`,
		`Generated UltimaBase ${plan.language === 'ts' ? 'TypeScript' : 'JavaScript'} application.
${plan.starter === 'task' ? 'The Task starter seeds one record on its first run; later runs print that record instead of writing another.' : 'This empty application starts and stops without a data operation.'}`,
		'## Before running',
		[
			'Node.js 24 or newer: it runs the TypeScript sources directly in development.',
			plan.database === 'docker'
				? 'Docker Compose. Run docker compose up -d --wait to start the disposable local PostgreSQL 17 service and wait until it is ready. Its credentials live only in the ignored .env file.'
				: plan.databaseUrl === undefined
					? 'A dedicated disposable PostgreSQL database. Copy .env.example to .env and set DATABASE_URL; the initializer does not create your database.'
					: 'The existing PostgreSQL database you gave, in the ignored .env file. Use a disposable database: the initializer does not create it.',
			'`postgresPlugin()` reads DATABASE_URL when the application starts. Schema synchronization uses override outside production for a disposable development database (`NODE_ENV=production` uses fail). Do not point it at production or shared data.',
			...behaviorReadmeNotes(plan),
			...securityReadmeNotes(plan),
			...apiReadmeNotes(plan),
		]
			.map((note) => `- ${note}`)
			.join('\n'),
		'## Run',
		`Commands:\n\n${commandList(nextCommands(plan).slice(1))}`,
		`\`${scriptCommand(plan.packageManager, 'dev')}\` restarts the application when a source file changes.${plan.language === 'ts' ? ` For production, \`${plan.packageManager === 'npm' ? 'npm run build' : `${plan.packageManager} build`}\` compiles to dist/ and \`${plan.packageManager === 'npm' ? 'npm start' : `${plan.packageManager} start`}\` runs it.` : ''}`,
		'## Test',
		`${plan.starter === 'task' ? '`tests/task.test' + `.${plan.language}` + '` starts this application with `testApplication` from `@ultimabase/testing` on its own PostgreSQL schema; each call starts from empty tables.' : 'Add tests under tests/ with `testApplication` from `@ultimabase/testing`.'} Run them with \`${scriptCommand(plan.packageManager, 'test')}\`. Vitest starts a disposable PostgreSQL container once with Docker; set TEST_DATABASE_URL to use an existing test database instead.`,
		plan.database === 'docker'
			? 'When finished, docker compose down -v removes the disposable database volume.'
			: 'Keep .env private. It is ignored by Git.',
	])

/** Render the PostgreSQL project with its currently supported plugin choices. */
export const renderBaseFiles = (
	plan: InitializerPlan,
	dockerPassword?: string,
	masterKey?: string,
): ProjectFiles => {
	const extension = plan.language
	const dependencies: Record<string, string> = {
		'@ultimabase/core': '^0.0.0',
		'@ultimabase/postgres-plugin': '^0.0.0',
	}
	// apiServer() composes the HTTP plugins (ADR-0325); each stays a direct
	// dependency so generated types resolve with every package manager.
	if (has(plan, 'http-plugin'))
		dependencies['@ultimabase/api-server'] = '^0.0.0'
	for (const id of dependencyOrder)
		if (has(plan, id)) dependencies[`@ultimabase/${id}`] = '^0.0.0'
	// A sign-in method is a package of its own beside the foundation (ADR-0326).
	if (has(plan, 'auth-plugin'))
		dependencies['@ultimabase/auth-password'] = '^0.0.0'
	if (has(plan, 'validation-plugin') && plan.starter === 'task')
		dependencies.zod = '^4.4.3'
	const packageJson = {
		name: plan.name,
		version: '0.0.0',
		private: true,
		type: 'module',
		scripts: packageScripts(plan),
		dependencies,
		devDependencies: {
			...(plan.language === 'ts' ? { '@types/node': '^24.0.0' } : {}),
			'@ultimabase/testing': '^0.0.0',
			...(plan.language === 'ts' ? { typescript: '^6.0.3' } : {}),
			vitest: '^4.1.11',
		},
	}
	const files = new Map<string, string>([
		['package.json', json(packageJson)],
		['.gitignore', '.env\ndist/\nnode_modules/\n'],
		[
			'.env.example',
			(plan.database === 'docker'
				? 'POSTGRES_PASSWORD=<generated-local-secret>\nDATABASE_URL=postgres://ultimabase:<generated-local-secret>@127.0.0.1:54329/ultimabase\n'
				: 'DATABASE_URL=postgres://user:password@127.0.0.1:5432/your_disposable_database\n') +
				(needsMasterKey(plan)
					? 'ULTIMABASE_MASTER_KEY=<generate-a-random-local-key>\n'
					: '') +
				'# Optional: an existing test database instead of a Docker container.\n# TEST_DATABASE_URL=postgres://user:password@127.0.0.1:5432/your_test_database\n',
		],
		[`src/schema.${extension}`, schemaSource(plan)],
		[`src/ultimabase.${extension}`, applicationSource(plan)],
		[`src/main.${extension}`, mainSource(plan)],
		[`vitest.config.${extension}`, vitestConfigSource(plan)],
		...(plan.starter === 'task'
			? [[`tests/task.test.${extension}`, taskTestSource(plan)] as const]
			: []),
		...(plan.language === 'ts' ? typescriptConfigs() : []),
		['README.md', projectReadme(plan)],
	])
	if (plan.database === 'docker') files.set('compose.yaml', composeFile)
	const environment = environmentFile(plan, dockerPassword, masterKey)
	if (environment !== undefined) files.set('.env', environment)
	return files
}
