// The application's code logs with the application's logger (D-364): a
// function bound to its name, a plugin's function naming its plugin, and the
// application's hooks with the `app` logger itself; the console's without an
// application.
import { afterEach, expect, it, vi } from 'vitest'
import type { ExposedFunction, Logger } from './index.ts'
import {
	allow,
	defineApp,
	defineFunction,
	defineModel,
	definePlugin,
	master,
	memory,
} from './index.ts'
import { appLogger } from './internal.ts'

const manifest = {
	name: 'test-plugin',
	version: '1.0.0',
	peerDependencies: { ultimabase: '*' },
}

/** Each info line, with the bindings of the logger that wrote it. */
const lines: { bindings: object; message: string }[] = []
const recording = (bindings: object): Logger => ({
	info: (first: unknown, message?: string) => {
		const text = typeof first === 'string' ? first : (message ?? '')
		lines.push({ bindings, message: text })
	},
	warn: () => undefined,
	error: () => undefined,
	child: (more) => recording({ ...bindings, ...more }),
})
const linesOf = (message: string) =>
	lines.filter((line) => line.message === message).map((line) => line.bindings)

const Post = defineModel({
	name: 'Post',
	fields: (f) => ({ title: f.string() }),
}).with({
	access: allow.public,
	hooks: {
		beforeFind: ({ logger }) => {
			logger.info('Reading posts.')
		},
		afterCreate: ({ record, logger }) => {
			logger.info(`Created ${record.title}.`)
		},
	},
})

const refund = defineFunction({
	name: 'refund',
	run: ({ logger }) => {
		logger.info('Refunded.')
	},
})

let exposed: readonly ExposedFunction[] = []
const billing = definePlugin({
	name: 'billing',
	manifest,
	start: ({ functions }) => {
		exposed = functions
	},
	functions: () => [
		defineFunction({
			name: 'charge',
			run: ({ logger }) => {
				logger.info('Charged.')
			},
		}),
	],
})

let stop: (() => Promise<void>) | undefined
afterEach(async () => {
	await stop?.()
	stop = undefined
	lines.length = 0
})

it('gives functions and hooks the app logger, a function bound to its name', async () => {
	const app = defineApp({
		database: memory(),
		models: [Post],
		functions: [refund],
		plugins: [billing.plugin()],
		logger: recording({}),
	})
	await app.start()
	stop = async () => app.stop()
	await refund.run({ as: master })
	expect(linesOf('Refunded.')).toEqual([{ name: 'app', function: 'refund' }])
	const charge = exposed.find(({ name }) => name === 'charge')
	await charge?.run(undefined, { as: master })
	expect(linesOf('Charged.')).toEqual([{ name: 'billing', function: 'charge' }])
	await Post.create({ data: { title: 'one' } }, { as: master })
	expect(linesOf('Created one.')).toEqual([{ name: 'app' }])
	await Post.findMany({}, { as: master })
	expect(linesOf('Reading posts.')).toContainEqual({ name: 'app' })
})

it('logs to the console as app when no application runs', () => {
	const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
	try {
		appLogger().info('Outside.')
		expect(info.mock.calls.join()).toMatch(/"name":"app".*Outside\./)
	} finally {
		info.mockRestore()
	}
})
