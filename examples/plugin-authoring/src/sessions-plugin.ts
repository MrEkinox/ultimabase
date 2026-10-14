//#region private-sessions
import {
	definePrivateCollection,
	privateStore,
	stringField,
} from '@ultimabase/core'
import {
	contributeDeclarations,
	contributeOperation,
	defineOperation,
	defineOperationValue,
	plugin,
} from '@ultimabase/core/plugin'

const sessions = definePrivateCollection({
	contributionId: 'sessions',
	fields: {
		secret: stringField({ immutable: true, required: true }),
		version: stringField({ required: true }),
	},
	indexes: [{ fields: ['secret'] }] as const,
})

const text = defineOperationValue((value, path): string => {
	if (typeof value !== 'string') throw new TypeError(`${path} must be text`)
	return value
})

/** Reports the stored verifier's version, or `none`. */
export const sessionVersion = defineOperation({
	input: text,
	name: 'community.sessions.version',
	result: text,
	target: 'application',
	transaction: 'required',
	version: '1.0.0',
})

export const sessionPlugin = plugin({
	contributions: [
		contributeDeclarations({
			privateStorage: ({ privateStorage }) => {
				privateStorage.register(sessions)
			},
		}),
		contributeOperation({
			operation: sessionVersion,
			// Only this plugin's own callbacks may open its private store.
			execute: async ({ input }) => {
				const store = privateStore(sessions)
				const found = await store.findUnique({ where: { secret: input } })
				if (found !== null) return found.version
				await store.insert({ data: { secret: input, version: '1' } })
				return 'none'
			},
		}),
	],
	core: '^0.0.0',
	id: 'community.sessions',
	// Critical privileges are the only ones that need an explicit reason.
	permissions: { 'storage:private': 'Stores revocable session verifiers.' },
	version: '1.0.0',
})
//#endregion private-sessions
