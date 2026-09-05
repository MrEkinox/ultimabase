import { serve, type ServerType } from '@hono/node-server'
import {
	httpApplicationProtocolVersion,
	httpOriginalHeaderMode,
	type HttpApplication,
	type HttpBrowserPolicy,
} from '@ultimabase/http-plugin'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createServer, type Server } from 'node:http'
import { chromium, type BrowserContext, type Page } from 'playwright'
import { describe, expect, it } from 'vitest'

import { HonoServerProvider } from './provider.js'

interface BrowserFetchResult {
	readonly body: string
	readonly errorName: string | undefined
	readonly status: number | undefined
}

interface BrowserBoundaryObservations {
	applicationEffects: number
	preflights: number
}

const closeServer = (server: Server | ServerType): Promise<void> =>
	new Promise((resolve, reject) => {
		server.close((error?: Error) => {
			if (error === undefined) resolve()
			else reject(error)
		})
	})

const startOriginServer = (): Promise<Server> =>
	new Promise((resolve, reject) => {
		const server = createServer((_request, response) => {
			response.setHeader('Content-Type', 'text/html; charset=utf-8')
			response.end('<!doctype html><title>Browser boundary fixture</title>')
		})
		server.once('error', reject)
		server.listen(0, '127.0.0.1', () => {
			server.removeListener('error', reject)
			resolve(server)
		})
	})

const startHonoServer = (app: Hono): Promise<ServerType> =>
	new Promise((resolve, reject) => {
		const server = serve(
			{
				fetch: app.fetch,
				hostname: '127.0.0.1',
				overrideGlobalObjects: false,
				port: 0,
			},
			() => {
				server.removeListener('error', reject)
				resolve(server)
			},
		)
		server.once('error', reject)
	})

const readOrigin = (server: Server | ServerType): string => {
	const address = server.address()
	if (typeof address !== 'object' || address === null) {
		throw new TypeError('Missing browser fixture listener address')
	}
	return `http://127.0.0.1:${String(address.port)}`
}

const browserFetch = (
	page: Page,
	url: string,
	init: Readonly<{
		readonly body?: string
		readonly credentials?: 'include'
		readonly headers?: Readonly<Record<string, string>>
		readonly method?: string
	}> = {},
): Promise<BrowserFetchResult> =>
	page.evaluate(
		async ({ requestInit, requestUrl }) => {
			try {
				const response = await fetch(requestUrl, requestInit)
				return {
					body: await response.text(),
					errorName: undefined,
					status: response.status,
				}
			} catch (error: unknown) {
				return {
					body: '',
					errorName: error instanceof Error ? error.name : 'UnknownError',
					status: undefined,
				}
			}
		},
		{ requestInit: init, requestUrl: url },
	)

const createBrowserApplication = (
	observations: BrowserBoundaryObservations,
): HttpApplication => ({
	appId: 'browser',
	authority: { master: { enabled: true } },
	protocolVersion: httpApplicationProtocolVersion,
	originalHeaderMode: httpOriginalHeaderMode,
	requestTimeoutMs: undefined,
	routeGraph: { endpoints: [], mounts: [], routes: [] },
	fetch: ({ request }) => {
		// Crossing this boundary represents all application-owned behavior below it.
		observations.applicationEffects += 1
		return Promise.resolve(
			Response.json({
				applicationEffects: observations.applicationEffects,
				authorization: request.headers.get('Authorization'),
				cookie: request.headers.get('Cookie'),
				master: request.headers.get('X-UltimaBase-Master-Key'),
				preflights: observations.preflights,
			}),
		)
	},
})

const createBrowserPolicy = (allowedOrigin: string): HttpBrowserPolicy => ({
	allowedHeaders: [
		'X-UltimaBase-Application-Id',
		'Authorization',
		'Content-Type',
		'X-UltimaBase-Request-Id',
		'X-UltimaBase-Master-Key',
	],
	allowedMethods: ['GET', 'POST'],
	allowedOrigins: [allowedOrigin],
	credentials: true,
	enabled: true,
	maxAgeSeconds: 600,
})

const openPage = async (
	context: BrowserContext,
	origin: string,
): Promise<Page> => {
	const page = await context.newPage()
	await page.goto(origin)
	return page
}

