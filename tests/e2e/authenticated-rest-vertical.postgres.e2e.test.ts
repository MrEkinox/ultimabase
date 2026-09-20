import { serve, type ServerType } from '@hono/node-server'
import type { MasterAccessEvent } from '@ultimabase/core'
import { honoServerPlugin } from '@ultimabase/server-hono-plugin'
import { Hono } from 'hono'
import { createServer, type Server } from 'node:http'
import { chromium, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../fixtures/postgres-worker-fixture.js'
import {
	invoke,
	loadMinimalExample,
	readObject,
	readString,
	type MinimalApplication,
	type MinimalExampleModule,
} from './rest-public-vertical-support.js'

const firstAppId = 'authenticated-rest-first'
const secondAppId = 'authenticated-rest-second'
const firstMasterKey = 'authenticated-first-master'
const password = 'correct horse battery staple'
const statusPath = '/api/v1/operations/example.status'
const notePath = '/api/v1/classes/ExamplePrivateNote'
const authPath = (name: string): string => `/api/v1/auth/${name}`

let firstFixture: PostgresWorkerFixture | undefined
let secondFixture: PostgresWorkerFixture | undefined
let firstApplication: MinimalApplication | undefined
let createFirstApplication: (() => MinimalApplication) | undefined
let secondApplication: MinimalApplication | undefined
let example: MinimalExampleModule | undefined
let apiServer: ServerType | undefined
let originServer: Server | undefined
let baseUrl = ''
let browserOrigin = ''
const firstAudits: MasterAccessEvent[] = []

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
			response.end('<!doctype html><title>Authenticated REST fixture</title>')
		})
		server.once('error', reject)
		server.listen(0, '127.0.0.1', () => {
			server.removeListener('error', reject)
			resolve(server)
		})
	})

