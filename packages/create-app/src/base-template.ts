import path from 'node:path'

import type { InitializerPlan, PackageManager } from './config.js'

export type ProjectFiles = ReadonlyMap<string, string>

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
				'Create .env from .env.example and set DATABASE_URL for a disposable PostgreSQL database.',
			]),
	...(!plan.install ? [installCommand(plan.packageManager)] : []),
	...(plan.typegen
		? [
				scriptCommand(plan.packageManager, 'typecheck'),
				scriptCommand(plan.packageManager, 'build'),
			]
		: []),
	scriptCommand(plan.packageManager, 'start'),
]

const applicationSource = (
	plan: InitializerPlan,
): string => `import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
${plan.typegen ? "import { typegenPlugin } from '@ultimabase/typegen'\n" : ''}
${plan.starter === 'task' ? "import { Task } from './schema.js'\n" : ''}
const databaseUrl = process.env.DATABASE_URL
if (databaseUrl === undefined) throw new TypeError('DATABASE_URL is required')

// Override synchronization is only suitable for this disposable development database.
export const ultimabase = new UltimaBase({
  schemas: [${plan.starter === 'task' ? 'Task' : ''}],
  plugins: [
${plan.typegen ? '    typegenPlugin(),\n' : ''}    postgresPlugin({ schemaPolicy: 'override', url: databaseUrl }),
  ],
})
`

const schemaSource = (plan: InitializerPlan): string =>
	plan.starter === 'task'
		? `import { Schema } from '@ultimabase/core'

// The same declaration drives TypeScript inference and Runtime validation.
export const Task = Schema.define({
  className: 'Task',
  fields: (f) => ({
    title: f.string({ required: true }),
    done: f.boolean({ default: false }),
  }),
})
`
		: `// Add your first Schema.define() declaration here.
export {}
`

const mainSource = (
	plan: InitializerPlan,
): string => `${plan.starter === 'task' ? "import { Task } from './schema.js'\n" : ''}import { ultimabase } from './ultimabase.js'

try {
  await ultimabase.start()
${plan.starter === 'task' ? "  const task = await Task.createOne({ data: { title: 'Ship the first feature' } }, { ultimabase })\n  console.log(task.toJSON())\n" : "  console.log('UltimaBase is ready')\n"}} finally {
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
  ...generated.outputs.map((output) => ({
    applicationId: [applicationId, output.owner, output.contributionId].join(':'),
    contents: output.contents,
    kind: output.kind,
    outputPath: path.resolve(path.dirname(outputPath), output.outputPath),
  })),
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

## Run

Commands:
${nextCommands(plan)
	.slice(1)
	.map((command) => '    ' + command)
	.join('\n')}


${plan.database === 'docker' ? 'When finished, docker compose down -v removes the disposable database volume.' : 'Keep .env private. It is ignored by Git.'}
`

/** Render only the base PostgreSQL project; later issues add plugin families. */
export const renderBaseFiles = (
	plan: InitializerPlan,
	dockerPassword?: string,
): ProjectFiles => {
	const extension = plan.language
	const dependencies: Record<string, string> = {
		'@ultimabase/core': '^0.0.0',
		'@ultimabase/postgres-plugin': '^0.0.0',
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
			plan.database === 'docker'
				? 'POSTGRES_PASSWORD=<generated-local-secret>\nDATABASE_URL=postgres://ultimabase:<generated-local-secret>@127.0.0.1:54329/ultimabase\n'
				: 'DATABASE_URL=postgres://user:password@127.0.0.1:5432/your_disposable_database\n',
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
		files.set('compose.yaml', composeFile)
		files.set(
			'.env',
			`POSTGRES_PASSWORD=${dockerPassword}\nDATABASE_URL=postgres://ultimabase:${dockerPassword}@127.0.0.1:54329/ultimabase\n`,
		)
	}
	return files
}
