import { describe, expect, it, vi } from 'vitest'

import type { FrameworkError } from '../errors/framework-error.js'
import { plugin as createPlugin } from '../plugins/plugin.js'
import {
	contributeApplication,
	withPluginPrivileges,
} from '../plugins/plugin-contributions.js'
import { UltimaBase } from '../runtime/application/ultima-base.js'
import { ApplicationLog, type Logger } from './application-log.js'
import { FrameworkApplication } from './framework-application.js'
import { formatStartupSummary } from './startup-summary.js'

const capture = () => {
	const lines: { level: string; message: string; details?: object }[] = []
	const write =
		(level: string) =>
		(message: string, details?: object): void => {
			lines.push(
				details === undefined
					? { level, message }
					: { level, message, details },
			)
		}
	const logger: Logger = {
		debug: write('debug'),
		info: write('info'),
		warn: write('warn'),
		error: write('error'),
	}
	return { lines, logger }
}

const Todo = UltimaBase.Schema.define({
	className: 'LogTodo',
	fields: (field) => ({ title: field.string() }),
})

const elevating = createPlugin({
	core: '^0.0.0',
	id: '@fixture/elevating-plugin',
	permissions: { 'authority:elevate': 'Signs users in.' },
	version: '1.0.0',
	contributions: [
		withPluginPrivileges(
			contributeApplication(({ logger }) => {
				logger.info('ready')
				return {
					exports: undefined,
					connect: ({ logger: started }) => {
						started.warn('connected')
					},
				}
			}),
			['authority:elevate'],
		),
	],
})
const quiet = createPlugin({
	core: '^0.0.0',
	id: '@fixture/quiet-plugin',
	version: '1.0.0',
	contributions: [],
})

