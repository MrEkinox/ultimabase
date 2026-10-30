// Packs every package as it is published, installs the packs with npm in an
// empty directory and runs the example there (D-118). Node strips no types
// under node_modules, which the workspace's links never show.
import { execFile, spawn } from 'node:child_process'
import { once } from 'node:events'
import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const example = join(root, 'examples/password-sign-in')
const work = mkdtempSync(join(tmpdir(), 'ultimabase-packed-'))
const app = join(work, 'app')

const manifest = (directory: string): Record<string, unknown> => {
	const parsed: unknown = JSON.parse(
		readFileSync(join(directory, 'package.json'), 'utf8'),
	)
	if (typeof parsed !== 'object' || parsed === null) {
		throw new TypeError(`${directory}/package.json is not an object`)
	}
	return Object.fromEntries(Object.entries(parsed))
}
const dependency = (directory: string, field: string, name: string): string => {
	const value: unknown = Reflect.get(Object(manifest(directory)[field]), name)
	if (typeof value !== 'string') {
		throw new TypeError(`${directory}: no ${field} on ${name}`)
	}
	return value
}

/** Runs a command to its end; its output is shown only when it fails. */
const run = (command: string, args: string[], cwd: string): Promise<string> =>
	new Promise((done, fail) => {
		execFile(command, args, { cwd }, (error, stdout, stderr) => {
			if (error === null) done(stdout)
			else fail(new Error(`${command} ${args.join(' ')}\n${stdout}${stderr}`))
		})
	})

const packages = readdirSync(join(root, 'packages'), { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.map((entry) => {
		const own = manifest(join(root, 'packages', entry.name))
		return {
			directory: entry.name,
			name: String(own['name']),
			// create-ultimabase is a bin only.
			imported: 'exports' in own,
		}
	})

console.log(`Packing ${packages.length} packages in ${work}`)
mkdirSync(join(work, 'packs'))
await Promise.all(
	packages.map(({ directory }) =>
		run(
			'yarn',
			['pack', '--out', join(work, 'packs', `${directory}.tgz`)],
			join(root, 'packages', directory),
		),
	),
)

// The example as an application outside the repository writes it, without
// its tests: each package from its pack, the rest from the registry.
cpSync(join(example, 'src'), join(app, 'src'), {
	recursive: true,
	filter: (path) => !path.endsWith('.test.ts'),
})
writeFileSync(
	join(app, 'package.json'),
	JSON.stringify({
		name: 'packed-app',
		private: true,
		type: 'module',
		dependencies: {
			...Object.fromEntries(
				packages.map(({ directory, name }) => [
					name,
					`file:../packs/${directory}.tgz`,
				]),
			),
			graphql: dependency(example, 'dependencies', 'graphql'),
		},
		devDependencies: {
			'@types/node': dependency(root, 'devDependencies', '@types/node'),
		},
	}),
)
// Checks the shipped declarations too: `lib` names the DOM types Hono's
// WebSocket types use, which Node lacks.
writeFileSync(
	join(app, 'tsconfig.json'),
	JSON.stringify({
		compilerOptions: {
			allowImportingTsExtensions: true,
			lib: ['ES2024', 'DOM'],
			module: 'NodeNext',
			noEmit: true,
			strict: true,
			target: 'ES2024',
			types: ['node'],
		},
		include: ['src'],
	}),
)
console.log('Installing them with npm')
await run('npm', ['install', '--no-audit', '--no-fund'], app)

console.log('Importing each package')
await run(
	process.execPath,
	[
		'--input-type=module',
		'--eval',
		packages
			.filter(({ imported }) => imported)
			.map(({ name }) => `await import('${name}')`)
			.join('\n'),
	],
	app,
)
console.log('Typechecking the example against the declarations')
await run(
	process.execPath,
	[join(root, 'node_modules/typescript/bin/tsc'), '--project', app],
	app,
)
console.log('Running the installed CLI')
const usage = await run(
	join(app, 'node_modules/.bin/ultimabase'),
	['--help'],
	app,
)
if (!usage.startsWith('Usage: ultimabase')) {
	throw new Error(`The CLI printed:\n${usage}`)
}

console.log('Writing a starter with the installed create-ultimabase')
const created = await run(
	join(app, 'node_modules/.bin/create-ultimabase'),
	['starter'],
	work,
)
if (!created.includes('Created starter.')) {
	throw new Error(`create-ultimabase printed:\n${created}`)
}
if (!readdirSync(join(work, 'starter/src')).includes('app.test.ts')) {
	throw new Error('The starter has no src/app.test.ts.')
}

/**
 * Runs a server until `use` is done with the URL it prints it listens on;
 * its output is shown only when it fails.
 */
const serving = async (
	command: string,
	args: string[],
	cwd: string,
	use: (url: string) => Promise<void>,
): Promise<void> => {
	const server = spawn(command, args, {
		cwd,
		env: { ...process.env, PORT: '0' },
		stdio: ['ignore', 'pipe', 'pipe'],
	})
	let output = ''
	server.stderr.on('data', (chunk) => {
		output += String(chunk)
	})
	try {
		const url = await new Promise<string>((done, fail) => {
			server.stdout.on('data', (chunk) => {
				output += String(chunk)
				const found = /Listening on (\S+)\./.exec(output)?.[1]
				if (found !== undefined) done(found)
			})
			server.once('exit', (code) => {
				fail(new Error(`${command} exited with ${code}:\n${output}`))
			})
			// `node --watch` waits for a change when its file fails.
			setTimeout(() => {
				fail(new Error(`${command} did not listen in 30 s:\n${output}`))
			}, 30_000).unref()
		})
		await use(url)
	} finally {
		if (server.exitCode === null && server.signalCode === null) {
			const exited = once(server, 'exit')
			server.kill('SIGTERM')
			await exited
		}
	}
}

/** The `data` of a GraphQL answer, or a throw that shows the answer. */
const graphql = async (
	url: string,
	query: string,
	variables: object = {},
): Promise<unknown> => {
	const response = await fetch(`${url}/graphql`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ query, variables }),
	})
	const body: unknown = await response.json()
	const data: unknown = Reflect.get(Object(body), 'data')
	if (data === undefined || data === null || 'errors' in Object(body)) {
		throw new Error(`${query} answered ${JSON.stringify(body)}`)
	}
	return data
}

