// What the plugins do at start: use an optional plugin, or refuse to run.
import { httpPlugin } from '@ultimabase/http'
import {
	defineApp,
	defineFunction,
	defineModel,
	master,
	memory,
} from 'ultimabase'
import { expect, it } from 'vitest'
import { apiKeysPlugin } from './plugins/api-keys.ts'
import { rpc, rpcPlugin } from './plugins/rpc.ts'

const Note = defineModel({
	name: 'Note',
	fields: (f) => ({ text: f.string() }),
})

it('refuses a function the transport cannot serve', async () => {
	//#region model-output
	const latest = defineFunction({
		name: 'latest',
		use: [rpc()],
		output: Note,
		run: () => Note.create({ data: { text: 'Hello' } }, { as: master }),
	})
	const app = defineApp({
		database: memory(),
		plugins: [httpPlugin({ port: 0 }), rpcPlugin()],
		models: [Note],
		functions: [latest],
	})
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
	//#region optional
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
	expect(logged).toContainEqual(
		expect.stringMatching(
			/^Create an API key: POST http:\/\/localhost:\d+\/rpc\/apiKeys\.createApiKey with the master key\.$/,
		),
	)
	await app.stop()
	//#endregion
})
