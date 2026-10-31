// The `ultimabase` command (D-105): `dev`, `start`, `sync`, `reset` and
// `migrate`.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { configPath, load } from './cli-config.ts'
import { migrateDeploy, migrateStatus, reset } from './cli-deploy.ts'
import { migrateCreate, sync } from './cli-migrate.ts'
import { Refused } from './errors.ts'

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

dev, sync, reset and migrate create load the .env beside the config.`

export type Io = {
	readonly cwd: string
	readonly out: (text: string) => void
	readonly err: (text: string) => void
	readonly now: () => Date
	/** Runs Node with `args` until it exits, and returns its exit code. */
	readonly node: (args: readonly string[]) => Promise<number>
}

/**
 * The file `dev` runs under `node --watch`: `serve.ts` beside the sources,
 * `serve.js` in the published `dist`.
 */
const here = fileURLToPath(import.meta.url)
export const serveFile: string = join(dirname(here), `serve${extname(here)}`)

function runNode(args: readonly string[]): Promise<number> {
	return new Promise((done, fail) => {
		const child = spawn(process.execPath, args, { stdio: 'inherit' })
		const forward = () => child.kill('SIGTERM')
		process.on('SIGTERM', forward)
		child.on('error', fail)
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
			: ['dev', 'start', 'sync', 'reset'].includes(command ?? '') &&
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
	// The `.env` beside the config, for the development commands (D-171).
	const env = join(dirname(path), '.env')
	const local =
		existsSync(env) &&
		command !== 'start' &&
		sub !== 'deploy' &&
		sub !== 'status'
	if (command === 'dev') {
		process.env['NODE_ENV'] ??= 'development'
		const file = local ? [`--env-file=${env}`] : []
		return io.node(['--watch', ...file, serveFile, path])
	}
	if (local) process.loadEnvFile(env)
	if (command === 'start') process.env['NODE_ENV'] ??= 'production'
	const app = await load(path)
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
