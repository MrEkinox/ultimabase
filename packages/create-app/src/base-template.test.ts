import { describe, expect, it } from 'vitest'

import { nextCommands, renderBaseFiles } from './base-template.js'
import { resolveSelection } from './config.js'

describe('base project templates', () => {
	it.each([
		['hooks-plugin', 'hooksPlugin()'],
		['soft-delete-plugin', "softDeletePlugin({ defaultMode: 'disabled' })"],
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

	it('puts Typegen in the same TypeScript application graph and before both checks', () => {
		const plan = resolveSelection({ name: 'notes', install: false }, '/tmp')
		const files = renderBaseFiles(plan)
		const manifest = JSON.parse(files.get('package.json') ?? '{}') as {
			readonly dependencies: Record<string, string>
			readonly scripts: Record<string, string>
		}
		expect(files.get('src/schema.ts')).toContain('typegenPlugin()')
		expect(files.get('scripts/generate-types.mjs')).toContain(
			'loadTypegenApplication',
		)
		expect(files.get('tsconfig.json')).toContain('.ultimabase/**/*.d.ts')
		expect(manifest.dependencies).toHaveProperty('@ultimabase/typegen')
		expect(manifest.scripts.typecheck).toMatch(
			/^node --env-file=\.env scripts\/generate-types\.mjs && tsc --noEmit$/,
		)
		expect(manifest.scripts.build).toMatch(
			/^node --env-file=\.env scripts\/generate-types\.mjs && tsc$/,
		)
		expect(nextCommands(plan)).toEqual(
			expect.arrayContaining([
				'npm install',
				'npm run typecheck',
				'npm run build',
				'npm start',
			]),
		)
	})

	it('writes JavaScript without Typegen, TypeScript, or generated declarations', () => {
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
			readonly devDependencies?: Record<string, string>
			readonly scripts: Record<string, string>
		}
		expect(
			[...files.keys()].filter(
				(name) =>
					name.endsWith('.ts') ||
					name === 'tsconfig.json' ||
					name.startsWith('.ultimabase'),
			),
		).toEqual([])
		expect(manifest.dependencies).not.toHaveProperty('@ultimabase/typegen')
		expect(manifest.devDependencies).toBeUndefined()
		expect(manifest.scripts).toEqual({
			start: 'node --env-file=.env src/main.js',
		})
		expect(files.get('src/main.js')).not.toContain('Task.createOne')
		expect(nextCommands(plan)).toEqual(
			expect.arrayContaining(['pnpm install', 'pnpm start']),
		)
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
		expect(schema).toContain("softDeletePlugin({ defaultMode: 'disabled' })")
		expect(schema).toContain('validationPlugin()')
		expect(schema).toContain("softDelete: 'replace-delete'")
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
		['access-plugin', 'accessPlugin()'],
		['acl-permissions-plugin', 'aclPlugin()'],
		['password-auth-plugin', 'passwordAuthPlugin({ user: AppUser })'],
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
				const pluginOwner = id === 'password-auth-plugin' ? application : schema
				expect(pluginOwner).toContain(factory)
				expect(application).toContain('new MasterAuthority({')
				expect(application).toContain('requestId: event.requestId')
				expect(application).not.toContain('restPlugin(')
				expect(application).not.toContain('graphqlYogaPlugin(')
				expect(application).not.toContain('cookie:')
				expect(application).not.toContain('console.log(masterKey)')
				expect(main).toContain('useMasterKey: true')
				expect(files.get('.env.example')).toContain(
					'ULTIMABASE_MASTER_KEY=<generate-a-random-local-key>',
				)
				if (id === 'access-plugin')
					expect(schema).toContain(
						'read: false, create: false, update: false, delete: false',
					)
				if (id === 'acl-permissions-plugin')
					expect(schema).toContain('default: () => new ACL()')
				if (id === 'password-auth-plugin') {
					expect(schema).toContain(
						'PasswordUserSchema.define(SchemaApplication.Schema, {',
					)
					expect(application).toContain('schemas: [Task, AppUser]')
				}
				if (id === 'roles-plugin') {
					expect(schema).toContain('RoleSchema.define(')
					expect(schema).toContain(
						'export const Member = SchemaApplication.Schema.define(',
					)
					expect(application).toContain('schemas: [Task, Member, AppRole]')
				}
			}
		},
	)

	it('keeps authentication, membership and object policies independent', () => {
		const plan = resolveSelection(
			{
				name: 'secure-notes',
				plugins: [
					'password-auth-plugin',
					'roles-plugin',
					'acl-permissions-plugin',
				],
			},
			'/tmp',
		)
		const files = renderBaseFiles(plan)
		const schema = files.get('src/schema.ts') ?? ''
		const application = files.get('src/ultimabase.ts') ?? ''
		expect(schema).toContain('schema: AppUser')
		// Roles reads the Core principal: rules no longer import the session token.
		expect(schema).not.toContain('passwordPrincipal')
		expect(schema).toContain(
			'resolveInput: ({ currentAcl, inputAcl }) => inputAcl ?? currentAcl ?? new ACL()',
		)
		expect(application).toContain('schemas: [Task, AppUser, AppRole]')
		expect(application).not.toContain('accessPlugin()')
		expect(files.get('README.md')).toContain(
			'A session identifies a caller; it does not grant Task access',
		)
		expect(files.get('README.md')).toContain('ACL alone does not deny creation')
	})

	it('requires a local Master key for security Docker projects', () => {
		const plan = resolveSelection(
			{ name: 'secure-notes', database: 'docker', plugins: ['access-plugin'] },
			'/tmp',
		)
		expect(() => renderBaseFiles(plan, 'docker-password')).toThrow('Master key')
		const files = renderBaseFiles(plan, 'docker-password', 'test-master-key')
		expect(files.get('.env')).toContain('ULTIMABASE_MASTER_KEY=test-master-key')
		expect(files.get('.env.example')).not.toContain('test-master-key')
		expect(files.get('.gitignore')).toContain('.env\n')
	})
})
