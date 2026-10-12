import { execFile, spawn } from 'node:child_process'
import {
	cp,
	mkdir,
	mkdtemp,
	readdir,
	rm,
	symlink,
	writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'

import { createProject, resolveSelection } from '@ultimabase/create-app'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'

import { createPostgresWorkerFixture } from '../../../../tests/fixtures/postgres-worker-fixture.js'
import { postgresConnectionUriContextKey } from '../../../../tests/fixtures/postgres-context.js'

// ADR-0327 decisions 5 to 7: the default starter (REST, prototype Access)
// runs its TypeScript sources with Node, refuses production until rules are
// written, and its generated test passes with testApplication.
const execFileAsync = promisify(execFile)
const repositoryRoot = path.resolve(import.meta.dirname, '../../../..')
const repositoryModules = path.join(repositoryRoot, 'node_modules')

/**
 * Installs the built packages as a registry install would: real
 * `@ultimabase/*` directories, so Vitest loads them like any dependency.
 */
const installBuiltPackages = async (destination: string): Promise<void> => {
	const modules = path.join(destination, 'node_modules')
	await mkdir(path.join(modules, '@ultimabase'), { recursive: true })
	for (const entry of await readdir(repositoryModules)) {
		if (entry === '@ultimabase') continue
		await symlink(
			path.join(repositoryModules, entry),
			path.join(modules, entry),
		)
	}
	const packages = await readdir(path.join(repositoryRoot, 'packages'), {
		withFileTypes: true,
	})
	for (const { name } of packages.filter((entry) => entry.isDirectory())) {
		const source = path.join(repositoryRoot, 'packages', name)
		const target = path.join(modules, '@ultimabase', name)
		await mkdir(target)
		await cp(
			path.join(source, 'package.json'),
			path.join(target, 'package.json'),
		)
		await cp(path.join(source, 'dist'), path.join(target, 'dist'), {
			recursive: true,
		})
	}
}

let destination = ''
let parent = ''

beforeAll(async () => {
	parent = await mkdtemp(path.join(tmpdir(), 'ultimabase-starter-'))
	const plan = resolveSelection(
		{
			name: 'starter-app',
			apis: ['rest'],
			plugins: ['access-plugin'],
			install: false,
		},
		parent,
	)
	await createProject(plan)
	destination = plan.destination
	await installBuiltPackages(destination)
}, 60_000)

afterAll(async () => {
	await rm(parent, { recursive: true, force: true })
})

describe('the default create-app starter', () => {
	it('passes its generated test with testApplication', async () => {
		const admin = new Pool({
			connectionString: inject(postgresConnectionUriContextKey),
			max: 1,
		})
		const database = `starter_${String(process.env.VITEST_POOL_ID)}`
		const url = new URL(inject(postgresConnectionUriContextKey))
		url.pathname = `/${database}`
		try {
			await admin.query(`DROP DATABASE IF EXISTS "${database}"`)
			await admin.query(`CREATE DATABASE "${database}"`)
			// The nested run chooses its own worker slots.
			const environment = Object.fromEntries(
				Object.entries(process.env).filter(
					([name]) => name !== 'VITEST_POOL_ID',
				),
			)
			const { stdout } = await execFileAsync(
				path.join(destination, 'node_modules/.bin/vitest'),
				['run'],
				{
					cwd: destination,
					env: { ...environment, TEST_DATABASE_URL: url.href },
					maxBuffer: 8 * 1024 * 1024,
				},
			)
			expect(stdout).toContain('2 passed')
		} finally {
			try {
				await admin.query(`DROP DATABASE IF EXISTS "${database}"`)
			} finally {
				await admin.end()
			}
		}
	}, 120_000)

	it('runs its TypeScript sources with Node and refuses production', async () => {
		const fixture = await createPostgresWorkerFixture({ prefix: 'starter' })
		try {
			await writeFile(
				path.join(destination, '.env'),
				`DATABASE_URL=${fixture.connectionUri}\nPORT=0\n`,
				{ mode: 0o600 },
			)
			const run = (environment: string) =>
				new Promise<string>((resolve) => {
					const child = spawn(
						process.execPath,
						['--env-file=.env', 'src/main.ts'],
						{
							cwd: destination,
							env: { ...process.env, NODE_ENV: environment },
						},
					)
					let output = ''
					const onOutput = (chunk: Buffer): void => {
						output += chunk.toString('utf8')
						if (output.includes('Local API listening')) child.kill('SIGTERM')
					}
					child.stdout.on('data', onOutput)
					child.stderr.on('data', onOutput)
					child.once('exit', () => {
						resolve(output)
					})
				})
			const development = await run('development')
			expect(development).toContain("title: 'Ship the first feature'")
			expect(development).toContain(
				'allowWithoutRule.all opens every operation and request plugin command on schemas without a rule',
			)
			const production = await run('production')
			expect(production).toContain(
				"Access allowWithoutRule opens every operation and request plugin command with 'development', which production refuses (NODE_ENV is production).",
			)
		} finally {
			await fixture.dispose()
		}
	}, 60_000)
})
