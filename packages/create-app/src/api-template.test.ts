import { describe, expect, it } from 'vitest'

import { nextCommands, renderBaseFiles } from './base-template.js'
import { resolveSelection } from './config.js'

describe('API project templates', () => {
	it.each([
		[{ plugins: ['http-plugin'] as const }, ['http-plugin']],
		[
			{ apis: ['rest'] as const },
			['http-plugin', 'rest-plugin', 'hono-server-plugin'],
		],
		[
			{ apis: ['graphql'] as const },
			[
				'graphql-plugin',
				'graphql-yoga-plugin',
				'http-plugin',
				'hono-server-plugin',
			],
		],
		[
			{ plugins: ['hono-server-plugin'] as const },
			['http-plugin', 'hono-server-plugin'],
		],
		[{ plugins: ['graphql-plugin'] as const }, ['graphql-plugin']],
		[
			{ plugins: ['graphql-explorer-plugin'] as const },
			[
				'graphql-explorer-plugin',
				'graphql-plugin',
				'graphql-yoga-plugin',
				'http-plugin',
				'hono-server-plugin',
			],
		],
	] as const)('includes the complete graph for %j', (choice, expected) => {
		for (const language of ['ts', 'js'] as const) {
			const plan = resolveSelection(
				{ name: 'notes', language, ...choice },
				'/tmp',
			)
			const files = renderBaseFiles(plan)
			const manifest = JSON.parse(files.get('package.json') ?? '{}') as {
				readonly dependencies: Record<string, string>
			}
			for (const id of expected) {
				expect(plan.plugins).toContain(id)
				expect(manifest.dependencies).toHaveProperty(`@ultimabase/${id}`)
			}
			// One plugin list in the schema module (ADR-0312); apiServer()
			// installs HTTP, its transports and the server (ADR-0325).
			const application = files.get(`src/schema.${language}`) ?? ''
			expect(application.includes('...apiServer(')).toBe(
				plan.plugins.includes('http-plugin'),
			)
			expect('@ultimabase/api-server' in manifest.dependencies).toBe(
				plan.plugins.includes('http-plugin'),
			)
			expect(application.includes('server: false')).toBe(
				plan.plugins.includes('http-plugin') &&
					!plan.plugins.includes('hono-server-plugin'),
			)
			expect(application.includes('graphql: {')).toBe(
				plan.plugins.includes('graphql-yoga-plugin'),
			)
			expect(application.includes("explorer: 'graphiql'")).toBe(
				plan.plugins.includes('graphql-explorer-plugin'),
			)
			expect(application).not.toContain('master: true')
			expect(application).not.toContain('browser: {')
			if (
				plan.plugins.includes('http-plugin') &&
				!plan.plugins.includes('hono-server-plugin')
			) {
				expect(files.get('README.md')).toContain(
					'this application opens no listener',
				)
			}
			if (plan.plugins.includes('hono-server-plugin')) {
				// The listen address follows HOST and NODE_ENV (ADR-0312).
				expect(files.get(`src/main.${language}`)).toContain(
					"process.once('SIGTERM'",
				)
			}
		}
	})

	it('keeps Task APIs read-only and private role models off routes', () => {
		const plan = resolveSelection(
			{
				name: 'notes',
				apis: ['rest', 'graphql'],
				plugins: ['roles-plugin', 'acl-permissions-plugin'],
			},
			'/tmp',
		)
		const files = renderBaseFiles(plan)
		const application = files.get('src/ultimabase.ts') ?? ''
		const schema = files.get('src/schema.ts') ?? ''
		expect(schema).toContain('...apiServer({')
		expect(schema).toContain('rest: {')
		expect(schema).toContain('graphql: {')
		expect(application).not.toContain('apiServer(')
		// Both data APIs are read-only with the same keys (ADR-0325).
		expect(
			schema.match(
				/default: \{ createOne: false, updateOne: false, deleteOne: false \}/gu,
			),
		).toHaveLength(2)
		expect(schema).not.toContain('acknowledgeUnverifiedProtection')
		expect(schema).toMatch(
			/export const Member = SchemaApplication\.Schema\.define\(\{[\s\S]*?rest: false,[\s\S]*?graphql: false,/u,
		)
		expect(schema).toMatch(
			/export const AppRole = SchemaApplication\.RoleSchema\.define\(\{[\s\S]*?\}\)\.with\(\{\n {2}rest: false,\n {2}graphql: false,\n\}\)/u,
		)
		expect(nextCommands(plan)).toEqual(
			expect.arrayContaining([
				"curl -i 'http://127.0.0.1:1337/api/classes/Task?select=id,title,done'",
			]),
		)
	})

	it('serves authentication under /auth and hides it from REST only', () => {
		const direct = resolveSelection(
			{ name: 'direct', plugins: ['auth-plugin'] },
			'/tmp',
		)
		expect(renderBaseFiles(direct).get('src/schema.ts')).not.toContain(
			'authOperations',
		)
		const exposed = resolveSelection(
			{
				name: 'exposed',
				apis: ['rest', 'graphql'],
				plugins: ['auth-plugin', 'access-plugin'],
			},
			'/tmp',
		)
		const application = renderBaseFiles(exposed).get('src/ultimabase.ts') ?? ''
		const schema = renderBaseFiles(exposed).get('src/schema.ts') ?? ''
		expect(application).not.toContain('authOperations')
		// The `/auth` routes serve HTTP clients: REST hides every operation,
		// GraphQL exposes them (ADR-0324, ADR-0325, ADR-0326).
		expect(schema.match(/hide: \[/gu)).toHaveLength(1)
		expect(schema).toContain(
			'hide: [...Object.values(authOperations), ...Object.values(passwordOperations)]',
		)
		expect(application).not.toContain('cookie:')
	})

	// ADR-0312: introspection and explorers follow NODE_ENV themselves.
	it('writes no environment expression for introspection or explorers', () => {
		const plain = resolveSelection({ name: 'plain', apis: ['graphql'] }, '/tmp')
		expect(renderBaseFiles(plain).get('src/schema.ts')).toContain('graphql: {')
		const explorer = resolveSelection(
			{ name: 'explorer', plugins: ['graphql-explorer-plugin'] },
			'/tmp',
		)
		const files = renderBaseFiles(explorer)
		const application = files.get('src/schema.ts') ?? ''
		expect(application).toContain("explorer: 'graphiql'")
		expect(nextCommands(explorer)).toContain(
			'Open http://127.0.0.1:1337/graphiql in development.',
		)
		for (const contents of files.values()) {
			expect(contents).not.toContain('NODE_ENV ===')
			expect(contents).not.toContain('NODE_ENV !==')
		}
		expect(application).not.toContain('allowInProduction: true')
	})
})
