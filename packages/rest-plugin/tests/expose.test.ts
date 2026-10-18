import { UltimaBase, dateTimeField } from '@ultimabase/core'
import { httpPlugin } from '@ultimabase/http-plugin'
import { command, definePlugin, feature } from '@ultimabase/plugin-kit'
import { describe, expect, it, onTestFinished, vi } from 'vitest'

import { restPlugin, type RestPluginOptions } from '../src/index.js'
import { databasePlugin } from './exposure.test-support.js'

// ADR-0347: REST serves what Core's exposure plan decides.
const archivePlugin = () =>
	definePlugin({
		name: '@fixture/rest-expose-archive',
		features: {
			archivable: feature({
				fields: { archivedAt: dateTimeField() },
				commands: {
					archiveOne: command({
						authority: 'request',
						effect: 'update',
						data: () => ({ archivedAt: new Date().toISOString() }),
					}),
					archiveMany: command({
						authority: 'request',
						effect: 'update',
						target: 'many',
						data: () => ({ archivedAt: new Date().toISOString() }),
					}),
				},
			}),
		},
	})

const App = UltimaBase.use(archivePlugin()).use(restPlugin())

const schema = (className: string) =>
	App.Schema.define({
		className,
		fields: (field) => ({ title: field.string() }),
		archivable: true,
	})

const ExposeCount = schema('RestExposeCount').with({ expose: { count: true } })
const ExposeReadOnly = schema('RestExposeReadOnly').with({
	expose: { write: false },
})
const ExposeHidden = schema('RestExposeHidden').with({ expose: false })
// The transport key wins over `expose`, even when it is less precise.
const RestWins = schema('RestWinsOverExpose').with({
	expose: { count: true, archive: true },
	rest: { read: false },
})
const RestOperation = schema('RestOperationKey').with({
	rest: { archive: true, find: false },
})
const RestShown = schema('RestShownDespiteExpose').with({
	expose: false,
	rest: { findMany: true },
})

const start = async (
	options: RestPluginOptions = {},
	warn: (line: string) => void = vi.fn(),
) => {
	const ultimabase = new (UltimaBase.use(
		databasePlugin,
		archivePlugin(),
		restPlugin({ publicWrites: true, ...options }),
		httpPlugin(),
	))({
		logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn },
		schemas: [
			ExposeCount,
			ExposeReadOnly,
			ExposeHidden,
			RestWins,
			RestOperation,
			RestShown,
		],
	})
	onTestFinished(() => ultimabase.dispose())
	await ultimabase.start()
	const routes = ultimabase
		.plugin('@ultimabase/rest-plugin')
		.routeGraph.routes.map((route) => `${route.method} ${route.path}`)
	const fetch = (path: string, method: string) =>
		ultimabase
			.plugin(httpPlugin)
			.fetch(new Request(`http://localhost${path}`, { method }))
	return { fetch, routes }
}

const routesOf = (routes: readonly string[], className: string) =>
	routes.filter((route) => route.includes(`/classes/${className}`))

describe('REST reads the exposure plan (ADR-0347)', () => {
	it('applies expose to every method it decides', async () => {
		const { routes } = await start()
		expect(routes).toContain('GET /api/classes/RestExposeCount/count')
		expect(routes).toContain('POST /api/classes/RestExposeCount')
		expect(routesOf(routes, 'RestExposeReadOnly')).toStrictEqual([
			'GET /api/classes/RestExposeReadOnly',
			'POST /api/classes/RestExposeReadOnly/query',
			'GET /api/classes/RestExposeReadOnly/first',
			'POST /api/classes/RestExposeReadOnly/first',
			'GET /api/classes/RestExposeReadOnly/exists',
			'POST /api/classes/RestExposeReadOnly/exists',
			'GET /api/classes/RestExposeReadOnly/{id}',
		])
		expect(routesOf(routes, 'RestExposeHidden')).toStrictEqual([])
	})

	it('answers 405 for a write that expose closes', async () => {
		const { fetch } = await start()
		const response = await fetch('/api/classes/RestExposeReadOnly', 'POST')
		expect(response.status).toBe(405)
		expect(response.headers.get('allow')).toBe('GET')
	})

	it('lets the rest key win over expose at any level', async () => {
		const { routes } = await start()
		expect(routesOf(routes, 'RestWinsOverExpose')).toStrictEqual([
			'POST /api/classes/RestWinsOverExpose',
			'PATCH /api/classes/RestWinsOverExpose/{id}',
			'DELETE /api/classes/RestWinsOverExpose/{id}',
			'POST /api/classes/RestWinsOverExpose/{id}/archive-one',
		])
		expect(routesOf(routes, 'RestShownDespiteExpose')).toStrictEqual([
			'GET /api/classes/RestShownDespiteExpose',
			'POST /api/classes/RestShownDespiteExpose/query',
		])
	})

	it('publishes the One method of an operation key, never the Many one', async () => {
		const { routes } = await start()
		const operation = routesOf(routes, 'RestOperationKey')
		expect(operation).toContain(
			'POST /api/classes/RestOperationKey/{id}/archive-one',
		)
		expect(operation).not.toContain('GET /api/classes/RestOperationKey')
		expect(operation.some((route) => route.includes('archive-many'))).toBe(
			false,
		)
	})

	it('takes group keys in restPlugin({ default })', async () => {
		const { routes } = await start({ default: { count: false, write: false } })
		// `expose` and the rest key decide before the default.
		expect(routes).toContain('GET /api/classes/RestExposeCount/count')
		expect(routes).toContain(
			'POST /api/classes/RestOperationKey/{id}/archive-one',
		)
		expect(routes).not.toContain('GET /api/classes/RestOperationKey/count')
		expect(routes).not.toContain('POST /api/classes/RestOperationKey')
	})

	it('silences the expose warning once REST plans', async () => {
		const warn = vi.fn()
		await start({}, warn)
		expect(
			warn.mock.calls.filter(([line]) => String(line).includes('expose')),
		).toStrictEqual([])
	})

	it('still warns about expose without a transport', async () => {
		const warn = vi.fn()
		const Lonely = UltimaBase.Schema.define({
			className: 'RestExposeWithoutTransport',
			fields: (field) => ({ title: field.string() }),
		}).with({ expose: { count: true } })
		const ultimabase = new (UltimaBase.use(databasePlugin))({
			logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn },
			schemas: [Lonely],
		})
		onTestFinished(() => ultimabase.dispose())
		await ultimabase.start()
		expect(warn).toHaveBeenCalledWith(
			'RestExposeWithoutTransport declares expose, but no transport is installed: it has no effect.',
		)
	})
})
