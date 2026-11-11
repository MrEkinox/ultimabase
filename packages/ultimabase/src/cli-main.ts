// The `ultimabase` command (D-105): `dev`, `start`, `sync`, `reset`,
// `migrate` and `generate` (D-201).
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import type { Internals } from './app-internals.ts'
import { configPath, load } from './cli-config.ts'
import { unattended } from './cli-dev.ts'
import { migrateDeploy, migrateStatus, reset } from './cli-deploy.ts'
import { migrateCreate, sync } from './cli-migrate.ts'
import { Refused } from './errors.ts'
import { staleOf, written } from './generate.ts'
import { generatedFiles } from './lifecycle.ts'

const usage = `Usage: ultimabase <command> [--config <path>]

  dev                    Start the application, sync its development
                         database, and restart it when a file changes.
  start                  Start the application in production.
  sync [--force]         Sync the development database to the models.
  reset [--force]        Rebuild the development database from the
                         migrations: every table is dropped. --force
                         allows a database on another machine.
  migrate create <name>  Write the models' changes as a migration, or an
                         empty one for your SQL.
  migrate deploy         Apply the pending migrations.
  migrate status         Say what a deploy would do; exit 1 if anything.
  generate [--check]     Write the files the plugins generate, without
                         starting the application. --check writes
                         nothing, and exits 1 if a file is out of date.

dev, sync, reset, migrate create and generate load the .env and the
.env.local beside the config; .env.local wins.`

export type Io = {
	readonly cwd: string
	readonly out: (text: string) => void
	readonly err: (text: string) => void
	readonly now: () => Date
	/** Whether a person watches: the output is a terminal, and `CI` unset. */
	readonly interactive: boolean
	/**
	 * Runs Node with `args`, and `env` added to the environment, until it
	 * exits or `signal` stops it, and returns its exit code.
	 */
	readonly node: (
		args: readonly string[],
		options?: NodeOptions,
	) => Promise<number>
}

export type NodeOptions = {
	readonly env: Readonly<Record<string, string>>
	readonly signal: AbortSignal
}

/**
 * The file `dev` runs under `node --watch`: `serve.ts` beside the sources,
 * `serve.js` in the published `dist`.
 */
const here = fileURLToPath(import.meta.url)
export const serveFile: string = join(dirname(here), `serve${extname(here)}`)

function runNode(
	args: readonly string[],
	options?: NodeOptions,
): Promise<number> {
	return new Promise((done, fail) => {
		const child = spawn(process.execPath, args, {
			stdio: 'inherit',
			env: { ...process.env, ...options?.env },
			signal: options?.signal,
		})
		const forward = () => child.kill('SIGTERM')
		process.on('SIGTERM', forward)
		// Stopped by `signal`, the child still exits with a code.
		child.on('error', (error) => {
			if (options?.signal.aborted !== true) fail(error)
		})
		child.on('exit', (code) => {
			process.off('SIGTERM', forward)
			done(code ?? 1)
		})
	})
}

export const processIo: Io = {
	cwd: process.cwd(),
	out: (text) => process.stdout.write(`${text}\n`),
	err: (text) => process.stderr.write(`${text}\n`),
	now: () => new Date(),
	interactive: process.stdout.isTTY && process.env['CI'] === undefined,
	node: runNode,
}

/**
 * An expected failure, a refusal or an error with a `code` (from Node,
 * PostgreSQL or the kernel), prints its message; any other, a bug, its
 * stack (D-105).
 */
function report(error: unknown, io: Io): number {
	if (!(error instanceof Error)) io.err(String(error))
	else if (
		error.name === 'Refused' ||
		typeof Reflect.get(error, 'code') === 'string'
	)
		io.err(error.message)
	else io.err(error.stack ?? error.message)
	return 1
}