describe('HTTP browser boundary in Chromium', () => {
	it('enforces origins, credentials, preflight isolation, and cache variation', async () => {
		const allowedServer = await startOriginServer()
		const rejectedServer = await startOriginServer()
		const observations: BrowserBoundaryObservations = {
			applicationEffects: 0,
			preflights: 0,
		}
		const app = new Hono()
		app.use('*', async (context, next) => {
			if (context.req.method === 'OPTIONS') observations.preflights += 1
			await next()
		})
		const provider = new HonoServerProvider({
			app,
			browserPolicyOwner: 'ultimabase',
			host: undefined,
			port: 1337,
		})
		const application = createBrowserApplication(observations)
		const browser = await chromium.launch({ headless: true })
		const context = await browser.newContext()
		let targetServer: ServerType | undefined

		try {
			const allowedOrigin = readOrigin(allowedServer)
			await provider.start(application, createBrowserPolicy(allowedOrigin))
			targetServer = await startHonoServer(app)
			const targetOrigin = readOrigin(targetServer)
			const allowedPage = await openPage(context, allowedOrigin)

			const missingApplication = await browserFetch(
				allowedPage,
				`${targetOrigin}/simple`,
			)
			expect(missingApplication.status).toBe(401)
			expect(observations).toStrictEqual({
				applicationEffects: 0,
				preflights: 0,
			})

			const bearerRequest = {
				body: JSON.stringify({ title: 'browser' }),
				headers: {
					Authorization: 'Bearer browser-token',
					'Content-Type': 'application/json',
					'X-UltimaBase-Application-Id': 'browser',
					'X-UltimaBase-Request-Id': 'browser-request',
				},
				method: 'POST',
			} as const
			const firstBearer = await browserFetch(
				allowedPage,
				`${targetOrigin}/bearer`,
				bearerRequest,
			)
			expect(firstBearer.status).toBe(200)
			expect(JSON.parse(firstBearer.body)).toMatchObject({
				applicationEffects: 1,
				authorization: 'Bearer browser-token',
				preflights: 1,
			})

			const cachedBearer = await browserFetch(
				allowedPage,
				`${targetOrigin}/bearer`,
				bearerRequest,
			)
			expect(JSON.parse(cachedBearer.body)).toMatchObject({
				applicationEffects: 2,
				preflights: 1,
			})

			await context.addCookies([
				{
					name: 'session',
					sameSite: 'Lax',
					url: targetOrigin,
					value: 'opaque-cookie',
				},
			])
			const cookieRequest = await browserFetch(
				allowedPage,
				`${targetOrigin}/cookie`,
				{
					credentials: 'include',
					headers: { 'X-UltimaBase-Application-Id': 'browser' },
				},
			)
			expect(cookieRequest.status).toBe(200)
			expect(JSON.parse(cookieRequest.body)).toMatchObject({
				applicationEffects: 3,
				cookie: 'session=opaque-cookie',
				preflights: 2,
			})

			const masterRequest = await browserFetch(
				allowedPage,
				`${targetOrigin}/master`,
				{
					headers: {
						'X-UltimaBase-Application-Id': 'browser',
						'X-UltimaBase-Master-Key': 'master-secret',
					},
				},
			)
			expect(masterRequest.status).toBe(200)
			expect(JSON.parse(masterRequest.body)).toMatchObject({
				applicationEffects: 4,
				master: 'master-secret',
				preflights: 3,
			})

			const rejectedPage = await openPage(context, readOrigin(rejectedServer))
			const rejected = await browserFetch(
				rejectedPage,
				`${targetOrigin}/bearer`,
				bearerRequest,
			)
			expect(rejected).toMatchObject({
				body: '',
				errorName: 'TypeError',
				status: undefined,
			})
			expect(observations).toStrictEqual({
				applicationEffects: 4,
				preflights: 4,
			})
		} finally {
			await context.close()
			await browser.close()
			if (targetServer !== undefined) await closeServer(targetServer)
			await provider.dispose(application)
			await Promise.all([
				closeServer(allowedServer),
				closeServer(rejectedServer),
			])
		}
	})

	it('leaves an existing Hono application as the only external CORS owner', async () => {
		const originServer = await startOriginServer()
		const allowedOrigin = readOrigin(originServer)
		const app = new Hono()
		app.use(
			'*',
			cors({
				allowHeaders: ['X-UltimaBase-Application-Id'],
				credentials: true,
				origin: allowedOrigin,
			}),
		)
		const observations: BrowserBoundaryObservations = {
			applicationEffects: 0,
			preflights: 0,
		}
		const provider = new HonoServerProvider({
			app,
			browserPolicyOwner: 'external',
			host: undefined,
			port: 1337,
		})
		const application = createBrowserApplication(observations)
		await provider.start(application)
		const targetServer = await startHonoServer(app)
		const browser = await chromium.launch({ headless: true })
		const context = await browser.newContext()

		try {
			const page = await openPage(context, allowedOrigin)
			const response = await browserFetch(
				page,
				`${readOrigin(targetServer)}/external-owner`,
				{
					headers: { 'X-UltimaBase-Application-Id': 'browser' },
				},
			)
			expect(response.status).toBe(200)
			expect(JSON.parse(response.body)).toMatchObject({
				applicationEffects: 1,
			})
		} finally {
			await context.close()
			await browser.close()
			await closeServer(targetServer)
			await provider.dispose(application)
			await closeServer(originServer)
		}
	})
})
