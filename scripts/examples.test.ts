// Every example is a complete application (D-131): it says what it shows,
// has a test and is typechecked, and it starts as `yarn start` does.
import { spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const examples = readdirSync('examples', { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.map(({ name }) => name)

const manifest = (example: string): unknown =>
	JSON.parse(readFileSync(join('examples', example, 'package.json'), 'utf8'))
const field = (value: unknown, ...path: string[]): unknown =>
	path.reduce<unknown>((inner, key) => Reflect.get(Object(inner), key), value)

/** An example on PostgreSQL starts in its own `*.postgres.test.ts`. */
const onPostgres = (example: string) =>
	field(manifest(example), 'dependencies', '@ultimabase/postgres') !== undefined

const typecheck = String(
	field(
		JSON.parse(readFileSync('package.json', 'utf8')),
		'scripts',
		'typecheck',
	),
)
	.split('&&')
	.map((command) => command.trim())

it.each(examples)('%s is a complete application', (example) => {
	const has = (file: string) => existsSync(join('examples', example, file))
	expect({
		start: field(manifest(example), 'scripts', 'start'),
		readme: has('README.md'),
		test: has('src/app.test.ts') || has('src/app.postgres.test.ts'),
		typechecked: typecheck.includes(`tsc --project examples/${example}`),
	}).toEqual({
		start: 'node src/server.ts',
		readme: true,
		test: true,
		typechecked: true,
	})
})

/** The output of `node src/server.ts`, started then stopped as a host does. */
async function started(example: string): Promise<string> {
	const server = spawn(process.execPath, ['src/server.ts'], {
		cwd: join('examples', example),
		env: { ...process.env, PORT: '0' },
		stdio: ['ignore', 'pipe', 'pipe'],
	})
	let output = ''
	const exited = new Promise<void>((resolve) => {
		// After the output is read to its end.
		server.once('close', () => {
			resolve()
		})
	})
	const listening = new Promise<void>((resolve) => {
		const heard = (chunk: unknown) => {
			output += String(chunk)
			if (output.includes('Application started.')) resolve()
		}
		server.stdout.on('data', heard)
		server.stderr.on('data', heard)
	})
	await Promise.race([listening, exited])
	server.kill('SIGTERM')
	await exited
	return output
}

describe.concurrent('starting', () => {
	it.each(examples.filter((example) => !onPostgres(example)))(
		'%s starts, then stops on SIGTERM',
		async (example) => {
			const output = await started(example)
			expect(output).toContain('Listening on')
			expect(output).toContain('Application stopped.')
		},
	)
})
