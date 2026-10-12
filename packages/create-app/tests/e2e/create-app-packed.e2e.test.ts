import { execFile } from 'node:child_process'
import {
	mkdtemp,
	readFile,
	readdir,
	rm,
	symlink,
	writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const repositoryRoot = path.resolve(import.meta.dirname, '../../../..')
const packageRoot = path.join(repositoryRoot, 'packages/create-app')
const officialPluginIds = [
	'access-plugin',
	'acl-permissions-plugin',
	'auth-plugin',
	'graphql-explorer-plugin',
	'graphql-plugin',
	'graphql-yoga-plugin',
	'hooks-plugin',
	'http-plugin',
	'postgres-plugin',
	'rest-plugin',
	'roles-plugin',
	'hono-server-plugin',
	'soft-delete-plugin',
	'validation-plugin',
] as const

// apiServer() installs these HTTP plugins in generated sources (ADR-0325).
const apiServerPluginIds: ReadonlySet<string> = new Set([
	'graphql-explorer-plugin',
	'graphql-yoga-plugin',
	'hono-server-plugin',
	'http-plugin',
	'rest-plugin',
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

let temporaryRoot: string
let cliPath: string
let consumerRoot: string

/** Pack the built distribution, then invoke only the archive's public binary. */
beforeAll(async () => {
	temporaryRoot = await mkdtemp(path.join(tmpdir(), 'ultimabase-packed-cli-'))
	const { stdout } = await execFileAsync(
		'npm',
		[
			'pack',
			'--json',
			'--pack-destination',
			temporaryRoot,
			'--cache',
			path.join(temporaryRoot, 'npm-cache'),
		],
		{ cwd: packageRoot },
	)
	const packs: unknown = JSON.parse(stdout)
	const firstPack: unknown = Array.isArray(packs) ? packs[0] : undefined
	if (!isRecord(firstPack) || typeof firstPack.filename !== 'string')
		throw new TypeError('npm pack did not return an initializer archive')
	const archive = path.join(temporaryRoot, firstPack.filename)
	const extracted = path.join(temporaryRoot, 'extracted')
	await execFileAsync('mkdir', ['-p', extracted])
	await execFileAsync('tar', ['-xzf', archive, '-C', extracted])
	const published = path.join(extracted, 'package')
	// Built public packages remain available without pretending registry publication.
	await symlink(
		path.join(repositoryRoot, 'node_modules'),
		path.join(published, 'node_modules'),
	)
	cliPath = path.join(published, 'dist/cli.js')
	consumerRoot = path.join(temporaryRoot, 'consumer')
	await execFileAsync('mkdir', ['-p', consumerRoot])
}, 30_000)

afterAll(async () => {
	if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true })
})

const runCli = (
	args: readonly string[],
	manager: 'npm' | 'yarn' | 'pnpm',
): Promise<{ readonly stdout: string; readonly stderr: string }> =>
	execFileAsync(process.execPath, [cliPath, ...args], {
		cwd: consumerRoot,
		env: {
			...process.env,
			npm_config_user_agent: `${manager}/1.0.0 node/v24`,
		},
		maxBuffer: 1024 * 1024,
	})

describe('packed initializer outside the repository', () => {
	it('publishes the executable and public export without source imports', async () => {
		const manifest: unknown = JSON.parse(
			await readFile(
				path.join(temporaryRoot, 'extracted/package/package.json'),
				'utf8',
			),
		)
		expect(manifest).toMatchObject({
			name: '@ultimabase/create-app',
			bin: './dist/cli.js',
			exports: { '.': { import: './dist/index.js' } },
		})
		const { stdout } = await runCli(['--help'], 'npm')
		expect(stdout).toContain('Usage: create-app [options]')
		expect(stdout).toContain('--package-manager <npm|yarn|pnpm>')
	})

	it.each([
		['npm', 'ts', 'task', 'existing', ['--api', 'rest']],
		['yarn', 'ts', 'task', 'docker', ['--api', 'graphql']],
		['pnpm', 'js', 'empty', 'docker', []],
	] as const)(
		'keeps %s commands and %s files consistent with a packed invocation',
		async (manager, language, starter, database, extra) => {
			const name = `${manager}-project`
			const { stdout } = await runCli(
				[
					'--name',
					name,
					'--yes',
					'--no-install',
					'--language',
					language,
					'--starter',
					starter,
					'--database',
					database,
					...extra,
				],
				manager,
			)
			const destination = path.join(consumerRoot, name)
			const manifest: unknown = JSON.parse(
				await readFile(path.join(destination, 'package.json'), 'utf8'),
			)
			expect(stdout).toContain(`manager: ${manager}`)
			expect(stdout).toContain(`${manager} install`)
			expect(stdout).toContain(`${manager} start`)
			expect(await readdir(path.join(destination, 'src'))).toEqual(
				expect.arrayContaining([
					`schema.${language}`,
					`ultimabase.${language}`,
					`main.${language}`,
				]),
			)
			if (language === 'ts') {
				expect(stdout).toContain(
					manager === 'npm' ? 'npm run typecheck' : `${manager} typecheck`,
				)
				expect(stdout).toContain(
					manager === 'npm' ? 'npm run build' : `${manager} build`,
				)
				expect(manifest).toHaveProperty('dependencies.@ultimabase/typegen')
				expect(await readdir(destination)).toContain('tsconfig.json')
			} else {
				expect(manifest).not.toHaveProperty('devDependencies')
				expect(manifest).not.toHaveProperty('dependencies.@ultimabase/typegen')
				expect(await readdir(destination)).not.toContain('tsconfig.json')
			}
			if (database === 'docker') {
				expect(await readdir(destination)).toContain('compose.yaml')
				expect(await readdir(destination)).toContain('.env')
			}
		},
		30_000,
	)

	it('writes a valid graph for each official plugin selected alone', async () => {
		for (const id of officialPluginIds) {
			const name = `single-${id}`
			await runCli(
				[
					'--name',
					name,
					'--yes',
					'--no-install',
					'--language',
					'ts',
					'--plugin',
					`@ultimabase/${id}`,
				],
				'npm',
			)
			const destination = path.join(consumerRoot, name)
			const manifest = await readFile(
				path.join(destination, 'package.json'),
				'utf8',
			)
			const application = await readFile(
				path.join(destination, 'src/ultimabase.ts'),
				'utf8',
			)
			const schema = await readFile(
				path.join(destination, 'src/schema.ts'),
				'utf8',
			)
			const applicationGraphSource = application + schema
			expect(manifest).toContain(`"@ultimabase/${id}"`)
			expect(applicationGraphSource).toContain(
				apiServerPluginIds.has(id)
					? "'@ultimabase/api-server'"
					: `'@ultimabase/${id}'`,
			)
			expect(applicationGraphSource).not.toContain('/src/')
			await symlink(
				path.join(repositoryRoot, 'node_modules'),
				path.join(destination, 'node_modules'),
			)
			await writeFile(
				path.join(destination, '.env'),
				'DATABASE_URL=postgres://u:p@127.0.0.1:5432/disposable\nULTIMABASE_MASTER_KEY=local-test-key\n',
			)
			await execFileAsync('npm', ['run', 'build'], {
				cwd: destination,
				maxBuffer: 1024 * 1024,
			})
		}
	}, 120_000)

	// Regression: the packed CLI offered pg-vector although it cannot persist vectors.
	it('rejects a withheld official plugin before writing', async () => {
		await expect(
			runCli(
				[
					'--name',
					'withheld-vector',
					'--yes',
					'--no-install',
					'--plugin',
					'@ultimabase/pg-vector-plugin',
				],
				'npm',
			),
		).rejects.toThrow(
			'@ultimabase/pg-vector-plugin is not offered by create-app yet: it does not persist vector fields',
		)
		expect(await readdir(consumerRoot)).not.toContain('withheld-vector')
	})

	it('preserves occupied paths and rolls back failed installs', async () => {
		const occupied = path.join(consumerRoot, 'occupied')
		await writeFile(occupied, 'keep me')
		await expect(
			runCli(['--name', 'occupied', '--yes', '--no-install'], 'npm'),
		).rejects.toThrow()
		expect(await readFile(occupied, 'utf8')).toBe('keep me')
		const fakeBin = path.join(temporaryRoot, 'fake-bin')
		await execFileAsync('mkdir', ['-p', fakeBin])
		await writeFile(path.join(fakeBin, 'npm'), '#!/bin/sh\nexit 7\n', {
			mode: 0o755,
		})
		await expect(
			execFileAsync(
				process.execPath,
				[cliPath, '--name', 'failed-install', '--yes'],
				{
					cwd: consumerRoot,
					env: {
						...process.env,
						PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
						npm_config_user_agent: 'npm/1.0.0',
					},
				},
			),
		).rejects.toThrow()
		expect(await readdir(consumerRoot)).not.toContain('failed-install')
	})
})
