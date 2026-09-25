import path from 'node:path'

import {
	apiApplicationImports,
	apiDependencies,
	apiNextCommands,
	apiPluginEntries,
	apiReadmeNotes,
	hasHttpListener,
} from './api-template.js'
import type { PluginId } from './catalog.js'
import type { InitializerPlan, PackageManager } from './config.js'
import {
	needsMasterKey,
	securityApplicationImports,
	securityApplicationOption,
	securityDependencies,
	securityMasterSource,
	securityPluginEntries,
	securityPolicySource,
	securityReadmeNotes,
	securitySchemaDeclarations,
	securitySchemaImports,
	securitySchemaNames,
	taskSecurityOptions,
} from './security-template.js'

export type ProjectFiles = ReadonlyMap<string, string>

const includes = (plan: InitializerPlan, id: PluginId): boolean =>
	plan.plugins.includes(id)

const applicationSchemaNames = (plan: InitializerPlan): readonly string[] => [
	...(plan.starter === 'task' ? ['Task'] : []),
	...securitySchemaNames(plan),
]

const applicationSchemaImport = (plan: InitializerPlan): string => {
	const names = applicationSchemaNames(plan)
	return names.length === 0
		? ''
		: `import { ${names.join(', ')} } from './schema.js'\n`
}

const scriptCommand = (
	manager: PackageManager,
	script: 'build' | 'start' | 'typecheck',
): string => {
	if (manager === 'npm')
		return script === 'start' ? 'npm start' : `npm run ${script}`
	return `${manager} ${script}`
}

const installCommand = (manager: PackageManager): string =>
	manager === 'npm' ? 'npm install' : `${manager} install`

/** These commands come from the same scripts written into package.json. */
export const nextCommands = (plan: InitializerPlan): readonly string[] => [
	`cd ${path.relative(process.cwd(), plan.destination) || plan.destination}`,
	...(plan.database === 'docker'
		? ['docker compose up -d']
		: [
				`Create .env from .env.example and set DATABASE_URL for a disposable PostgreSQL database${needsMasterKey(plan) ? ' and a private random ULTIMABASE_MASTER_KEY' : ''}.`,
			]),
	...(!plan.install ? [installCommand(plan.packageManager)] : []),
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
): string => `import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
${securityApplicationImports(plan).join('\n')}
${apiApplicationImports(plan).join('\n')}
${includes(plan, 'hooks-plugin') ? "import { hooksPlugin } from '@ultimabase/hooks-plugin'\n" : ''}
${includes(plan, 'pg-vector-plugin') ? "import { pgVectorPlugin } from '@ultimabase/pg-vector-plugin'\n" : ''}
${includes(plan, 'soft-delete-plugin') ? "import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'\n" : ''}
${includes(plan, 'validation-plugin') ? "import { validationPlugin } from '@ultimabase/validation-plugin'\n" : ''}
${plan.typegen ? "import { typegenPlugin } from '@ultimabase/typegen'\n" : ''}
${applicationSchemaImport(plan)}
const databaseUrl = process.env.DATABASE_URL
if (databaseUrl === undefined) throw new TypeError('DATABASE_URL is required')
${securityMasterSource(plan)}
${securityPolicySource(plan)}

// Override synchronization is only suitable for this disposable development database.
export const ultimabase = new UltimaBase({
  schemas: [${applicationSchemaNames(plan).join(', ')}],
${securityApplicationOption(plan)}
  plugins: [
${plan.typegen ? '    typegenPlugin(),\n' : ''}${includes(plan, 'hooks-plugin') ? '    hooksPlugin(),\n' : ''}${includes(plan, 'pg-vector-plugin') ? '    pgVectorPlugin(),\n' : ''}${includes(plan, 'soft-delete-plugin') ? "    softDeletePlugin({ defaultMode: 'disabled' }),\n" : ''}${includes(plan, 'validation-plugin') ? '    validationPlugin(),\n' : ''}${securityPluginEntries(
	plan,
)
	.map((entry) => `    ${entry},\n`)
	.join('')}    postgresPlugin({ schemaPolicy: 'override', url: databaseUrl }),
${apiPluginEntries(plan)
	.map((entry) => `    ${entry},\n`)
	.join('')}
  ],
})
`

