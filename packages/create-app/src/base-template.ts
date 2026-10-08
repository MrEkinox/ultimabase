import path from 'node:path'

import {
	apiApplicationImports,
	apiNextCommands,
	apiPluginEntries,
	apiReadmeNotes,
	apiSchemaPluginEntries,
	apiSchemaPluginImports,
	hasHttpListener,
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
	securityPluginEntries,
	securityPolicySource,
	securityReadmeNotes,
	securitySchemaDeclarations,
	securitySchemaImports,
	securitySchemaPluginEntries,
	securitySchemaNames,
	taskSecurityOptions,
} from './security-template.js'

export type ProjectFiles = ReadonlyMap<string, string>

/** Optional plugins in generated package.json dependency order. */
const dependencyOrder: readonly PluginId[] = [
	'access-plugin',
	'acl-permissions-plugin',
	'password-auth-plugin',
	'roles-plugin',
	'http-plugin',
	'server-hono-plugin',
	'rest-plugin',
	'graphql-plugin',
	'graphql-yoga-plugin',
	'graphiql-plugin',
	'apollo-sandbox-plugin',
	'hooks-plugin',
	'pg-vector-plugin',
	'soft-delete-plugin',
	'validation-plugin',
]

/** Data and behavior plugins installed on the schema factory: [plugin, factory, entry]. */
const behaviorPlugins: readonly (readonly [PluginId, string, string])[] = [
	['hooks-plugin', 'hooksPlugin', 'hooksPlugin()'],
	['pg-vector-plugin', 'pgVectorPlugin', 'pgVectorPlugin()'],
	[
		'soft-delete-plugin',
		'softDeletePlugin',
		"softDeletePlugin({ defaultMode: 'disabled' })",
	],
	['validation-plugin', 'validationPlugin', 'validationPlugin()'],
]

const applicationSchemaNames = (plan: InitializerPlan): readonly string[] => [
	...(plan.starter === 'task' ? ['Task'] : []),
	...securitySchemaNames(plan),
]

const scriptCommand = (
	manager: PackageManager,
	script: 'build' | 'start' | 'typecheck',
): string => {
	if (manager === 'npm')
		return script === 'start' ? 'npm start' : `npm run ${script}`
	return `${manager} ${script}`
}

/** One `.use(entry)` line per plugin entry, appended to a factory expression. */
const useChain = (entries: readonly string[]): string =>
	entries.map((entry) => `\n  .use(${entry})`).join('')

/** These commands come from the same scripts written into package.json. */
export const nextCommands = (plan: InitializerPlan): readonly string[] => [
	`cd ${path.relative(process.cwd(), plan.destination) || plan.destination}`,
	...(plan.database === 'docker'
		? ['docker compose up -d']
		: [
				`Create .env from .env.example and set DATABASE_URL for a disposable PostgreSQL database${needsMasterKey(plan) ? ' and a private random ULTIMABASE_MASTER_KEY' : ''}.`,
			]),
	...(!plan.install ? [`${plan.packageManager} install`] : []),
	...(plan.typegen
		? [
				scriptCommand(plan.packageManager, 'typecheck'),
				scriptCommand(plan.packageManager, 'build'),
			]
		: []),
	scriptCommand(plan.packageManager, 'start'),
	...apiNextCommands(plan),
]

const applicationSource = (
	plan: InitializerPlan,
): string => `import { postgresPlugin } from '@ultimabase/postgres-plugin'
${securityApplicationImports(plan).join('\n')}
${apiApplicationImports(plan).join('\n')}
import { ${['SchemaApplication', ...applicationSchemaNames(plan)].join(', ')} } from './schema.js'

const databaseUrl = process.env.DATABASE_URL
if (databaseUrl === undefined) throw new TypeError('DATABASE_URL is required')
${securityMasterSource(plan)}
${securityPolicySource(plan)}

const Application = SchemaApplication${useChain([
	...securityPluginEntries(plan),
	"postgresPlugin({ schemaPolicy: 'override', url: databaseUrl })",
	...apiPluginEntries(plan),
])}

// Override synchronization is only suitable for this disposable development database.
export const ultimabase = new Application({
  schemas: [${applicationSchemaNames(plan).join(', ')}],
${securityApplicationOption(plan)}
})
`

