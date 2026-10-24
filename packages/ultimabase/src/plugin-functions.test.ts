// A plugin's functions and a function's client (D-113): built at `start`
// from the plugin's context, exposed after the application's, each name
// taken once, and `client` given by a transport only.
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { Client, ExposedFunction, Logger, PluginTypes } from './index.ts'
import {
	allow,
	defineApp,
	defineFunction,
	defineModel,
	definePlugin,
	master,
	memory,
	PublicError,
} from './index.ts'

const manifest = {
	name: 'test-plugin',
	version: '1.0.0',
	peerDependencies: { ultimabase: '*' },
}
const silent: Logger = {
	info: () => undefined,
	warn: () => undefined,
	error: () => undefined,
	child: () => silent,
}

const Post = defineModel({
	name: 'Post',
	fields: (f) => ({ title: f.string() }),
}).with({ access: allow.public })

interface Greeter extends PluginTypes {
	readonly name: 'greeter'
	readonly appOptions: { readonly greeting: string }
}
const seen: unknown[] = []
const built: { options: unknown; models: readonly unknown[] }[] = []
let exposed: readonly ExposedFunction[] = []
const greeter = definePlugin<Greeter>({
	name: 'greeter',
	manifest,
	functions: ({ options, models }) => {
		built.push({ options, models: models.map(({ model }) => model) })
		const [first] = models
		if (first === undefined) throw new Error('No model.')
		return [
			defineFunction({
				name: 'greet',
				input: z.object({ name: z.string() }),
				output: z.string(),
				run: (facts) => {
					seen.push(facts.client)
					return `${options.greeting} ${facts.input.name}`
				},
			}).with({ access: allow.public }),
			defineFunction({
				name: 'firstModel',
				query: true,
				output: first.model,
				run: () => {
					throw new Error('Not called.')
				},
			}),
		]
	},
	start: ({ functions }) => {
		exposed = functions
	},
})

const own = defineFunction({ name: 'own', run: () => undefined })

const started = async (
	plugins: readonly unknown[],
	functions: readonly unknown[] = [own],
) => {
	const app = defineApp({
		database: memory(),
		logger: silent,
		// @ts-expect-error: the test passes what the types refuse.
		plugins,
		models: [Post],
		// @ts-expect-error: the test passes what the types refuse.
		functions,
	})
	await app.start()
	return app
}

const client = (): Client & { readonly sent: unknown[] } => {
	const sent: unknown[] = []
	return {
		address: '203.0.113.7',
		cookies: {
			set: (...args) => sent.push(['set', ...args]),
			clear: (...args) => sent.push(['clear', ...args]),
		},
		sent,
	}
}

describe('a plugin’s functions', () => {
	it('are built from its context, after the application’s', async () => {
		built.length = 0
		const app = await started([greeter.plugin({ greeting: 'Hi' })])
		try {
			expect(built).toEqual([{ options: { greeting: 'Hi' }, models: [Post] }])
			expect(exposed.map(({ name, plugin }) => [name, plugin])).toEqual([
				['own', undefined],
				['greet', 'greeter'],
				['firstModel', 'greeter'],
			])
			expect(exposed[2]?.output).toMatchObject({ kind: 'model', name: 'Post' })
		} finally {
			await app.stop()
		}
	})

	it('receive the client a transport passes, none from server code', async () => {
		seen.length = 0
		const app = await started([greeter.plugin({ greeting: 'Hi' })])
		try {
			const greet = exposed.find(({ name }) => name === 'greet')
			const from = client()
			await expect(greet?.run({ name: 'Ada' }, {}, from)).resolves.toBe(
				'Hi Ada',
			)
			await expect(greet?.run({ name: 'Ada' }, {})).resolves.toBe('Hi Ada')
			expect(seen).toEqual([from, undefined])
		} finally {
			await app.stop()
		}
	})

	it('take a name once, naming both', async () => {
		const greet = defineFunction({ name: 'greet', run: () => undefined })
		await expect(
			started([greeter.plugin({ greeting: 'Hi' })], [greet]),
		).rejects.toThrow(
			"greeter's function greet and the application's function greet are both named greet.",
		)
	})

	it('are a list', async () => {
		const wrong = definePlugin<PluginTypes & { readonly name: 'wrong' }>({
			name: 'wrong',
			manifest,
			// @ts-expect-error: the test passes what the types refuse.
			functions: () => 1,
		})
		await expect(started([wrong.plugin()])).rejects.toThrow(
			'wrong.functions returns an array (D-113).',
		)
		const stray = definePlugin<PluginTypes & { readonly name: 'stray' }>({
			name: 'stray',
			manifest,
			// @ts-expect-error: the test passes what the types refuse.
			functions: () => [{}],
		})
		await expect(started([stray.plugin()])).rejects.toThrow(
			'stray.functions lists a value that defineFunction did not return.',
		)
	})

	it('never return the plugin’s own models (D-110)', async () => {
		const Secret = defineModel({
			name: 'Secret',
			fields: (f) => ({ text: f.string() }),
		})
		const keeper = definePlugin<PluginTypes & { readonly name: 'keeper' }>({
			name: 'keeper',
			manifest,
			models: [Secret],
			functions: () => [
				defineFunction({
					name: 'secret',
					output: Secret,
					run: () => {
						throw new Error('Not called.')
					},
				}),
			],
		})
		await expect(started([keeper.plugin()])).rejects.toThrow(
			'secret returns Secret, a model of keeper (D-110).',
		)
	})
})

describe('TOO_MANY_ATTEMPTS', () => {
	it('carries when to retry, in seconds', () => {
		const error = new PublicError('TOO_MANY_ATTEMPTS', 'Wait.', {
			details: { retryAfter: 60 },
		})
		expect(error).toMatchObject({
			code: 'TOO_MANY_ATTEMPTS',
			details: { retryAfter: 60 },
		})
		// @ts-expect-error: its details say when to retry.
		void new PublicError('TOO_MANY_ATTEMPTS', 'Wait.', { details: {} })
		void master
	})
})
