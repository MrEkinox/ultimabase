import {
	databaseAdapterCapability,
	databasePersistencePlanCapability,
	plugin,
	provideCapability,
	provideRuntimeBehavior,
	UltimaBase,
} from '@ultimabase/core'
import process from 'node:process'

const trace = []
const unsupported = () => {
	throw new TypeError('Mutation guard must reject before database preparation')
}

const behaviorPlugin = plugin({
	contributions: [
		provideRuntimeBehavior({
			contributionId: 'javascript-final-mutation-guard',
			create: () => ({
				value: {
					guardMutationInput: ({ operation, target }) => {
						trace.push(`guard:${operation.kind}:${String(target)}`)
						throw new TypeError('JavaScript mutation guard rejected input')
					},
				},
			}),
		}),
	],
	core: '^0.0.0',
	id: 'fixture.javascript-final-mutation-guard',
	permissions: {
		'runtime:intercept':
			'Exercises the public JavaScript mutation guard protocol.',
	},
	version: '1.0.0',
})

const databasePlugin = plugin({
	contributions: [
		provideCapability(databaseAdapterCapability, {
			contributionId: 'javascript-guard-database',
			create: () => ({
				value: {
					beginTransaction: async () => ({
						capabilities: {
							persistencePlans: databasePersistencePlanCapability,
						},
						commit: () => Promise.resolve(),
						execute: unsupported,
						kind: 'database-transaction-adapter',
						prepare: unsupported,
						rollback: () => {
							trace.push('rollback')
							return Promise.resolve()
						},
					}),
					capabilities: {
						persistencePlans: databasePersistencePlanCapability,
					},
					execute: unsupported,
					kind: 'database-adapter',
				},
			}),
		}),
	],
	core: '^0.0.0',
	id: 'fixture.javascript-guard-database',
	version: '1.0.0',
})

const Application = UltimaBase.use(behaviorPlugin, databasePlugin)
const Note = Application.Schema.define({
	className: 'JavaScriptRuntimeGuardNote',
	fields: (field) => ({ title: field.string({ required: true }) }),
})
const ultimabase = new Application({
	pluginPrivileges: { logger: false },
	schemas: [Note],
})

let message

try {
	await ultimabase.start()
	await Note.createOne({ data: { title: 'blocked' } })
	throw new Error('JavaScript mutation guard unexpectedly allowed persistence')
} catch (error) {
	message = error?.message
} finally {
	await ultimabase.dispose()
}

process.stdout.write(`${JSON.stringify({ message, trace })}\n`)