const baseSchemaSource = (plan: InitializerPlan): string =>
	plan.starter === 'task'
		? `${has(plan, 'validation-plugin') ? "import { z } from 'zod'" : ''}

// The same declaration drives TypeScript inference and Runtime validation.
export const Task = SchemaApplication.Schema.define({
  className: 'Task',
${has(plan, 'soft-delete-plugin') ? "  softDelete: 'replace-delete',\n" : ''}
${taskSecurityOptions(plan)}
  fields: (f) => ({
    title: f.string({
      required: true,
${has(plan, 'hooks-plugin') ? '      hooks: { resolveInput: ({ value }) => value?.trim() ?? null },\n' : ''}${has(plan, 'validation-plugin') ? '      validation: z.string().min(1).max(200),\n' : ''}    }),
    done: f.boolean({ default: false }),
  }),
})
`
		: `// Add your first SchemaApplication.Schema.define() declaration here.
export {}
`

const schemaSource = (plan: InitializerPlan): string => {
	const imports = [
		"import { UltimaBase } from '@ultimabase/core'",
		...(plan.typegen
			? ["import { typegenPlugin } from '@ultimabase/typegen'"]
			: []),
		...pluginImports(plan, behaviorPlugins),
		...securitySchemaImports(plan),
		...apiSchemaPluginImports(plan),
	]
	const entries = [
		...(plan.typegen ? ['typegenPlugin()'] : []),
		...behaviorPlugins
			.filter(([id]) => has(plan, id))
			.map(([, , entry]) => entry),
		...securitySchemaPluginEntries(plan),
		...apiSchemaPluginEntries(plan),
	]
	return `${imports.join('\n')}\n\nexport const SchemaApplication = UltimaBase${useChain(entries)}\n\n${baseSchemaSource(plan)}\n${securitySchemaDeclarations(plan)}\n`
}

const taskCommand = (plan: InitializerPlan): string =>
	`  const task = await Task.createOne(
    { data: { title: 'Ship the first feature' } }${needsMasterKey(plan) ? ',\n    { useMasterKey: true }' : ''},
  )
  console.log(task.toJSON())
`

const mainSource = (
	plan: InitializerPlan,
): string => `${plan.starter === 'task' ? "import { Task } from './schema.js'\n" : ''}import { ultimabase } from './ultimabase.js'

try {
  await ultimabase.start()
${plan.starter === 'task' ? taskCommand(plan) : "  console.log('UltimaBase is ready')\n"}${
	hasHttpListener(plan)
		? `  console.log('Local API listening on http://127.0.0.1:1337')
  // Keep the managed listener alive until the local process is stopped.
  await new Promise${plan.language === 'ts' ? '<void>' : ''}((resolve) => {
    process.once('SIGINT', () => resolve())
    process.once('SIGTERM', () => resolve())
  })
`
		: ''
}} finally {
  await ultimabase.dispose()
}
`

const typegenScript = `import path from 'node:path'
import {
  generateApplicationTypes,
  loadTypegenApplication,
  writeGeneratedTypeFiles,
} from '@ultimabase/typegen'

const applicationId = 'main'
const outputPath = path.resolve('.ultimabase/schema.generated.d.ts')
// Load the configured application without starting it or connecting to PostgreSQL.
const ultimabase = await loadTypegenApplication({
  sourcePath: './src/ultimabase.ts',
  exportName: 'ultimabase',
})
const generated = generateApplicationTypes({ ultimabase, applicationId })
await writeGeneratedTypeFiles([
  { applicationId, contents: generated.contents, outputPath },
])
`

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
			has(plan, 'pg-vector-plugin'),
			'PostgreSQL Vector is installed for its logical value contract only. This starter does not persist vectors or offer vector search.',
		],
		[
			plan.starter === 'empty' && plan.plugins.length > 1,
			'Optional plugins are configured, but this empty application has no schema for schema-local behavior.',
		],
	])
}

