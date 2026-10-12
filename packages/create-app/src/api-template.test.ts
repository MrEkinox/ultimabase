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
			{ plugins: ['graphiql-plugin'] as const },
			[
				'graphiql-plugin',
				'graphql-plugin',
				'graphql-yoga-plugin',
				'http-plugin',
				'hono-server-plugin',
			],
		],
		[
			{ plugins: ['apollo-sandbox-plugin'] as const },
			[
				'apollo-sandbox-plugin',
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
			// One plugin list in the schema module (ADR-0312).
			const application = files.get(`src/schema.${language}`) ?? ''
			expect(application.includes('honoServerPlugin(')).toBe(
				plan.plugins.includes('hono-server-plugin'),
			)
			expect(application.includes('graphqlYogaPlugin(')).toBe(
				plan.plugins.includes('graphql-yoga-plugin'),
			)
			if (plan.plugins.includes('http-plugin')) {
				expect(application).toContain('httpPlugin()')
				expect(application).not.toContain('master: true')
				expect(application).not.toContain('browser: {')
				if (!plan.plugins.includes('hono-server-plugin')) {
					expect(files.get('README.md')).toContain(
						'this application opens no listener',
					)
				}
			}
			if (plan.plugins.includes('hono-server-plugin')) {
				// The listen address follows HOST and NODE_ENV (ADR-0312).
				expect(application).toContain('honoServerPlugin()')
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
		expect(schema).toContain('restPlugin({')
		expect(schema).toContain('graphqlPlugin({')
		expect(application).not.toContain('restPlugin({')
		expect(application).not.toContain('graphqlPlugin({')
		expect(schema).toContain('create: false, update: false, delete: false')
		expect(schema).toContain('acknowledgeUnverifiedProtection: true')
		expect(schema).toMatch(
			/export const Member = SchemaApplication\.Schema\.define\(\{[\s\S]*?rest: false,[\s\S]*?graphql: false,/u,
		)
		expect(schema).toMatch(
			/export const AppRole = SchemaApplication\.RoleSchema\.define\(\{[\s\S]*?\}\)\.with\(\{\n {2}rest: false,\n {2}graphql: false,\n\}\)/u,
		)
		expect(nextCommands(plan)).toEqual(
			expect.arrayContaining([
				"curl -i 'http://127.0.0.1:1337/api/v1/classes/Task?select=id,title,done'",
			]),
		)
	})

	it('uses exact Password Auth operation allowlists only for selected protocols', () => {
		const direct = resolveSelection(
			{ name: 'direct', plugins: ['password-auth-plugin'] },
			'/tmp',
		)
		expect(renderBaseFiles(direct).get('src/ultimabase.ts')).not.toContain(
			'passwordAuthOperations.',
		)
		const exposed = resolveSelection(
			{
				name: 'exposed',
				apis: ['rest', 'graphql'],
				plugins: ['password-auth-plugin', 'access-plugin'],
			},
			'/tmp',
		)
		const application = renderBaseFiles(exposed).get('src/ultimabase.ts') ?? ''
		const schema = renderBaseFiles(exposed).get('src/schema.ts') ?? ''
		expect(application).not.toContain('passwordAuthOperations.')
		expect(schema.match(/passwordAuthOperations\.signUp/gu)).toHaveLength(2)
		expect(schema).toContain('passwordAuthOperations.login')
		expect(schema).toContain('passwordAuthOperations.refresh')
		expect(schema).toContain('passwordAuthOperations.logout')
		expect(application).not.toContain('cookie:')
	})

	// ADR-0312: introspection and explorers follow NODE_ENV themselves.
	it('writes no environment expression for introspection or explorers', () => {
		const plain = resolveSelection({ name: 'plain', apis: ['graphql'] }, '/tmp')
		expect(renderBaseFiles(plain).get('src/schema.ts')).toContain(
			'graphqlYogaPlugin()',
		)
		const explorer = resolveSelection(
			{
				name: 'explorer',
				plugins: ['graphiql-plugin', 'apollo-sandbox-plugin'],
			},
			'/tmp',
		)
		const files = renderBaseFiles(explorer)
		const application = files.get('src/schema.ts') ?? ''
		expect(application).toContain('graphqlYogaPlugin()')
		expect(application).toContain('graphiqlPlugin()')
		expect(application).toContain('apolloSandboxPlugin()')
		for (const contents of files.values()) {
			expect(contents).not.toContain('NODE_ENV ===')
			expect(contents).not.toContain('NODE_ENV !==')
		}
		expect(application).not.toContain('allowInProduction: true')
	})
})
