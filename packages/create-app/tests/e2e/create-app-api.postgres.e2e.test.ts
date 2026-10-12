import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'

import {
	createProject,
	resolveSelection,
	type ApiId,
	type PluginId,
} from '@ultimabase/create-app'
import { describe, expect, it } from 'vitest'

import { createPostgresWorkerFixture } from '../../../../tests/fixtures/postgres-worker-fixture.js'

const execFileAsync = promisify(execFile)
const endpoint = 'http://127.0.0.1:1337'
const applicationHeader = { 'X-UltimaBase-Application-Id': 'main' }

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

const setupProject = async (
	prefix: string,
	options: {
		readonly language: 'ts' | 'js'
		readonly apis?: readonly ApiId[]
		readonly plugins?: readonly PluginId[]
	},
): Promise<{ readonly destination: string; dispose(): Promise<void> }> => {
	const fixture = await createPostgresWorkerFixture({ prefix })
	const parent = await mkdtemp(path.join(tmpdir(), 'ultimabase-api-project-'))
	try {
		const plan = resolveSelection(
			{ name: 'api-app', install: false, ...options },
			parent,
		)
		await createProject(plan)
		// Resolve workspace packages independently of root or package-local invocation.
		await symlink(
			path.resolve(import.meta.dirname, '../../../../node_modules'),
			path.join(plan.destination, 'node_modules'),
		)
		await writeFile(
			path.join(plan.destination, '.env'),
			`DATABASE_URL=${fixture.connectionUri}\nULTIMABASE_MASTER_KEY=local-test-only-master-key\n`,
			{ mode: 0o600 },
		)
		if (options.language === 'ts') {
			await execFileAsync('npm', ['run', 'build'], {
				cwd: plan.destination,
				maxBuffer: 1024 * 1024,
			})
		}
		return {
			destination: plan.destination,
			dispose: async () => {
				try {
					await rm(parent, { recursive: true, force: true })
				} finally {
					await fixture.dispose()
				}
			},
		}
	} catch (error) {
		await rm(parent, { recursive: true, force: true })
		await fixture.dispose()
		throw error
	}
}

const startServer = async (
	destination: string,
	language: 'ts' | 'js',
	environment = 'development',
): Promise<ChildProcessWithoutNullStreams> => {
	const main = language === 'ts' ? 'dist/main.js' : 'src/main.js'
	const child = spawn(process.execPath, ['--env-file=.env', main], {
		cwd: destination,
		env: { ...process.env, NODE_ENV: environment },
	})
	try {
		await new Promise<void>((resolve, reject) => {
			let output = ''
			const timer = setTimeout(() => {
				reject(new Error(`Generated server did not start: ${output}`))
			}, 20_000)
			const onOutput = (chunk: Buffer): void => {
				output += chunk.toString('utf8')
				if (output.includes('Local API listening on')) {
					clearTimeout(timer)
					resolve()
				}
			}
			child.stdout.on('data', onOutput)
			child.stderr.on('data', onOutput)
			child.once('exit', (code) => {
				clearTimeout(timer)
				reject(new Error(`Generated server exited ${String(code)}: ${output}`))
			})
		})
		return child
	} catch (error) {
		child.kill('SIGTERM')
		throw error
	}
}

const stopServer = async (
	child: ChildProcessWithoutNullStreams,
): Promise<void> => {
	if (child.exitCode !== null || child.signalCode !== null) return
	await new Promise<void>((resolve) => {
		child.once('exit', () => {
			resolve()
		})
		child.kill('SIGTERM')
	})
}

const graphql = (query: string, token?: string): Promise<Response> =>
	fetch(`${endpoint}/graphql`, {
		method: 'POST',
		headers: {
			...applicationHeader,
			'Content-Type': 'application/json',
			...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
		},
		body: JSON.stringify({ query }),
	})

