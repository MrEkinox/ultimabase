import { describe, expect, it } from 'vitest'

import { nextCommands, renderBaseFiles } from './base-template.js'
import { resolveSelection } from './config.js'

describe('API project templates', () => {
	it.each([
		[
			{ apis: ['rest'] as const },
			['http-plugin', 'rest-plugin', 'server-hono-plugin'],
		],
		[
			{ apis: ['graphql'] as const },
			[
				'graphql-plugin',
				'graphql-yoga-plugin',
				'http-plugin',
				'server-hono-plugin',
			],
		],
		[
			{ plugins: ['server-hono-plugin'] as const },
			['http-plugin', 'server-hono-plugin'],
		],
		[{ plugins: ['graphql-plugin'] as const }, ['graphql-plugin']],
		[
			{ plugins: ['graphiql-plugin'] as const },
			[
				'graphiql-plugin',
				'graphql-plugin',
				'graphql-yoga-plugin',
				'http-plugin',
				'server-hono-plugin',
			],
		],
		[
			{ plugins: ['apollo-sandbox-plugin'] as const },
			[
				'apollo-sandbox-plugin',
				'graphql-plugin',
				'graphql-yoga-plugin',
				'http-plugin',
				'server-hono-plugin',
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
			const application = files.get(`src/ultimabase.${language}`) ?? ''
			expect(application.includes('honoServerPlugin(')).toBe(
				plan.plugins.includes('server-hono-plugin'),
			)
			expect(application.includes('graphqlYogaPlugin(')).toBe(
				plan.plugins.includes('graphql-yoga-plugin'),
			)
			if (plan.plugins.includes('http-plugin')) {
				expect(application).toContain("httpPlugin({ appId: 'main' })")
				expect(application).not.toContain('master: { enabled: true }')
				expect(application).not.toContain('browser: {')
			}
			if (plan.plugins.includes('server-hono-plugin')) {
				expect(application).toContain("host: '127.0.0.1', port: 1337")
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
		expect(application).toContain('restPlugin({')
		expect(application).toContain('graphqlPlugin({')
		expect(application).toContain('create: false, update: false, delete: false')
		expect(application).toContain('acknowledgeUnverifiedProtection: true')
		expect(schema).toMatch(
			/export const Member = SchemaApplication\.Schema\.define\(\{[\s\S]*?rest: false,[\s\S]*?graphql: false,/u,
		)
		expect(schema).toMatch(
			/export const AppRole = RoleSchema\.define\(SchemaApplication\.Schema, \{[\s\S]*?rest: false,[\s\S]*?graphql: false,/u,
		)
		expect(nextCommands(plan)).toEqual(
			expect.arrayContaining([
				"curl -i -H 'X-UltimaBase-Application-Id: main' 'http://127.0.0.1:1337/api/v1/classes/Task?select=id,title,done'",
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
		expect(application.match(/passwordAuthOperations\.signUp/gu)).toHaveLength(
			2,
		)
		expect(application).toContain('passwordAuthOperations.login')
		expect(application).toContain('passwordAuthOperations.refresh')
		expect(application).toContain('passwordAuthOperations.logout')
		expect(application).not.toContain('cookie:')
	})

	it('enables introspection only for a selected development explorer', () => {
		const plain = resolveSelection({ name: 'plain', apis: ['graphql'] }, '/tmp')
		expect(renderBaseFiles(plain).get('src/ultimabase.ts')).toContain(
			'graphqlYogaPlugin()',
		)
		const explorer = resolveSelection(
			{
				name: 'explorer',
				plugins: ['graphiql-plugin', 'apollo-sandbox-plugin'],
			},
			'/tmp',
		)
		const application = renderBaseFiles(explorer).get('src/ultimabase.ts') ?? ''
		expect(application).toContain(
			"graphqlYogaPlugin({ introspection: process.env.NODE_ENV !== 'production' })",
		)
		expect(application).toContain(
			"process.env.NODE_ENV === 'production' ? 'production' : 'development'",
		)
		expect(application).not.toContain('allowInProduction: true')
	})
})
