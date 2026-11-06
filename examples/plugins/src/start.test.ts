// What the plugins do at start: use an optional plugin, refuse to run, or
// write the file they generate.
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { httpPlugin } from '@ultimabase/http'
import {
	defineApp,
	defineFunction,
	defineModel,
	master,
	memory,
} from 'ultimabase'
import { afterEach, expect, it, vi } from 'vitest'
import { apiKeysPlugin } from './plugins/api-keys.ts'
import { rpc, rpcPlugin } from './plugins/rpc.ts'

const Note = defineModel({
	name: 'Note',
	fields: (f) => ({ text: f.string() }),
})

afterEach(() => {
	vi.unstubAllEnvs()
})

it('writes the functions it serves in development', async () => {
	const folder = await mkdtemp(join(tmpdir(), 'rpc-'))
	const generated = join(folder, 'rpc.json')
	vi.stubEnv('NODE_ENV', 'development')
	//#region generated
	const ping = defineFunction({ name: 'ping', use: [rpc()], run: () => {} })
	const app = defineApp({
		database: memory(),
		plugins: [httpPlugin({ port: 0 }), rpcPlugin({ generated })],
		models: [],
		functions: [ping],
	})
	await app.start()
	expect(JSON.parse(await readFile(generated, 'utf8'))).toEqual(['ping'])
	//#endregion
	await app.stop()
})

it('refuses a function the transport cannot serve', async () => {
	//#region model-output
	const latest = defineFunction({
		name: 'latest',
		use: [rpc()],
		output: Note,
		run: () => Note.create({ data: { text: 'Hello' } }, { as: master }),
	})
	//#endregion
	const app = defineApp({
		database: memory(),
		plugins: [httpPlugin({ port: 0 }), rpcPlugin()],
		models: [Note],
		functions: [latest],
	})
	//#region model-refused
	await expect(app.start()).rejects.toThrow(
		'rpc answers JSON, and latest returns a model: give it a schema output, or .with({ rpc: false }).',
	)
	//#endregion
	//#region opted-out
	// Kept out of the transport, it runs from server code only.
	const served = defineApp({
		database: memory(),
		plugins: [httpPlugin({ port: 0 }), rpcPlugin()],
		models: [Note],
		functions: [latest.with({ rpc: false })],
	})
	await served.start()
	await served.stop()
	//#endregion
})

it('refuses an empty header name', async () => {
	//#region header
	const app = defineApp({
		database: memory(),
		plugins: [apiKeysPlugin({ header: '' })],
		models: [],
	})
	await expect(app.start()).rejects.toThrow(
		'apiKeysPlugin({ header }) names a header.',
	)
	//#endregion
})

it('uses an optional plugin when the application installs it', async () => {
	const logged: unknown[] = []
	const log = (message: unknown) => {
		logged.push(message)
	}
	const logger = { info: log, warn: log, error: log, child: () => logger }
	const app = defineApp({
		database: memory(),
		logger,
		plugins: [httpPlugin({ port: 0 }), rpcPlugin(), apiKeysPlugin()],
		models: [],
	})
	await app.start()
	//#region optional
	expect(logged).toContainEqual(
		expect.stringMatching(
			/^Create an API key: POST http:\/\/localhost:\d+\/rpc\/apiKeys\.createApiKey with the master key\.$/,
		),
	)
	//#endregion
	await app.stop()
})
