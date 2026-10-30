// An identity: a request that sends an API key in `x-api-key` runs as the
// key's owner. The keys are a model of the plugin's own, read once and kept.
//#region types
import { createHash, randomBytes } from 'node:crypto'
import type { PluginContext, PluginOf, PluginTypes } from 'ultimabase'
import {
	defineFunction,
	defineModel,
	definePlugin,
	master,
	PublicError,
	Refused,
} from 'ultimabase'
import { z } from 'zod'
import type { Rpc } from './rpc.ts'
import { rpcPlugin } from './rpc.ts'

export interface ApiKeys extends PluginTypes {
	readonly name: 'apiKeys'
	/** `apiKeysPlugin({ header })`, `x-api-key` by default. */
	readonly appOptions: { readonly header?: string }
	/** Used when the application installs it. */
	readonly optional: Rpc
}

/** Only Master reads it: no transport lists it, and it has no rules. */
export const ApiKey = defineModel({
	name: 'ApiKey',
	fields: (f) => ({
		owner: f.string(),
		name: f.string(),
		// The key's SHA-256: the key itself is shown once, at creation.
		hash: f.string({ unique: true }),
	}),
})

const hashOf = (key: string) => createHash('sha256').update(key).digest('hex')
//#endregion

//#region function
/** Master only, as every function without an access rule. */
export const createApiKey = defineFunction({
	name: 'createApiKey',
	input: z.object({ owner: z.string(), name: z.string() }),
	output: z.object({ key: z.string() }),
	run: async ({ input }) => {
		const key = randomBytes(24).toString('base64url')
		const data = { ...input, hash: hashOf(key) }
		await ApiKey.create({ data }, { as: master })
		return { key }
	},
})
//#endregion

//#region cache
// Each running application's keys, by hash: the owner, or null for none.
const caches = new WeakMap<object, Map<string, string | null>>()
const cacheOf = (context: PluginContext<ApiKeys>) => {
	const cache = caches.get(context) ?? new Map<string, string | null>()
	caches.set(context, cache)
	return cache
}
//#endregion

//#region definition
const definition = definePlugin<ApiKeys>({
	name: 'apiKeys',
	manifest: {
		name: 'example-api-keys',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
	models: [ApiKey],
	functions: () => [createApiKey],
	optional: { rpc: rpcPlugin },
	start: ({ options, plugins, logger }) => {
		if (options.header === '') {
			throw new Refused('apiKeysPlugin({ header }) names a header.')
		}
		// `undefined` when the application does not install rpc.
		if (plugins.rpc === undefined) return
		if (process.env['NODE_ENV'] === 'production') return
		const url = plugins.rpc.url('apiKeys.createApiKey')
		logger.info(`Create an API key: POST ${url} with the master key.`)
	},
	//#endregion
	//#region identify
	identify: async (request, context) => {
		const key = request.headers.get(context.options.header ?? 'x-api-key')
		if (key === null) return undefined
		const hash = hashOf(key)
		const cache = cacheOf(context)
		let owner = cache.get(hash)
		if (owner === undefined) {
			const found = await ApiKey.findUnique({ where: { hash } }, { as: master })
			owner = found?.owner ?? null
			cache.set(hash, owner)
		}
		if (owner === null) {
			throw new PublicError('UNAUTHENTICATED', 'This API key is unknown.')
		}
		return { kind: 'user', user: { id: owner } }
	},
	//#endregion
	//#region changed
	// A key created or deleted, on this server or another: read them again.
	changed: (changes, context) => {
		if (changes.some((change) => change.model === 'ApiKey')) {
			cacheOf(context).clear()
		}
	},
	// Changes may have been lost: what the cache holds is unknown.
	missed: (context) => {
		cacheOf(context).clear()
	},
	stop: (context) => {
		caches.delete(context)
	},
	//#endregion
})

export const apiKeysPlugin: PluginOf<ApiKeys> = definition.plugin
