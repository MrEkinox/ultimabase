// The `ultimabase` command (D-105): `dev`, `start`, `sync` and `migrate`.
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { configPath, load } from './cli-config.ts'
import { migrateCreate, migrateDeploy, sync } from './cli-migrate.ts'

const usage = `Usage: ultimabase <command> [--config <path>]

  dev                    Start the application, sync its development
                         database, and restart it when a file changes.
  start                  Start the application in production.
  sync [--force]         Sync the development database to the models.
  migrate create <name>  Write the models' changes as a migration.
  migrate deploy         Apply the pending migrations.`

export type Io = {
	readonly cwd: string
	readonly out: (text: string) => void
	readonly err: (text: string) => void
	readonly now: () => Date
	/** Runs Node with `args` until it exits, and returns its exit code. */
	readonly node: (args: readonly string[]) => Promise<number>
}

/** The file `dev` runs under `node --watch`. */
export const serveFile: string = join(
	dirname(fileURLToPath(import.meta.url)),
	'serve.ts',
)

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

/** A refusal prints its message, any other error its stack. */
function report(error: unknown, io: Io): number {
	if (error instanceof Error && error.name === 'Refused') io.err(error.message)
	else
		io.err(
			error instanceof Error ? (error.stack ?? error.message) : String(error),
		)
	return 1
}

async function run(args: readonly string[], io: Io): Promise<number> {
	const { values, positionals } = parseArgs({
		args: [...args],
		allowPositionals: true,
		options: {
			config: { type: 'string' },
			force: { type: 'boolean', default: false },
			help: { type: 'boolean', default: false },
		},
	})
	const [command, sub, name, ...rest] = positionals
	const known =
		rest.length === 0 &&
		(command === 'migrate'
			? (sub === 'create' && name !== undefined) ||
				(sub === 'deploy' && name === undefined)
			: ['dev', 'start', 'sync'].includes(command ?? '') && sub === undefined)
	if (values.help || !known) {
		;(values.help ? io.out : io.err)(usage)
		return values.help ? 0 : 1
	}
	const path = configPath(io.cwd, values.config)
	if (command === 'dev') {
		process.env['NODE_ENV'] ??= 'development'
		return io.node(['--watch', serveFile, path])
	}
	if (command === 'start') process.env['NODE_ENV'] ??= 'production'
	const app = await load(path)
	const dir = join(dirname(path), 'migrations')
	if (command === 'start') await app.app.start()
	else if (command === 'sync') {
		const said = await sync(app, values.force)
		if (said !== undefined) io.out(said)
	} else if (sub === 'deploy') {
		for (const line of await migrateDeploy(app, dir)) io.out(line)
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
