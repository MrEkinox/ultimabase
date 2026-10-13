import { testApplication } from '@ultimabase/testing'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { securityLog } from '../src/events.ts'
import { ultimabase } from '../src/ultimabase.ts'
import {
	adaPassword,
	newPassword,
	sessionTokenOf,
	tokenSentTo,
} from './support.ts'

// The `/api/auth` routes, sent in memory with `t.fetch` as a client would.
// The proxy in front of the application names the client in
// `X-Forwarded-For` (`trustProxy: 1`).
const json = { 'content-type': 'application/json' }
const ada = { email: 'ada@example.com', password: adaPassword }

const post = (
	path: string,
	body: unknown,
	headers: Readonly<Record<string, string>> = {},
) => ({
	body: JSON.stringify(body),
	headers: { ...json, ...headers },
	method: 'POST',
	path,
})

beforeEach(() => {
	securityLog.length = 0
})

afterEach(() => {
	vi.useRealTimers()
})

it('signs in over HTTP and sends the token as a Bearer', async () => {
	await using t = await testApplication(ultimabase)
	const signUp = await t.fetch('/api/auth/sign-up', {
		body: JSON.stringify({ ...ada, displayName: 'Ada' }),
		headers: json,
		method: 'POST',
	})
	expect(signUp.status).toBe(200)

	//#region http-login
	const login = await t.fetch('/api/auth/login', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			email: 'ada@example.com',
			password: 'correct horse battery staple',
		}),
	})
	//#endregion http-login

	expect(login.status).toBe(200)
	const token = await sessionTokenOf(login)

	//#region http-bearer
	const notes = await t.fetch('/api/classes/Note', {
		headers: { authorization: `Bearer ${token}` },
	})
	//#endregion http-bearer

	expect(notes.status).toBe(200)
	expect(await notes.json()).toMatchObject({ results: [] })
	const bearer = { authorization: `Bearer ${token}` }
	const current = await t.fetch('/api/auth/current', {
		headers: bearer,
		method: 'POST',
	})
	expect(await current.json()).toMatchObject({
		result: { displayName: 'Ada', email: 'ada@example.com' },
	})
	// Without credentials a request is anonymous; a bad token is refused.
	expect((await t.fetch('/api/classes/Note')).status).toBe(403)
	const forged = await t.fetch('/api/classes/Note', {
		headers: { authorization: 'Bearer ub_s1.forged' },
	})
	expect(forged.status).toBe(401)
	expect(await forged.json()).toMatchObject({
		error: { code: 'HTTP_APPLICATION_REJECTED' },
	})
	// REST hides the operations the `/api/auth` routes serve.
	const hidden = await t.fetch('/api/operations/login', {
		body: JSON.stringify(ada),
		headers: json,
		method: 'POST',
	})
	expect(hidden.status).toBe(404)
	const logout = await t.fetch('/api/auth/logout', {
		headers: bearer,
		method: 'POST',
	})
	expect(await logout.json()).toStrictEqual({ result: { revoked: true } })
	expect((await t.fetch('/api/classes/Note', { headers: bearer })).status).toBe(
		401,
	)
})

it('maps authentication failures to HTTP statuses', async () => {
	await using t = await testApplication(ultimabase)
	const send = async (request: ReturnType<typeof post>) => {
		const { path, ...init } = request
		const response = await t.fetch(path, init)
		const body: unknown = await response.json()
		return { body, status: response.status }
	}

	expect(
		await send(
			post('/api/auth/sign-up', {
				displayName: 'Ada',
				email: 'ada@example.com',
				password: 'too short',
			}),
		),
	).toMatchObject({
		body: { error: { code: 'AUTH_SIGN_UP_REJECTED' } },
		status: 400,
	})
	expect(await send(post('/api/auth/login', ada))).toMatchObject({
		body: { error: { code: 'AUTH_INVALID_CREDENTIALS' } },
		status: 401,
	})
	expect(
		await send(post('/api/auth/verify-email', { token: 'ub_v1.forged' })),
	).toMatchObject({
		body: { error: { code: 'AUTH_INVALID_TOKEN' } },
		status: 400,
	})
	expect(await send(post('/api/auth/current', null))).toMatchObject({
		body: { error: { code: 'AUTH_INVALID_SESSION' } },
		status: 401,
	})
})

