// The starter as `npm create ultimabase` writes it (D-130): the bin writes it,
// and it starts and answers GraphQL; it runs the versions the repository tests.
import { execFile, spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, expect, it } from 'vitest'
import { others, ownVersion } from './starter.ts'

const root = resolve(import.meta.dirname, '../../..')
const cli = resolve(import.meta.dirname, 'cli.ts')
let work: string | undefined
afterEach(() => {
	if (work !== undefined) rmSync(work, { recursive: true, force: true })
	work = undefined
})

const field = (path: string, ...keys: string[]): unknown => {
	let value: unknown = JSON.parse(readFileSync(path, 'utf8'))
	for (const key of keys) {
		value =
			typeof value === 'object' && value !== null
				? Reflect.get(value, key)
				: undefined
	}
	return value
}

/** Starts `node src/server.ts` in `directory`; its address and its stop. */
async function served(directory: string) {
	const server = spawn(process.execPath, ['src/server.ts'], {
		cwd: directory,
		env: { ...process.env, PORT: '0' },
		stdio: ['ignore', 'pipe', 'pipe'],
	})
	let output = ''
	server.stderr.on('data', (chunk) => {
		output += String(chunk)
	})
	const url = await new Promise<string>((done, fail) => {
		server.stdout.on('data', (chunk) => {
			output += String(chunk)
			const found = /Listening on (\S+)\./u.exec(output)?.[1]
			if (found !== undefined) done(found)
		})
		server.once('exit', (code) => {
			fail(new Error(`The starter exited with ${code}:\n${output}`))
		})
	})
	const stop = async () => {
		const exited = once(server, 'exit')
		server.kill('SIGTERM')
		await exited
	}
	return { url, stop }
}

it('is written by the bin, starts and answers GraphQL', async () => {
	work = mkdtempSync(join(tmpdir(), 'create-ultimabase-'))
	const { stdout } = await promisify(execFile)(
		process.execPath,
		[cli, 'blog'],
		{ cwd: work, env: { ...process.env, npm_config_user_agent: 'pnpm/10' } },
	)
	expect(stdout).toContain('Created blog. Next:\n\n  cd blog\n  pnpm install')
	const blog = join(work, 'blog')
	// The repository's packages stand for the installed ones.
	symlinkSync(join(root, 'node_modules'), join(blog, 'node_modules'))
	const { url, stop } = await served(blog)
	try {
		const response = await fetch(`${url}/graphql`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ query: '{ posts { edges { node { title } } } }' }),
		})
		expect(await response.json()).toEqual({ data: { posts: { edges: [] } } })
	} finally {
		await stop()
	}
}, 20_000)

it('runs the versions the repository tests, and its own', () => {
	const own = join(root, 'packages/create-ultimabase/package.json')
	for (const [name, range] of Object.entries(others)) {
		expect(range).toBe(`^${String(field(own, 'devDependencies', name))}`)
	}
	expect(ownVersion()).toBe(field(own, 'version'))
})