const baseSchemaSource = (plan: InitializerPlan): string =>
	plan.starter === 'task'
		? `import { Schema } from '@ultimabase/core'
${includes(plan, 'validation-plugin') ? "import { z } from 'zod'" : ''}

// The same declaration drives TypeScript inference and Runtime validation.
export const Task = Schema.define({
  className: 'Task',
${includes(plan, 'soft-delete-plugin') ? "  softDelete: 'replace-delete',\n" : ''}
${taskSecurityOptions(plan)}
  fields: (f) => ({
    title: f.string({
      required: true,
${includes(plan, 'hooks-plugin') ? '      hooks: { resolveInput: ({ value }) => value?.trim() ?? null },\n' : ''}${includes(plan, 'validation-plugin') ? '      validation: z.string().min(1).max(200),\n' : ''}    }),
    done: f.boolean({ default: false }),
  }),
})
`
		: `// Add your first Schema.define() declaration here.
export {}
`

const schemaSource = (plan: InitializerPlan): string => {
	const needsSchemaImport =
		plan.starter === 'empty' &&
		includes(plan, 'roles-plugin') &&
		!includes(plan, 'password-auth-plugin')
	const imports = [
		...(needsSchemaImport ? ["import { Schema } from '@ultimabase/core'"] : []),
		...securitySchemaImports(plan),
	]
	const declarations = securitySchemaDeclarations(plan)
	return `${imports.join('\n')}\n${baseSchemaSource(plan)}\n${declarations}\n`
}

const taskCommand = (plan: InitializerPlan): string =>
	`  const task = await Task.createOne(
    { data: { title: 'Ship the first feature' } },
    { ultimabase${needsMasterKey(plan) ? ', useMasterKey: true' : ''} },
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
const application = await loadTypegenApplication({
  sourcePath: './src/ultimabase.ts',
  exportName: 'ultimabase',
})
const generated = generateApplicationTypes({ application, applicationId })
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

const projectReadme = (plan: InitializerPlan): string => `# ${plan.name}

Generated UltimaBase ${plan.language === 'ts' ? 'TypeScript' : 'JavaScript'} application.
${plan.starter === 'task' ? 'The Task starter writes one record on each run.' : 'This empty application starts and stops without a data operation.'}

## Before running

- Node.js 24 or newer.
${plan.database === 'docker' ? '- Docker Compose. Run docker compose up -d to start the disposable local PostgreSQL 17 service. Its credentials live only in the ignored .env file.' : '- A dedicated disposable PostgreSQL database. Copy .env.example to .env and set DATABASE_URL; the initializer does not create your database.'}
- The application uses direct schema synchronization with override for a disposable development database. Do not point it at production or shared data.
${plan.typegen ? '- Typegen generates replaceable declarations before typecheck and build; it does not create a Runtime client or connect to PostgreSQL.' : '- JavaScript runs the same application graph without Typegen or generated declarations.'}
${includes(plan, 'hooks-plugin') && plan.starter === 'task' ? '- Hooks normalize Task titles before the database mutation.\n' : ''}${includes(plan, 'validation-plugin') && plan.starter === 'task' ? '- Validation rejects Task titles outside 1–200 characters after input resolution.\n' : ''}${includes(plan, 'soft-delete-plugin') && plan.starter === 'task' ? `- Soft Delete replaces native Task deletion with a recoverable tombstone. Restore and purge require trusted, audited Master access; ${needsMasterKey(plan) ? 'this starter configures local Master for development but does not add restore or purge commands.' : 'this starter does not configure it.'}\n` : ''}${includes(plan, 'pg-vector-plugin') ? '- PostgreSQL Vector is installed for its logical value contract only. This starter does not persist vectors or offer vector search.\n' : ''}${plan.starter === 'empty' && plan.plugins.length > 1 ? '- Optional plugins are configured, but this empty application has no schema for schema-local behavior.\n' : ''}
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
		...securityDependencies(plan),
		...apiDependencies(plan),
		...(includes(plan, 'hooks-plugin')
			? { '@ultimabase/hooks-plugin': '^0.0.0' }
			: {}),
		...(includes(plan, 'pg-vector-plugin')
			? { '@ultimabase/pg-vector-plugin': '^0.0.0' }
			: {}),
		...(includes(plan, 'soft-delete-plugin')
			? { '@ultimabase/soft-delete-plugin': '^0.0.0' }
			: {}),
		...(includes(plan, 'validation-plugin')
			? { '@ultimabase/validation-plugin': '^0.0.0' }
			: {}),
		...(includes(plan, 'validation-plugin') && plan.starter === 'task'
			? { zod: '^4.4.3' }
			: {}),
		...(plan.typegen ? { '@ultimabase/typegen': '^0.0.0' } : {}),
	}
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