describe('generated HTTP and GraphQL applications with PostgreSQL', () => {
	it('serves a read-only REST Task route and rejects an unknown application identity', async () => {
		const project = await setupProject('create_app_rest', {
			language: 'js',
			apis: ['rest'],
		})
		let server: ChildProcessWithoutNullStreams | undefined
		try {
			server = await startServer(project.destination, 'js')
			// ADR-0323: the header is optional, a different one is refused.
			const unknown = await fetch(`${endpoint}/api/classes/Task`, {
				headers: { 'X-UltimaBase-Application-Id': 'other' },
			})
			expect(unknown.status).toBe(404)
			expect(await unknown.text()).toContain('HTTP_APPLICATION_UNKNOWN')
			const headerless = await fetch(`${endpoint}/api/classes/Task`)
			expect(headerless.status).toBe(200)
			const health = await fetch(`${endpoint}/health`)
			expect(health.status).toBe(200)
			expect(await health.json()).toStrictEqual({ status: 'OK' })
			const read = await fetch(`${endpoint}/api/classes/Task`, {
				headers: applicationHeader,
			})
			expect(read.status).toBe(200)
			expect(await read.json()).toMatchObject({
				results: [{ title: 'Ship the first feature' }],
			})
			const create = await fetch(`${endpoint}/api/classes/Task`, {
				method: 'POST',
				headers: { ...applicationHeader, 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: 'Not exposed' }),
			})
			// ADR-0324: a disabled method answers 405, with its version header.
			expect(create.status).toBe(405)
			expect(create.headers.get('allow')).toBe('GET')
			expect(read.headers.get('x-ultimabase-rest-version')).toBe('1')
		} finally {
			if (server !== undefined) await stopServer(server)
			await project.dispose()
		}
	}, 60_000)

	it.each([
		['create_app_seed', []],
		// An empty ACL hides the seed from anonymous reads; the check must use Master.
		['create_app_seed_acl', ['acl-permissions-plugin']],
	] as const)(
		'keeps one seeded Task across restarts (%s)',
		async (prefix, plugins) => {
			const project = await setupProject(prefix, { language: 'js', plugins })
			try {
				const run = async (): Promise<string> => {
					const { stdout } = await execFileAsync(
						process.execPath,
						['--env-file=.env', 'src/main.js'],
						{ cwd: project.destination },
					)
					const id = /id: '([^']+)'/u.exec(stdout)?.[1]
					if (id === undefined)
						throw new TypeError(`Seeded Task was not printed: ${stdout}`)
					return id
				}
				const first = await run()
				expect(await run()).toBe(first)
				await writeFile(
					path.join(project.destination, 'verify.mjs'),
					`import { ultimabase } from './src/ultimabase.js'
import { Task } from './src/schema.js'

await ultimabase.start()
try {
  console.log('TASKS=' + (await Task.count({}${plugins.length > 0 ? ', { useMasterKey: true }' : ''})))
} finally {
  await ultimabase.dispose()
}
`,
				)
				const { stdout } = await execFileAsync(
					process.execPath,
					['--env-file=.env', 'verify.mjs'],
					{ cwd: project.destination },
				)
				expect(stdout).toContain('TASKS=1')
			} finally {
				await project.dispose()
			}
		},
		60_000,
	)

	// ADR-0312: introspection follows NODE_ENV; the template writes no expression.
	it('serves GraphQL reads with introspection only outside production', async () => {
		const project = await setupProject('create_app_graphql', {
			language: 'js',
			apis: ['graphql'],
		})
		let server: ChildProcessWithoutNullStreams | undefined
		try {
			server = await startServer(project.destination, 'js')
			const read = await graphql(
				'{ findManyTask(first: 10) { nodes { id title } } }',
			)
			expect(read.status).toBe(200)
			expect(await read.json()).toMatchObject({
				data: {
					findManyTask: { nodes: [{ title: 'Ship the first feature' }] },
				},
			})
			const introspection = await graphql('{ __schema { queryType { name } } }')
			expect(await introspection.json()).toEqual({
				data: { __schema: { queryType: { name: 'Query' } } },
			})
			await stopServer(server)
			server = await startServer(project.destination, 'js', 'production')
			const refused = await graphql('{ __schema { queryType { name } } }')
			expect(await refused.text()).toContain('errors')
		} finally {
			if (server !== undefined) await stopServer(server)
			await project.dispose()
		}
	}, 60_000)

	it('runs direct GraphQL without an HTTP listener', async () => {
		const project = await setupProject('create_app_direct_graphql', {
			language: 'js',
			plugins: ['graphql-plugin'],
		})
		try {
			const application = await readFile(
				path.join(project.destination, 'src/ultimabase.js'),
				'utf8',
			)
			expect(application).not.toContain('httpPlugin(')
			expect(application).not.toContain('honoServerPlugin(')
			await writeFile(
				path.join(project.destination, 'verify.mjs'),
				`import { ultimabase } from './src/ultimabase.js'
import { Task } from './src/schema.js'
import { anonymous } from '@ultimabase/core/plugin'

await ultimabase.start()
try {
  await Task.createOne({ data: { title: 'Direct GraphQL' } })
  const graphql = ultimabase.plugin('@ultimabase/graphql-plugin')
  const context = anonymous(ultimabase, { requestId: 'direct-graphql', source: 'internal' }).context
  const result = await graphql.execute({ context, document: '{ findManyTask(first: 10) { nodes { title } } }' })
  if (result.data?.findManyTask?.nodes?.[0]?.title !== 'Direct GraphQL') throw new Error('Direct GraphQL query failed')
  console.log('DIRECT_GRAPHQL_PASS')
} finally {
  await ultimabase.dispose()
}
`,
			)
			const { stdout } = await execFileAsync(
				process.execPath,
				['--env-file=.env', 'verify.mjs'],
				{ cwd: project.destination },
			)
			expect(stdout).toContain('DIRECT_GRAPHQL_PASS')
		} finally {
			await project.dispose()
		}
	}, 60_000)

	it('starts a Hono-only selection without inventing data routes', async () => {
		const project = await setupProject('create_app_hono_only', {
			language: 'js',
			plugins: ['hono-server-plugin'],
		})
		let server: ChildProcessWithoutNullStreams | undefined
		try {
			server = await startServer(project.destination, 'js')
			const response = await fetch(`${endpoint}/api/classes/Task`, {
				headers: applicationHeader,
			})
			expect(response.status).toBe(404)
			const application = await readFile(
				path.join(project.destination, 'src/ultimabase.js'),
				'utf8',
			)
			expect(application).not.toContain('restPlugin(')
			expect(application).not.toContain('graphqlPlugin(')
		} finally {
			if (server !== undefined) await stopServer(server)
			await project.dispose()
		}
	}, 60_000)

	it('authenticates HTTP sessions without claiming they grant access', async () => {
		const project = await setupProject('create_app_auth_only', {
			language: 'js',
			apis: ['rest'],
			plugins: ['password-auth-plugin'],
		})
		let server: ChildProcessWithoutNullStreams | undefined
		try {
			server = await startServer(project.destination, 'js')
			const signUp = await fetch(`${endpoint}/api/auth/sign-up`, {
				method: 'POST',
				headers: { ...applicationHeader, 'Content-Type': 'application/json' },
				body: JSON.stringify({
					input: {
						username: 'bob',
						password: 'correct horse battery staple',
					},
				}),
			})
			expect(signUp.status).toBe(200)
			const payload: unknown = await signUp.json()
			if (!isRecord(payload) || !isRecord(payload.result))
				throw new TypeError('Sign-up result is missing')
			const session = payload.result.session
			if (!isRecord(session) || typeof session.token !== 'string')
				throw new TypeError('Sign-up token is missing')
			for (const headers of [
				applicationHeader,
				{ ...applicationHeader, Authorization: `Bearer ${session.token}` },
			]) {
				const response = await fetch(`${endpoint}/api/classes/Task`, {
					headers,
				})
				expect(response.status).toBe(200)
			}
		} finally {
			if (server !== undefined) await stopServer(server)
			await project.dispose()
		}
	}, 60_000)

	it('exposes exact auth operations in both protocols without granting Task reads', async () => {
		const project = await setupProject('create_app_both', {
			language: 'ts',
			apis: ['rest', 'graphql'],
			plugins: ['password-auth-plugin', 'access-plugin'],
		})
		let server: ChildProcessWithoutNullStreams | undefined
		try {
			server = await startServer(project.destination, 'ts')
			const signUp = await fetch(`${endpoint}/api/auth/sign-up`, {
				method: 'POST',
				headers: { ...applicationHeader, 'Content-Type': 'application/json' },
				body: JSON.stringify({
					input: {
						username: 'alice',
						password: 'correct horse battery staple',
					},
				}),
			})
			expect(signUp.status).toBe(200)
			const payload: unknown = await signUp.json()
			if (!isRecord(payload) || !isRecord(payload.result))
				throw new TypeError('Sign-up result is missing')
			expect(payload.result.user).toMatchObject({ username: 'alice' })
			const session = payload.result.session
			if (!isRecord(session) || typeof session.token !== 'string')
				throw new TypeError('Sign-up token is missing')
			const graphqlLogin = await graphql(
				'mutation { login(input: { username: "alice", password: "correct horse battery staple" }) { user { id username } session { token } } }',
			)
			const loginPayload: unknown = await graphqlLogin.json()
			if (!isRecord(loginPayload) || !isRecord(loginPayload.data))
				throw new TypeError('GraphQL login result is missing')
			const login = loginPayload.data.login
			if (!isRecord(login) || !isRecord(login.session))
				throw new TypeError('GraphQL login session is missing')
			expect(typeof login.session.token).toBe('string')
			expect(login.user).toMatchObject({ username: 'alice' })
			const refreshed = await graphql(
				'mutation { refresh { user { id username } session { token } } }',
				String(login.session.token),
			)
			expect(await refreshed.json()).toMatchObject({
				data: { refresh: { user: { username: 'alice' } } },
			})
			const deniedRest = await fetch(`${endpoint}/api/classes/Task`, {
				headers: {
					...applicationHeader,
					Authorization: `Bearer ${session.token}`,
				},
			})
			expect(deniedRest.status).toBe(403)
			const deniedGraphql = await graphql(
				'{ findManyTask(first: 10) { nodes { title } } }',
				session.token,
			)
			expect(await deniedGraphql.text()).toContain('PERMISSION_DENIED')
			const application = await readFile(
				path.join(project.destination, 'src/ultimabase.ts'),
				'utf8',
			)
			expect(application).not.toContain('master: true')
		} finally {
			if (server !== undefined) await stopServer(server)
			await project.dispose()
		}
	}, 60_000)

	it('serves the explorer only in development with matching introspection', async () => {
		const project = await setupProject('create_app_explorers', {
			language: 'js',
			plugins: ['graphql-explorer-plugin'],
		})
		try {
			for (const environment of ['development', 'production']) {
				const server = await startServer(project.destination, 'js', environment)
				try {
					// One application: GraphiQL at /graphiql (ADR-0325).
					const response = await fetch(`${endpoint}/graphiql`)
					if (environment === 'development') expect(response.status).toBe(200)
					else expect(response.status).not.toBe(200)
					const response = await graphql('{ __schema { queryType { name } } }')
					const result = await response.text()
					if (environment === 'development')
						expect(result).toContain('__schema')
					else expect(result).toContain('errors')
				} finally {
					await stopServer(server)
				}
			}
		} finally {
			await project.dispose()
		}
	}, 60_000)
})