// ADR-0313: one logger and level per application, plugin-prefixed lines.
describe('application logger', () => {
	it('logs one exact info summary line after start and the report at debug only', async () => {
		const { lines, logger } = capture()
		const ultimabase = new (UltimaBase.use(quiet, elevating))({
			logger,
			schemas: [Todo],
		})
		await ultimabase.start()
		await ultimabase.dispose()

		expect(lines).toStrictEqual([
			{ level: 'info', message: '[@fixture/elevating-plugin] ready' },
			{ level: 'warn', message: '[@fixture/elevating-plugin] connected' },
			{
				level: 'info',
				message:
					"UltimaBase started: 1 schema, 2 plugins (@fixture/quiet-plugin, @fixture/elevating-plugin); critical privileges: authority:elevate (@fixture/elevating-plugin). Use logLevel 'debug' for the privilege report.",
			},
		])
	})

	it('adds the privilege report at debug and keeps it out at warn', async () => {
		const debug = capture()
		const reported = new (UltimaBase.use(elevating))({
			logger: debug.logger,
			logLevel: 'debug',
			schemas: [],
		})
		expect(debug.lines[0]).toStrictEqual({
			level: 'debug',
			message: 'UltimaBase plugin privilege report',
			details: reported.pluginPrivilegeReport,
		})

		const warn = capture()
		const quietApplication = new (UltimaBase.use(elevating))({
			logger: warn.logger,
			logLevel: 'warn',
			schemas: [],
		})
		await quietApplication.start()
		await quietApplication.dispose()
		expect(warn.lines).toStrictEqual([
			{ level: 'warn', message: '[@fixture/elevating-plugin] connected' },
		])
	})

	it('silences everything with logger: false', async () => {
		const spies = (['debug', 'info', 'warn', 'error'] as const).map((level) =>
			vi.spyOn(console, level).mockImplementation(() => undefined),
		)
		try {
			const ultimabase = new (UltimaBase.use(elevating))({
				logger: false,
				logLevel: 'debug',
				schemas: [Todo],
			})
			await ultimabase.start()
			await ultimabase.dispose()
			for (const spy of spies) expect(spy).not.toHaveBeenCalled()
		} finally {
			for (const spy of spies) spy.mockRestore()
		}
	})

	it('writes to the console by default', async () => {
		const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
		try {
			const ultimabase = new UltimaBase({ schemas: [] })
			await ultimabase.start()
			await ultimabase.dispose()
			expect(info).toHaveBeenCalledExactlyOnceWith(
				"UltimaBase started: 0 schemas, 0 plugins; no critical privileges. Use logLevel 'debug' for the privilege report.",
			)
		} finally {
			info.mockRestore()
		}
	})

	it('rejects invalid logger and logLevel options before any plugin work', () => {
		expect(
			() => new UltimaBase({ logLevel: 'verbose' as never, schemas: [] }),
		).toThrow("logLevel must be 'debug', 'info', 'warn' or 'error'")
		expect(
			() => new UltimaBase({ logger: true as never, schemas: [] }),
		).toThrow(
			'logger must be false or an object with debug, info, warn and error methods',
		)
		expect(
			() =>
				new UltimaBase({
					logger: { debug: () => undefined } as never,
					schemas: [],
				}),
		).toThrow('logger.info must be a function')
	})

	it('never lets a failing logger fail what it reports on', async () => {
		const failing = new ApplicationLog(
			{
				debug: () => {
					throw new Error('sync failure')
				},
				info: () => Promise.reject(new Error('async failure')),
				warn: () => undefined,
				error: () => undefined,
			},
			'debug',
		)
		expect(() => {
			failing.debug('line')
			failing.forPlugin({ pluginId: '@fixture/a' }).info('line')
		}).not.toThrow()
		await Promise.resolve()
	})

	it('formats plural counts and every critical privilege with its plugins', () => {
		expect(
			formatStartupSummary(3, {
				allowed: true,
				plugins: [
					{
						environment: [],
						identity: { pluginId: '@fixture/a' },
						order: 0,
						privileges: [
							{
								name: 'storage:private',
								policyResult: 'allowed',
								reason: 'Stores sessions.',
								severity: 'critical',
							},
						],
						version: '1.0.0',
					},
					{
						environment: [],
						identity: { instanceId: 'b', pluginId: '@fixture/b' },
						order: 1,
						privileges: [
							{
								name: 'storage:private',
								policyResult: 'allowed',
								reason: 'Stores tokens.',
								severity: 'critical',
							},
							{
								name: 'runtime:observe',
								policyResult: 'allowed',
								reason: 'Times operations.',
								severity: 'standard',
							},
						],
						version: '1.0.0',
					},
				],
			}),
		).toBe(
			"UltimaBase started: 3 schemas, 2 plugins (@fixture/a, @fixture/b (instance b)); critical privileges: storage:private (@fixture/a, @fixture/b (instance b)). Use logLevel 'debug' for the privilege report.",
		)
	})

	it('logs the report at debug on the console, at error on denial, and isolates logger failures', () => {
		const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
		const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
		const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
		const plugin = createPlugin({
			id: 'fixture.console-report',
			version: '1.0.0',
			core: '^0.0.0',
			permissions: { 'runtime:observe': 'Console reporting fixture.' },
			contributions: [
				withPluginPrivileges(
					contributeApplication(() => ({ exports: undefined })),
					['runtime:observe'],
				),
			],
		})

		// ADR-0313: the default `info` level keeps the report out of the console.
		new FrameworkApplication({ schemas: [], plugins: [plugin] })
		expect(debug).not.toHaveBeenCalled()
		expect(info).not.toHaveBeenCalled()

		const reported = new FrameworkApplication({
			schemas: [],
			plugins: [plugin],
			logLevel: 'debug',
		})
		expect(debug).toHaveBeenCalledExactlyOnceWith(
			'UltimaBase plugin privilege report',
			reported.pluginPrivilegeReport,
		)

		new FrameworkApplication({
			schemas: [],
			plugins: [plugin],
			logger: false,
			logLevel: 'debug',
		})
		expect(debug).toHaveBeenCalledOnce()
		expect(error).not.toHaveBeenCalled()

		expect(
			() =>
				new FrameworkApplication({
					schemas: [],
					plugins: [plugin],
					pluginPrivileges: { deny: ['runtime:observe'] },
				}),
		).toThrow(
			expect.objectContaining<Partial<FrameworkError>>({
				code: 'PLUGIN_PRIVILEGE_DENIED',
			}),
		)
		expect(error).toHaveBeenCalledOnce()

		const throwing: Logger = {
			debug: () => undefined,
			info: () => undefined,
			warn: () => undefined,
			error: () => {
				throw new Error('Logger failure')
			},
		}
		expect(
			() =>
				new FrameworkApplication({
					schemas: [],
					plugins: [plugin],
					pluginPrivileges: { deny: ['runtime:observe'] },
					logger: throwing,
				}),
		).toThrow(
			expect.objectContaining<Partial<FrameworkError>>({
				code: 'PLUGIN_PRIVILEGE_DENIED',
			}),
		)

		debug.mockRestore()
		info.mockRestore()
		error.mockRestore()
	})
})