console.log('Starting the example and signing up')
await serving(process.execPath, ['src/server.ts'], app, async (url) => {
	const data = await graphql(
		url,
		`
			mutation ($input: SignUpInput!) {
				signUp(input: $input) {
					token
				}
			}
		`,
		{
			input: {
				email: 'ada@example.com',
				password: 'correct horse',
				name: 'ada',
			},
		},
	)
	const token: unknown = Reflect.get(
		Object(Reflect.get(Object(data), 'signUp')),
		'token',
	)
	if (typeof token !== 'string') {
		throw new Error(`The sign-up answered ${JSON.stringify(data)}`)
	}
})

// The starter as its user installs it, with its own dependencies only: each
// of ours from its pack, through `overrides` when another package needs it.
const starter = join(work, 'starter')
const packs = Object.fromEntries(
	packages.map(({ directory, name }) => [
		name,
		`file:../packs/${directory}.tgz`,
	]),
)
const written = manifest(starter)
const ours = (field: string) => {
	const ranges = written[field]
	return Object.fromEntries(
		Object.entries(
			typeof ranges === 'object' && ranges !== null ? ranges : {},
		).map(([name, range]) => [name, packs[name] ?? range]),
	)
}
writeFileSync(
	join(starter, 'package.json'),
	JSON.stringify({
		...written,
		dependencies: ours('dependencies'),
		devDependencies: ours('devDependencies'),
		overrides: packs,
	}),
)
console.log('Installing the starter with npm')
await run('npm', ['install', '--no-audit', '--no-fund'], starter)
console.log("Running the starter's tests")
await run('npm', ['test'], starter)
console.log('Starting the starter with its dev script and creating a post')
await serving(
	join(starter, 'node_modules/.bin/ultimabase'),
	['dev'],
	starter,
	async (url) => {
		await graphql(
			url,
			'mutation { createPost(data: { title: "Hello" }) { id } }',
		)
		const data = await graphql(url, '{ posts { edges { node { title } } } }')
		const expected = { posts: { edges: [{ node: { title: 'Hello' } }] } }
		if (JSON.stringify(data) !== JSON.stringify(expected)) {
			throw new Error(`The posts are ${JSON.stringify(data)}`)
		}
	},
)

rmSync(work, { recursive: true })
console.log('The packed packages install and run.')
