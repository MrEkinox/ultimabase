import { describe, expect, it } from 'vitest'

import { nextCommands, renderBaseFiles } from './base-template.js'
import { resolveSelection } from './config.js'

describe('base project templates', () => {
	it.each([
		['hooks-plugin', 'hooksPlugin()'],
		['soft-delete-plugin', 'softDeletePlugin()'],
		['validation-plugin', 'validationPlugin()'],
	] as const)(
		'includes only the selected %s factory in both languages',
		(id, factory) => {
			for (const language of ['ts', 'js'] as const) {
				const plan = resolveSelection(
					{ name: 'notes', language, plugins: [id] },
					'/tmp',
				)
				const files = renderBaseFiles(plan)
				const manifest = JSON.parse(files.get('package.json') ?? '{}') as {
					readonly dependencies: Record<string, string>
				}
				const schema = files.get(`src/schema.${language}`) ?? ''
				expect(manifest.dependencies).toHaveProperty(`@ultimabase/${id}`)
				expect(schema).toContain(factory)
				expect(plan.plugins).toContain('postgres-plugin')
			}
		},
	)

	// ADR-0327 decisions 5 and 7: Node runs the sources, Vitest the first test.
	it('writes dev, test and build scripts and the first test without Typegen', () => {
		const plan = resolveSelection(
			{ name: 'notes', install: false, apis: ['rest'] },
			'/tmp',
		)
		const files = renderBaseFiles(plan)
		const manifest = JSON.parse(files.get('package.json') ?? '{}') as {
			readonly dependencies: Record<string, string>
			readonly devDependencies: Record<string, string>
			readonly scripts: Record<string, string>
		}
		expect(manifest.scripts).toEqual({
			dev: 'node --watch --env-file=.env src/main.ts',
			build: 'tsc -p tsconfig.build.json',
			start: 'node --env-file=.env dist/main.js',
			typecheck: 'tsc',
			test: 'vitest run',
		})
		expect(manifest.dependencies).not.toHaveProperty('@ultimabase/typegen')
		expect(manifest.devDependencies).toHaveProperty('@ultimabase/testing')
		expect(manifest.devDependencies).toHaveProperty('vitest')
		expect(
			[...files.keys()].filter((name) => name.includes('generate')),
		).toEqual([])
		expect(files.get('src/main.ts')).toContain("from './schema.ts'")
		expect(files.get('vitest.config.ts')).toContain('...ultimabaseTesting()')
		const test = files.get('tests/task.test.ts') ?? ''
		expect(test).toContain('await using t = await testApplication(ultimabase)')
		expect(test).toContain("await t.fetch('/api/classes/Task')")
		expect(files.get('tsconfig.json')).toContain(
			'"rewriteRelativeImportExtensions": true',
		)
		expect(nextCommands(plan)).toEqual(
			expect.arrayContaining(['npm install', 'npm run dev']),
		)
	})

	it('writes JavaScript without TypeScript', () => {
		const plan = resolveSelection(
			{
				name: 'notes',
				language: 'js',
				starter: 'empty',
				packageManager: 'pnpm',
				install: false,
			},
			'/tmp',
		)
		const files = renderBaseFiles(plan)
		const manifest = JSON.parse(files.get('package.json') ?? '{}') as {
			readonly dependencies: Record<string, string>
			readonly devDependencies: Record<string, string>
			readonly scripts: Record<string, string>
		}
		expect(
			[...files.keys()].filter(
				(name) => name.endsWith('.ts') || name.startsWith('tsconfig'),
			),
		).toEqual([])
		expect(manifest.devDependencies).toEqual({
			'@ultimabase/testing': '^0.0.0',
			vitest: '^4.1.11',
		})
		expect(manifest.scripts).toEqual({
			dev: 'node --watch --env-file=.env src/main.js',
			start: 'node --env-file=.env src/main.js',
			test: 'vitest run --passWithNoTests',
		})
		expect(files.has('tests/task.test.js')).toBe(false)
		expect(files.get('src/main.js')).not.toContain('Task.createOne')
		expect(nextCommands(plan)).toEqual(
			expect.arrayContaining(['pnpm install', 'pnpm dev']),
		)
	})

	// ADR-0327 decision 8: an existing database URL is written to .env.
	it('writes .env for an existing database URL', () => {
		const plan = resolveSelection(
			{
				name: 'notes',
				databaseUrl: 'postgres://user:secret@127.0.0.1:5432/notes',
			},
			'/tmp',
		)
		const files = renderBaseFiles(plan)
		expect(files.get('.env')).toBe(
			'DATABASE_URL=postgres://user:secret@127.0.0.1:5432/notes\n',
		)
		expect(nextCommands(plan).join('\n')).not.toContain('Create .env')
	})

	// `up -d` returns before PostgreSQL accepts connections; `--wait` uses the
	// generated healthcheck so the next start cannot race the database.
	it('waits for the Compose healthcheck before the next command', () => {
		const plan = resolveSelection({ name: 'notes', database: 'docker' }, '/tmp')
		const files = renderBaseFiles(plan, 'fixed-test-password')
		expect(files.get('compose.yaml')).toContain('healthcheck:')
		expect(nextCommands(plan)).toContain('docker compose up -d --wait')
		expect(files.get('README.md')).toContain('docker compose up -d --wait')
	})

	it('keeps Docker credentials private and Compose mapped to loopback', () => {
		const plan = resolveSelection({ name: 'notes', database: 'docker' }, '/tmp')
		const files = renderBaseFiles(plan, 'fixed-test-password')
		expect(files.get('compose.yaml')).toContain('127.0.0.1:54329:5432')
		expect(files.get('compose.yaml')).toContain(
			'POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}',
		)
		expect(files.get('.env')).toContain('fixed-test-password')
		expect(files.get('.gitignore')).toContain('.env\n')
		expect(files.get('.env.example')).not.toContain('fixed-test-password')
		expect(() => renderBaseFiles(plan)).toThrow('random Docker password')
	})

	it('composes data and behavior plugins into a runnable Task graph', () => {
		const plan = resolveSelection(
			{
				name: 'behavior-notes',
				plugins: ['hooks-plugin', 'soft-delete-plugin', 'validation-plugin'],
			},
			'/tmp',
		)
		const files = renderBaseFiles(plan)
		const manifest = JSON.parse(files.get('package.json') ?? '{}') as {
			readonly dependencies: Record<string, string>
		}
		const schema = files.get('src/schema.ts') ?? ''
		for (const id of plan.plugins)
			expect(manifest.dependencies).toHaveProperty(`@ultimabase/${id}`)
		expect(manifest.dependencies).toHaveProperty('zod')
		expect(schema).toContain('hooksPlugin()')
		expect(schema).toContain('softDeletePlugin()')
		expect(schema).toContain('validationPlugin()')
		expect(schema).toContain('}).softDelete()')
		expect(schema).toContain('resolveInput:')
		expect(schema).toContain('validation: z.string().min(1).max(200)')
	})

	it('keeps schema-local options out of an empty JavaScript project', () => {
		const plan = resolveSelection(
			{
				name: 'empty-behavior',
				language: 'js',
				starter: 'empty',
				plugins: ['hooks-plugin', 'soft-delete-plugin', 'validation-plugin'],
			},
			'/tmp',
		)
		const files = renderBaseFiles(plan)
		const schema = files.get('src/schema.js') ?? ''
		expect(schema).not.toContain('export const Task')
		expect(schema).toContain('validationPlugin()')
		expect(files.get('package.json')).not.toContain('"zod"')
		expect(files.get('README.md')).toContain(
			'no schema for schema-local behavior',
		)
	})

	it.each([
		['access-plugin', 'accessPlugin('],
		['acl-permissions-plugin', 'aclPlugin()'],
		['roles-plugin', 'rolesPlugin()'],
	] as const)(
		'adds %s without a public route in TypeScript and JavaScript',
		(id, factory) => {
			for (const language of ['ts', 'js'] as const) {
				const plan = resolveSelection(
					{ name: 'secure-notes', language, plugins: [id] },
					'/tmp',
				)
				const files = renderBaseFiles(plan)
				const application = files.get(`src/ultimabase.${language}`) ?? ''
				const schema = files.get(`src/schema.${language}`) ?? ''
				const main = files.get(`src/main.${language}`) ?? ''
				const manifest = JSON.parse(files.get('package.json') ?? '{}') as {
					readonly dependencies: Record<string, string>
				}
				expect(manifest.dependencies).toHaveProperty(`@ultimabase/${id}`)
				expect(schema).toContain(factory)
				expect(application).not.toContain('restPlugin(')
				expect(application).not.toContain('graphqlYogaPlugin(')
				expect(application).not.toContain('cookie:')
				expect(application).not.toContain('console.log(masterKey)')
				// ADR-0327: the prototype opening needs no Master key; an empty
				// ACL and role administration still do.
				const master = id !== 'access-plugin'
				expect(application.includes('new MasterAuthority({')).toBe(master)
				expect(main.includes('useMasterKey: true')).toBe(master)
				expect(
					files
						.get('.env.example')
						?.includes('ULTIMABASE_MASTER_KEY=<generate-a-random-local-key>'),
				).toBe(master)
				if (id === 'access-plugin') {
					expect(schema).toContain(
						"accessPlugin({ allowWithoutRule: { all: 'development' } })",
					)
					expect(schema).not.toContain('access: {')
				}
				if (id === 'acl-permissions-plugin') {
					expect(schema).toContain('  .acl()\n  .with({')
					expect(schema).toContain('    acl: { default: new ACL() },')
				}
				if (id === 'roles-plugin') {
					expect(schema).toContain('SchemaApplication.RoleSchema.define({')
					expect(schema).toContain(
						'export const Member = SchemaApplication.Schema.define(',
					)
					expect(application).toContain('schemas: [Task, Member, AppRole]')
					// The Register cycle is fixed in Core (ADR-0297 note of
					// 2026-10-12): no `.with({})` only to finish a declaration.
					expect(schema).not.toContain('.with({})')
				}
			}
		},
	)

	// ADR-0326: the User comes from authPlugin; sign-up needs no Master key.
	it('adds auth-plugin with password() and no Master key in TypeScript and JavaScript', () => {
		for (const language of ['ts', 'js'] as const) {
			const plan = resolveSelection(
				{ name: 'secure-notes', language, plugins: ['auth-plugin'] },
				'/tmp',
			)
			const files = renderBaseFiles(plan)
			const application = files.get(`src/ultimabase.${language}`) ?? ''
			const schema = files.get(`src/schema.${language}`) ?? ''
			const manifest = JSON.parse(files.get('package.json') ?? '{}') as {
				readonly dependencies: Record<string, string>
			}
			expect(manifest.dependencies).toHaveProperty('@ultimabase/auth-plugin')
			expect(manifest.dependencies).toHaveProperty('@ultimabase/auth-password')
			expect(schema).toContain(
				"authPlugin({ methods: [password({ identifier: 'email' })] })",
			)
			expect(schema).toContain('SchemaApplication.UserSchema.define({')
			// The Register cycle is fixed in Core: no `.with({})` is needed.
			expect(schema).not.toContain('.with({})')
			expect(application).toContain('schemas: [Task, AppUser]')
			expect(application).not.toContain('MasterAuthority')
			expect(application).not.toContain('cookie:')
			expect(files.get('.env.example')).not.toContain('ULTIMABASE_MASTER_KEY')
		}
	})

	it('keeps authentication, membership and object policies independent', () => {
		const plan = resolveSelection(
			{
				name: 'secure-notes',
				plugins: ['auth-plugin', 'roles-plugin', 'acl-permissions-plugin'],
			},
			'/tmp',
		)
		const files = renderBaseFiles(plan)
		const schema = files.get('src/schema.ts') ?? ''
		const application = files.get('src/ultimabase.ts') ?? ''
		expect(schema).toContain('members: () => AppUser')
		// Roles reads the Core principal: rules no longer import the session token.
		expect(schema).not.toContain('passwordPrincipal')
		expect(schema).toContain('.acl()')
		expect(schema).not.toContain('resolveInput')
		expect(application).toContain('schemas: [Task, AppUser, AppRole]')
		expect(schema).not.toContain('accessPlugin(')
		expect(files.get('README.md')).toContain(
			'A session identifies a caller; it does not grant Task access',
		)
		expect(files.get('README.md')).toContain('ACL alone does not deny creation')
	})

	it('requires a local Master key for security Docker projects', () => {
		const plan = resolveSelection(
			{
				name: 'secure-notes',
				database: 'docker',
				plugins: ['acl-permissions-plugin'],
			},
			'/tmp',
		)
		expect(() => renderBaseFiles(plan, 'docker-password')).toThrow('Master key')
		const files = renderBaseFiles(plan, 'docker-password', 'test-master-key')
		expect(files.get('.env')).toContain('ULTIMABASE_MASTER_KEY=test-master-key')
		expect(files.get('.env.example')).not.toContain('test-master-key')
		expect(files.get('.gitignore')).toContain('.env\n')
	})

	// ADR-0297 amendment 1, ADR-0311, ADR-0312.
	it('writes Register, start() with await using and postgresPlugin() without environment code', () => {
		const typescript = renderBaseFiles(
			resolveSelection({ name: 'notes', install: false }, '/tmp'),
		)
		const application = typescript.get('src/ultimabase.ts') ?? ''
		expect(application).toContain(
			"declare module '@ultimabase/core' {\n  interface Register {\n    readonly app: typeof ultimabase\n  }\n}",
		)
		expect(application).not.toContain('process.env.DATABASE_URL')
		expect(typescript.get('src/schema.ts')).toContain(
			'UltimaBase.use(postgresPlugin())',
		)
		expect(typescript.get('src/main.ts')).toContain(
			'await using app = await ultimabase.start()',
		)
		expect(typescript.get('src/main.ts')).not.toContain('dispose()')

		// ADR-0322: role schemas come from App.RoleSchema, so Roles registers
		// the real application like any other selection.
		const roles = renderBaseFiles(
			resolveSelection(
				{ name: 'notes', install: false, plugins: ['roles-plugin'] },
				'/tmp',
			),
		).get('src/ultimabase.ts')
		expect(roles).toContain('readonly app: typeof ultimabase')
		expect(roles).toContain(
			"import { MasterAuthority } from '@ultimabase/core'",
		)

		const javascript = renderBaseFiles(
			resolveSelection(
				{ name: 'notes', install: false, language: 'js' },
				'/tmp',
			),
		)
		expect(javascript.get('src/ultimabase.js')).not.toContain('Register')
	})
})
