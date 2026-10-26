// `ultimabase/internal` (D-130): new runs of an application on another
// database, without info lines, and the running plugins' APIs.
import { afterEach, expect, it, vi } from 'vitest'
import type { Logger, PluginTypes } from './index.ts'
import {
	defineApp,
	defineModel,
	definePlugin,
	master,
	memory,
} from './index.ts'
import { quietRuns, runningApi } from './internal.ts'

const M = { as: master }
const Note = defineModel({
	name: 'Note',
	fields: (f) => ({ text: f.string() }),
})

interface Echo extends PluginTypes {
	readonly name: 'echo'
	readonly api: { readonly say: () => string }
}
const echo = definePlugin<Echo>({
	name: 'echo',
	manifest: {
		name: 'echo',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
	api: () => ({ say: () => 'hi' }),
	start: ({ logger }) => {
		logger.info('Started.')
		logger.warn('Careful.')
		logger.error('Broken.')
	},
})

const lines: string[] = []
function recorder(name = ''): Logger {
	const at = (level: string) => (first: string | object, message?: string) => {
		lines.push(
			`${level} ${name} ${typeof first === 'string' ? first : message}`,
		)
	}
	return {
		info: at('info'),
		warn: at('warn'),
		error: at('error'),
		child: (bindings) => recorder(Object.values(bindings).join(',')),
	}
}

let stop: (() => Promise<void>) | undefined
afterEach(async () => {
	await stop?.()
	stop = undefined
	lines.length = 0
	vi.restoreAllMocks()
})

it('runs the application on the database it is given', async () => {
	const declared = memory()
	const app = defineApp({ database: declared, models: [Note] })
	const runs = quietRuns(app)
	expect(runs).toBeDefined()
	const first = runs?.(memory())
	await first?.start()
	await Note.create({ data: { text: 'one' } }, M)
	await first?.stop()
	const second = runs?.(memory())
	await second?.start()
	stop = second?.stop
	expect(await Note.count({}, M)).toBe(0)
})

it('drops info lines and keeps warnings and errors', async () => {
	const app = defineApp({
		database: memory(),
		plugins: [echo.plugin()],
		models: [Note],
		logger: recorder(),
	})
	const run = quietRuns(app)?.(memory())
	await run?.start()
	stop = run?.stop
	expect(lines).toEqual(['warn echo Careful.', 'error echo Broken.'])
	const api = runningApi('echo')
	expect(typeof api === 'object' && api !== null && 'say' in api).toBe(true)
})

it('quiets the console logger when the application has none', async () => {
	const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
	const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
	vi.spyOn(console, 'error').mockImplementation(() => undefined)
	const app = defineApp({
		database: memory(),
		plugins: [echo.plugin()],
		models: [Note],
	})
	const run = quietRuns(app)?.(memory())
	await run?.start()
	stop = run?.stop
	expect(info).not.toHaveBeenCalled()
	expect(warn).toHaveBeenCalledOnce()
})

it('knows only what defineApp returned, and APIs only while running', () => {
	expect(quietRuns({ start: () => undefined })).toBeUndefined()
	expect(quietRuns(undefined)).toBeUndefined()
	expect(runningApi('echo')).toBeUndefined()
})