/** Reads `args`, refusing an option it does not know with its first sentence. */
function read(args: readonly string[]) {
	try {
		return parseArgs({
			args: [...args],
			allowPositionals: true,
			options: {
				config: { type: 'string' },
				force: { type: 'boolean', default: false },
				check: { type: 'boolean', default: false },
				help: { type: 'boolean', default: false },
			},
		})
	} catch (error) {
		const message: unknown = Reflect.get(Object(error), 'message')
		const first = String(message).replace(/\.( .*)?$/s, '')
		throw new Refused(`${first}. Run \`npx ultimabase --help\`.`)
	}
}

async function run(args: readonly string[], io: Io): Promise<number> {
	const { values, positionals } = read(args)
	const [command, sub, name, ...rest] = positionals
	const known =
		rest.length === 0 &&
		(command === 'migrate'
			? (sub === 'create' && name !== undefined) ||
				(['deploy', 'status'].includes(sub ?? '') && name === undefined)
			: ['dev', 'start', 'sync', 'reset', 'generate'].includes(command ?? '') &&
				sub === undefined)
	if (values.help) {
		io.out(usage)
		return 0
	}
	if (!known) {
		if (command !== undefined)
			io.err(`Unknown command '${positionals.join(' ')}'.`)
		io.err(usage)
		return 1
	}
	const path = configPath(io.cwd, values.config)
	// The `.env` and `.env.local` beside the config, for the development
	// commands (D-171, D-363).
	const production = command === 'start' || sub === 'deploy' || sub === 'status'
	const files = (production ? [] : ['.env', '.env.local'])
		.map((env) => join(dirname(path), env))
		.filter((file) => existsSync(file))
	if (command === 'dev') {
		process.env['NODE_ENV'] ??= 'development'
		// The last --env-file wins; a change to either file restarts.
		const env = files.map((file) => `--env-file=${file}`)
		const watch = ['--watch', ...env, serveFile, path]
		return io.interactive ? io.node(watch) : unattended(watch, io.node)
	}
	// loadEnvFile keeps a variable already set: the first file wins.
	for (const file of files.toReversed()) process.loadEnvFile(file)
	if (command === 'start') process.env['NODE_ENV'] ??= 'production'
	if (command === 'generate') process.env['NODE_ENV'] ??= 'development'
	const app = await load(path)
	if (command === 'generate') return generate(app, values.check, io)
	const dir = join(dirname(path), 'migrations')
	if (command === 'start') await app.app.start()
	else if (command === 'sync') {
		const said = await sync(app, values.force)
		if (said !== undefined) io.out(said)
	} else if (command === 'reset') {
		for (const line of await reset(app, dir, values.force)) io.out(line)
	} else if (sub === 'deploy') {
		for (const line of await migrateDeploy(app, dir)) io.out(line)
	} else if (sub === 'status') {
		const { lines, ok } = await migrateStatus(app, dir)
		for (const line of lines) io.out(line)
		return ok ? 0 : 1
	} else io.out(await migrateCreate(app, dir, name ?? '', io.now()))
	return 0
}

/** Writes the plugins' files, or with `check` names the stale ones (D-201). */
async function generate(app: Internals, check: boolean, io: Io) {
	const files = generatedFiles(app.options)
	if (!check) {
		for (const path of await written(files)) io.out(`Wrote ${path}.`)
		return 0
	}
	const stale = await staleOf(files)
	for (const { path } of stale) io.out(`${path} is out of date.`)
	return stale.length === 0 ? 0 : 1
}

/** Runs the command `args` name, and returns its exit code. */
export async function main(
	args: readonly string[],
	io: Io = processIo,
): Promise<number> {
	try {
		return await run(args, io)
	} catch (error) {
		return report(error, io)
	}
}

/** Starts the application of `path`, for `dev` (D-105). */
export async function serve(
	path: string | undefined,
	io: Io = processIo,
): Promise<number> {
	try {
		const { app } = await load(configPath(io.cwd, path))
		await app.start()
		return 0
	} catch (error) {
		return report(error, io)
	}
}