const projectReadme = (plan: InitializerPlan): string => `# ${plan.name}

Generated UltimaBase ${plan.language === 'ts' ? 'TypeScript' : 'JavaScript'} application.
${plan.starter === 'task' ? 'The Task starter writes one record on each run.' : 'This empty application starts and stops without a data operation.'}

## Before running

- Node.js 24 or newer.
${plan.database === 'docker' ? '- Docker Compose. Run docker compose up -d to start the disposable local PostgreSQL 17 service. Its credentials live only in the ignored .env file.' : '- A dedicated disposable PostgreSQL database. Copy .env.example to .env and set DATABASE_URL; the initializer does not create your database.'}
- The application uses direct schema synchronization with override for a disposable development database. Do not point it at production or shared data.
${plan.typegen ? '- Typegen generates replaceable declarations before typecheck and build; it does not create a Runtime client or connect to PostgreSQL.' : '- JavaScript runs the same application graph without Typegen or generated declarations.'}
${behaviorReadmeNotes(plan)
	.map((note) => `- ${note}\n`)
	.join('')}
${securityReadmeNotes(plan)
	.map((note) => `- ${note}`)
	.join('\n')}
${apiReadmeNotes(plan)
	.map((note) => `- ${note}`)
	.join('\n')}

## Run

Commands:
${nextCommands(plan)
	.slice(1)
	.map((command) => '    ' + command)
	.join('\n')}


${plan.database === 'docker' ? 'When finished, docker compose down -v removes the disposable database volume.' : 'Keep .env private. It is ignored by Git.'}
`

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
	for (const id of dependencyOrder)
		if (has(plan, id)) dependencies[`@ultimabase/${id}`] = '^0.0.0'
	if (has(plan, 'validation-plugin') && plan.starter === 'task')
		dependencies.zod = '^4.4.3'
	if (plan.typegen) dependencies['@ultimabase/typegen'] = '^0.0.0'
	const packageJson = {
		name: plan.name,
		version: '0.0.0',
		private: true,
		type: 'module',
		scripts: plan.typegen
			? {
					'generate:types': 'node --env-file=.env scripts/generate-types.mjs',
					typecheck:
						'node --env-file=.env scripts/generate-types.mjs && tsc --noEmit',
					build: 'node --env-file=.env scripts/generate-types.mjs && tsc',
					start: 'node --env-file=.env dist/main.js',
				}
			: { start: 'node --env-file=.env src/main.js' },
		dependencies,
		...(plan.typegen
			? { devDependencies: { '@types/node': '^24.0.0', typescript: '^6.0.3' } }
			: {}),
	}
	const files = new Map<string, string>([
		['package.json', `${JSON.stringify(packageJson, null, 2)}\n`],
		['.gitignore', '.env\n.ultimabase/\ndist/\nnode_modules/\n'],
		[
			'.env.example',
			(plan.database === 'docker'
				? 'POSTGRES_PASSWORD=<generated-local-secret>\nDATABASE_URL=postgres://ultimabase:<generated-local-secret>@127.0.0.1:54329/ultimabase\n'
				: 'DATABASE_URL=postgres://user:password@127.0.0.1:5432/your_disposable_database\n') +
				(needsMasterKey(plan)
					? 'ULTIMABASE_MASTER_KEY=<generate-a-random-local-key>\n'
					: '') +
				// GraphQL refuses to start in production without a stable cursor secret.
				(has(plan, 'graphql-plugin')
					? 'ULTIMABASE_CURSOR_SECRET=<generate-a-random-secret-of-32-characters>\n'
					: ''),
		],
		[`src/schema.${extension}`, schemaSource(plan)],
		[`src/ultimabase.${extension}`, applicationSource(plan)],
		[`src/main.${extension}`, mainSource(plan)],
		['README.md', projectReadme(plan)],
	])
	if (plan.typegen) {
		files.set(
			'tsconfig.json',
			`${JSON.stringify(
				{
					compilerOptions: {
						module: 'NodeNext',
						moduleResolution: 'NodeNext',
						outDir: 'dist',
						rootDir: 'src',
						skipLibCheck: true,
						strict: true,
						target: 'ES2024',
						types: ['node'],
					},
					include: ['src', '.ultimabase/**/*.d.ts'],
				},
				null,
				2,
			)}\n`,
		)
		files.set('scripts/generate-types.mjs', typegenScript)
	}
	if (plan.database === 'docker') {
		if (!dockerPassword)
			throw new Error('A random Docker password is required.')
		let masterEntry = ''
		if (needsMasterKey(plan)) {
			if (!masterKey) throw new Error('A random local Master key is required.')
			masterEntry = `ULTIMABASE_MASTER_KEY=${masterKey}\n`
		}
		files.set('compose.yaml', composeFile)
		files.set(
			'.env',
			`POSTGRES_PASSWORD=${dockerPassword}\nDATABASE_URL=postgres://ultimabase:${dockerPassword}@127.0.0.1:54329/ultimabase\n${masterEntry}`,
		)
	}
	return files
}