const startApiServer = (app: Hono): Promise<ServerType> =>
	new Promise((resolve, reject) => {
		const server = serve(
			{
				fetch: app.fetch,
				hostname: '127.0.0.1',
				overrideGlobalObjects: true,
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
		throw new TypeError('Authenticated REST listener address is unavailable')
	}
	return `http://127.0.0.1:${String(address.port)}`
}

const requireExample = (): MinimalExampleModule => {
	if (example === undefined)
		throw new TypeError('Minimal example is unavailable')
	return example
}

const requireApplication = (
	application: MinimalApplication | undefined,
	label: string,
): MinimalApplication => {
	if (application === undefined) {
		throw new TypeError(`${label} authenticated application is unavailable`)
	}
	return application
}

const requestJson = (
	applicationId: string,
	path: string,
	options: Readonly<{
		body?: unknown
		masterKey?: string
		method?: 'DELETE' | 'GET' | 'PATCH' | 'POST'
		sessionToken?: string
	}> = {},
): Promise<Response> => {
	const headers = new Headers({
		'X-UltimaBase-Application-Id': applicationId,
	})
	if (options.body !== undefined)
		headers.set('Content-Type', 'application/json')
	if (options.masterKey !== undefined) {
		headers.set('X-UltimaBase-Master-Key', options.masterKey)
	}
	if (options.sessionToken !== undefined) {
		headers.set('Authorization', `Bearer ${options.sessionToken}`)
	}
	return fetch(`${baseUrl}${path}`, {
		...(options.body === undefined
			? {}
			: { body: JSON.stringify(options.body) }),
		headers,
		method: options.method ?? 'GET',
	})
}

const readAuthentication = async (
	response: Response,
): Promise<Readonly<{ token: string; userId: string }>> => {
	const body = readObject(await response.json(), 'authentication response')
	const result = readObject(
		Reflect.get(body, 'result'),
		'authentication result',
	)
	const user = readObject(Reflect.get(result, 'user'), 'authenticated user')
	expect(result).not.toHaveProperty('principal')
	const session = readObject(
		Reflect.get(result, 'session'),
		'authentication session',
	)
	return {
		token: readString(session, 'token'),
		userId: readString(user, 'id'),
	}
}

const browserFetch = (
	page: Page,
	path: string,
	init: Readonly<{
		body?: string
		credentials?: 'include'
		headers?: Readonly<Record<string, string>>
		method?: string
	}> = {},
): Promise<Readonly<{ body: string; errorName?: string; status?: number }>> =>
	page.evaluate(
		async ({ requestInit, requestUrl }) => {
			try {
				const response = await fetch(requestUrl, requestInit)
				return { body: await response.text(), status: response.status }
			} catch (error: unknown) {
				return {
					body: '',
					errorName: error instanceof Error ? error.name : 'UnknownError',
				}
			}
		},
		{ requestInit: init, requestUrl: `${baseUrl}${path}` },
	)

beforeAll(async () => {
	example = await loadMinimalExample()
	originServer = await startOriginServer()
	browserOrigin = readOrigin(originServer)
	const [createdFirstFixture, createdSecondFixture] = await Promise.all([
		createPostgresWorkerFixture({ prefix: 'authenticated_rest_first' }),
		createPostgresWorkerFixture({ prefix: 'authenticated_rest_second' }),
	])
	firstFixture = createdFirstFixture
	secondFixture = createdSecondFixture
	const hono = new Hono()
	const sharedServer = honoServerPlugin({
		app: hono,
		browserPolicyOwner: 'ultimabase',
	})
	const minimal = requireExample()
	createFirstApplication = () =>
		minimal.createMinimalApplication({
			applicationId: firstAppId,
			browserOrigin,
			databaseUrl: createdFirstFixture.connectionUri,
			masterKey: firstMasterKey,
			onMasterUse: (event) => firstAudits.push(event),
			server: sharedServer,
		})
	firstApplication = createFirstApplication()
	secondApplication = minimal.createMinimalApplication({
		applicationId: secondAppId,
		browserOrigin,
		databaseUrl: createdSecondFixture.connectionUri,
		masterKey: 'authenticated-second-master',
		onMasterUse: () => undefined,
		server: sharedServer,
	})
	await firstApplication.start()
	apiServer = await startApiServer(hono)
	baseUrl = readOrigin(apiServer)
}, 30_000)

afterAll(async () => {
	if (apiServer !== undefined) await closeServer(apiServer)
	if (originServer !== undefined) await closeServer(originServer)
	await Promise.allSettled([
		firstApplication?.dispose(),
		secondApplication?.dispose(),
	])
	await Promise.allSettled([firstFixture?.dispose(), secondFixture?.dispose()])
})

describe('authenticated public REST vertical', { concurrent: false }, () => {
	it('joins Password Auth, roles, Access, ACL, Hono, and PostgreSQL', async () => {
		const minimal = requireExample()
		const signUp = await requestJson(firstAppId, authPath('sign-up'), {
			body: { input: { password, username: 'ada' } },
			method: 'POST',
		})
		expect(signUp.status).toBe(200)
		const firstSession = await readAuthentication(signUp)
		expect(firstSession.token).toMatch(/^ub_s1\./u)

		const login = await requestJson(firstAppId, authPath('login'), {
			body: { input: { password, username: 'ADA' } },
			method: 'POST',
		})
		expect(login.status).toBe(200)
		const authenticated = await readAuthentication(login)
		expect(authenticated).toMatchObject({ userId: firstSession.userId })
		expect(authenticated.token).not.toBe(firstSession.token)

		const application = requireApplication(firstApplication, 'first')
		const editor = readObject(
			await invoke(minimal.ExampleRole, 'createOne', [
				{ data: { description: 'Can manage private notes', name: 'editor' } },
				{ ultimabase: application, useMasterKey: true },
			]),
			'editor role',
		)
		const userPointer = await invoke(minimal.ExampleUser, 'pointer', [
			authenticated.userId,
		])
		await invoke(editor, 'addMember', [
			userPointer,
			{
				ultimabase: application,
				useMasterKey: true,
			},
		])

		const status = await requestJson(firstAppId, statusPath, {
			body: { input: null },
			method: 'POST',
			sessionToken: authenticated.token,
		})
		expect(await status.json()).toStrictEqual({
			result: { authority: 'anonymous', principalId: authenticated.userId },
		})

		const requestId = 'authenticated-rest-master-request'
		const masterStatus = await fetch(`${baseUrl}${statusPath}`, {
			body: JSON.stringify({ input: null }),
			headers: {
				Authorization: `Bearer ${authenticated.token}`,
				'Content-Type': 'application/json',
				'X-UltimaBase-Application-Id': firstAppId,
				'X-UltimaBase-Master-Key': firstMasterKey,
				'X-UltimaBase-Request-Id': requestId,
			},
			method: 'POST',
		})
		expect(await masterStatus.json()).toStrictEqual({
			result: { authority: 'master', principalId: authenticated.userId },
		})
		expect(firstAudits).toContainEqual(
			expect.objectContaining({
				keyId: firstAppId,
				requestId,
				source: 'ultimabase.rest',
			}),
		)

		const created = await requestJson(firstAppId, notePath, {
			body: { body: 'Private draft' },
			method: 'POST',
			sessionToken: authenticated.token,
		})
		expect(created.status).toBe(201)
		const createdBody = readObject(
			await created.json(),
			'created note response',
		)
		const createdResult = readObject(
			Reflect.get(createdBody, 'result'),
			'created note',
		)
		const noteId = readString(createdResult, 'id')
		const read = await requestJson(firstAppId, `${notePath}/${noteId}`, {
			sessionToken: authenticated.token,
		})
		expect(read.status).toBe(200)
		const updated = await requestJson(firstAppId, `${notePath}/${noteId}`, {
			body: { body: 'Published privately' },
			method: 'PATCH',
			sessionToken: authenticated.token,
		})
		expect(await updated.json()).toMatchObject({
			result: { body: 'Published privately' },
		})

		const deniedUser = await requestJson(firstAppId, authPath('sign-up'), {
			body: { input: { password, username: 'grace' } },
			method: 'POST',
		})
		const deniedSession = await readAuthentication(deniedUser)
		const denied = await requestJson(firstAppId, notePath, {
			body: { body: 'Forbidden' },
			method: 'POST',
			sessionToken: deniedSession.token,
		})
		expect(denied.status).toBe(403)

		const anonymous = await requestJson(firstAppId, statusPath, {
			body: { input: null },
			method: 'POST',
		})
		expect(await anonymous.json()).toStrictEqual({
			result: { authority: 'anonymous', principalId: null },
		})

		const wrongPassword = await requestJson(firstAppId, authPath('login'), {
			body: {
				input: { password: 'incorrect password value', username: 'ada' },
			},
			method: 'POST',
		})
		const unknownUser = await requestJson(firstAppId, authPath('login'), {
			body: { input: { password, username: 'unknown-user' } },
			method: 'POST',
		})
		const wrongBody = await wrongPassword.text()
		const unknownBody = await unknownUser.text()
		expect([wrongPassword.status, unknownUser.status]).toStrictEqual([401, 401])
		const publicError = (serialized: string): unknown => {
			const parsed: unknown = JSON.parse(serialized)
			const envelope = readObject(parsed, 'login error')
			const error = readObject(Reflect.get(envelope, 'error'), 'public error')
			const code: unknown = Reflect.get(error, 'code')
			const message: unknown = Reflect.get(error, 'message')
			const retryable: unknown = Reflect.get(error, 'retryable')
			return {
				code,
				message,
				retryable,
			}
		}
		expect(publicError(unknownBody)).toStrictEqual(publicError(wrongBody))
		expect(`${wrongBody}${unknownBody}`).not.toMatch(
			/correct horse|incorrect password|unknown-user/u,
		)

		await application.dispose()
		await requireApplication(secondApplication, 'second').start()
		const foreign = await requestJson(secondAppId, statusPath, {
			body: { input: null },
			method: 'POST',
			sessionToken: authenticated.token,
		})
		expect(foreign.status).toBe(401)
		const isolatedSignUp = await requestJson(secondAppId, authPath('sign-up'), {
			body: { input: { password, username: 'ada' } },
			method: 'POST',
		})
		expect(isolatedSignUp.status).toBe(200)
		const secondSession = await readAuthentication(isolatedSignUp)
		expect(secondSession.userId).not.toBe(authenticated.userId)
		const secondApplicationInstance = requireApplication(
			secondApplication,
			'second',
		)
		const isolatedArticle = readObject(
			await invoke(minimal.ExampleArticle, 'createOne', [
				{
					data: {
						slug: 'second-application-soft-delete',
						title: 'Second application',
					},
				},
				{ ultimabase: secondApplicationInstance },
			]),
			'second application article',
		)
		const isolatedArticleId = readString(isolatedArticle, 'id')
		const foreignSoftDelete = await requestJson(
			secondAppId,
			`/api/v1/classes/ExampleArticle/${isolatedArticleId}/soft-delete`,
			{
				body: {},
				method: 'POST',
				sessionToken: authenticated.token,
			},
		)
		expect(foreignSoftDelete.status).toBe(401)
		const isolatedSoftDelete = await requestJson(
			secondAppId,
			`/api/v1/classes/ExampleArticle/${isolatedArticleId}/soft-delete`,
			{
				body: {},
				method: 'POST',
				sessionToken: secondSession.token,
			},
		)
		expect(isolatedSoftDelete.status).toBe(200)
		await expect(
			invoke(minimal.ExampleArticle, 'findOne', [
				{ where: { id: { eq: isolatedArticleId } } },
				{ ultimabase: secondApplicationInstance },
			]),
		).resolves.toBeNull()

		await secondApplicationInstance.dispose()
		if (createFirstApplication === undefined)
			throw new TypeError('First application factory is unavailable')
		firstApplication = createFirstApplication()
		await firstApplication.start()

		for (const response of await Promise.all([
			requestJson(firstAppId, statusPath, {
				body: { input: null },
				method: 'POST',
				sessionToken: 'malformed',
			}),
			requestJson(firstAppId, statusPath, {
				body: { input: null },
				masterKey: 'invalid-master',
				method: 'POST',
				sessionToken: authenticated.token,
			}),
		])) {
			const serialized = await response.text()
			expect(response.status).toBe(401)
			expect(serialized).toContain('HTTP_APPLICATION_REJECTED')
			expect(serialized).not.toMatch(/ub_s1\.|invalid-master/u)
		}

		const hiddenOperation = await requestJson(
			firstAppId,
			authPath('reset-password'),
			{ body: { input: null }, method: 'POST' },
		)
		expect(hiddenOperation.status).toBe(404)

		const browser = await chromium.launch({ headless: true })
		const context = await browser.newContext()
		try {
			const page = await context.newPage()
			await page.goto(browserOrigin)
			const cookieLogin = await browserFetch(page, '/auth/v1/login', {
				body: JSON.stringify({ password, username: 'ada' }),
				credentials: 'include',
				headers: {
					'Content-Type': 'application/json',
					'X-UltimaBase-Application-Id': firstAppId,
				},
				method: 'POST',
			})
			expect(cookieLogin.status).toBe(200)
			expect(cookieLogin.body).not.toContain('ub_s1.')
			const cookieStatus = await browserFetch(page, statusPath, {
				body: JSON.stringify({ input: null }),
				credentials: 'include',
				headers: {
					'Content-Type': 'application/json',
					'X-UltimaBase-Application-Id': firstAppId,
				},
				method: 'POST',
			})
			expect(cookieStatus.status).toBe(200)
			expect(JSON.parse(cookieStatus.body)).toMatchObject({
				result: { principalId: authenticated.userId },
			})

			const browserAuthor = await browserFetch(
				page,
				'/api/v1/classes/ExampleAuthor',
				{
					body: JSON.stringify({ name: 'Browser author' }),
					credentials: 'include',
					headers: {
						'Content-Type': 'application/json',
						'X-UltimaBase-Application-Id': firstAppId,
					},
					method: 'POST',
				},
			)
			expect(browserAuthor.status).toBe(201)
			const browserAuthorResult = readObject(
				Reflect.get(
					readObject(JSON.parse(browserAuthor.body), 'browser author response'),
					'result',
				),
				'browser author result',
			)
			const browserArticle = await browserFetch(
				page,
				`/api/v1/classes/ExampleArticle?include=${encodeURIComponent(
					JSON.stringify({ author: { select: { name: true } } }),
				)}`,
				{
					body: JSON.stringify({
						author: {
							connect: readString(browserAuthorResult, 'id'),
						},
						slug: 'browser-nested-write',
						title: 'Browser nested write',
					}),
					credentials: 'include',
					headers: {
						'Content-Type': 'application/json',
						'X-UltimaBase-Application-Id': firstAppId,
					},
					method: 'POST',
				},
			)
			expect(browserArticle.status, browserArticle.body).toBe(201)
			expect(JSON.parse(browserArticle.body)).toMatchObject({
				result: { author: { name: 'Browser author' } },
			})
		} finally {
			await context.close()
			await browser.close()
		}

		const deleted = await requestJson(firstAppId, `${notePath}/${noteId}`, {
			method: 'DELETE',
			sessionToken: authenticated.token,
		})
		expect(deleted.status).toBe(200)
		const logout = await requestJson(firstAppId, authPath('logout'), {
			body: { input: null },
			method: 'POST',
			sessionToken: authenticated.token,
		})
		expect(await logout.json()).toStrictEqual({ result: { revoked: true } })
		const revoked = await requestJson(firstAppId, statusPath, {
			body: { input: null },
			method: 'POST',
			sessionToken: authenticated.token,
		})
		expect(revoked.status).toBe(401)
		expect(await revoked.text()).not.toContain(authenticated.token)
	}, 60_000)
})