it('limits failed logins per account and client address', async () => {
	await using t = await testApplication(ultimabase)
	vi.useFakeTimers({ toFake: ['Date'] })
	await t.fetch('/api/auth/sign-up', {
		body: JSON.stringify({ ...ada, displayName: 'Ada' }),
		headers: { ...json, 'x-forwarded-for': '198.51.100.7' },
		method: 'POST',
	})
	const attempt = (password: string, address = '198.51.100.7') =>
		t.fetch('/api/auth/login', {
			body: JSON.stringify({ email: 'ada@example.com', password }),
			headers: { ...json, 'x-forwarded-for': address },
			method: 'POST',
		})
	const wrong = 'wrong horse battery staple'

	// Five free failures; the sixth locks this account and address for 1 s.
	for (let failure = 1; failure <= 6; failure += 1) {
		expect((await attempt(wrong)).status).toBe(401)
	}
	const locked = await attempt(adaPassword)
	expect(locked.status).toBe(429)
	expect(locked.headers.get('retry-after')).toBe('1')
	expect(await locked.json()).toMatchObject({
		error: { code: 'AUTH_TOO_MANY_ATTEMPTS' },
	})
	// The next failure doubles the delay.
	vi.setSystemTime(Date.now() + 1000)
	expect((await attempt(wrong)).status).toBe(401)
	expect((await attempt(adaPassword)).headers.get('retry-after')).toBe('2')
	// Another address is not locked; its success resets the account counter.
	expect((await attempt(adaPassword, '203.0.113.9')).status).toBe(200)
	vi.setSystemTime(Date.now() + 2000)
	expect((await attempt(adaPassword)).status).toBe(200)

	await t.afterCommit()
	expect(
		securityLog.filter(({ event }) => event !== 'login-failed'),
	).toMatchObject([
		{ event: 'sign-up', address: '198.51.100.7' },
		{ event: 'login-locked', address: '198.51.100.7' },
		{ event: 'login-locked', address: '198.51.100.7' },
		{ event: 'login', address: '203.0.113.9' },
		{ event: 'login', address: '198.51.100.7' },
	])
	expect(securityLog).toContainEqual({
		address: '198.51.100.7',
		event: 'login-failed',
		identifier: 'ada@example.com',
	})
})

it('clears the login counters with a password reset', async () => {
	await using t = await testApplication(ultimabase)
	const client = { ...json, 'x-forwarded-for': '198.51.100.7' }
	const send = (path: string, body: unknown) =>
		t.fetch(path, {
			body: JSON.stringify(body),
			headers: client,
			method: 'POST',
		})
	await send('/api/auth/sign-up', { ...ada, displayName: 'Ada' })
	for (let failure = 1; failure <= 6; failure += 1) {
		await send('/api/auth/login', { ...ada, password: 'wrong horse battery' })
	}
	expect((await send('/api/auth/login', ada)).status).toBe(429)

	expect(
		await (
			await send('/api/auth/request-password-reset', { email: ada.email })
		).json(),
	).toStrictEqual({ result: { accepted: true } })
	await t.afterCommit()
	const reset = await send('/api/auth/reset-password', {
		newPassword,
		token: tokenSentTo(ada.email, 'Reset your password'),
	})
	expect(await reset.json()).toStrictEqual({ result: { reset: true } })
	// No waiting: the reset cleared the lock.
	const login = await send('/api/auth/login', { ...ada, password: newPassword })
	expect(login.status).toBe(200)
})

it('keeps browser sessions in a secure cookie', async () => {
	await using t = await testApplication(ultimabase)
	const browser = { ...json, origin: 'https://notes.example.com' }
	const signUp = await t.fetch('/api/auth/sign-up', {
		body: JSON.stringify({ ...ada, displayName: 'Ada' }),
		headers: browser,
		method: 'POST',
	})

	// The browser receives an HttpOnly cookie, never the token.
	const cookie = signUp.headers.get('set-cookie') ?? ''
	expect(cookie).toMatch(
		/^__Host-notes-session=ub_s1\.[^;]+; Path=\/; Expires=[^;]+; HttpOnly; Secure; SameSite=Lax$/u,
	)
	expect(await signUp.json()).not.toHaveProperty('result.session.token')
	const session = cookie.split(';')[0] ?? ''
	const current = await t.fetch('/api/auth/current', {
		headers: { ...browser, cookie: session },
		method: 'POST',
	})
	expect(current.status).toBe(200)
	// Another origin, or a Bearer beside the cookie, is refused.
	const rejected = { error: { code: 'HTTP_APPLICATION_REJECTED' } }
	const elsewhere = await t.fetch('/api/auth/current', {
		headers: { ...browser, cookie: session, origin: 'https://evil.example' },
		method: 'POST',
	})
	expect(elsewhere.status).toBe(401)
	expect(await elsewhere.json()).toMatchObject(rejected)
	const token = await sessionTokenOf(
		await t.fetch('/api/auth/login', {
			body: JSON.stringify(ada),
			headers: json,
			method: 'POST',
		}),
	)
	const both = await t.fetch('/api/auth/current', {
		headers: { ...browser, authorization: `Bearer ${token}`, cookie: session },
		method: 'POST',
	})
	expect(both.status).toBe(401)
	expect(await both.json()).toMatchObject(rejected)
	// Logging out ends the session and clears the cookie.
	const logout = await t.fetch('/api/auth/logout', {
		headers: { ...browser, cookie: session },
		method: 'POST',
	})
	expect(logout.status).toBe(200)
	expect(logout.headers.get('set-cookie')).toMatch(/^__Host-notes-session=;/u)
})
