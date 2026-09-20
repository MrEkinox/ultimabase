import { serve } from '@hono/node-server'
import { createServer } from 'node:http'
import { afterEach, expect, it, vi } from 'vitest'
import type { HttpApplication } from '@ultimabase/http-plugin'
import { HonoServerProvider } from './provider.js'

vi.mock('@hono/node-server', () => ({ serve: vi.fn() }))
afterEach(() => vi.restoreAllMocks())

// A listener whose cleanup failed remains owned, even if startup never completed.
it('retains failed-startup resources until exact-owner disposal succeeds', async () => {
	const listener = createServer()
	Object.defineProperty(listener, 'listening', {
		configurable: true,
		value: true,
	})
	const cleanupError = new Error('cleanup failed')
	const startupError = new Error('startup failed')
	const close = vi.spyOn(listener, 'close').mockImplementation((callback) => {
		callback?.(cleanupError)
		return listener
	})
	vi.mocked(serve).mockImplementation(() => {
		queueMicrotask(() => listener.emit('error', startupError))
		return listener
	})
	const provider = new HonoServerProvider({
		app: undefined,
		host: undefined,
		port: 0,
	})
	const first: HttpApplication = {
		appId: 'first',
		authority: { master: { enabled: false } },
		protocolVersion: '1.0.0',
		originalHeaderMode: 'ordered-pairs',
		requestTimeoutMs: undefined,
		routeGraph: {
			browserBootstraps: [],
			endpoints: [],
			mounts: [],
			routes: [],
		},
		fetch: () => Promise.resolve(new Response()),
	}
	const replacement: HttpApplication = { ...first, appId: 'replacement' }
	await expect(provider.start(first)).rejects.toMatchObject({
		errors: [startupError, cleanupError],
	})
	await expect(provider.start(replacement)).rejects.toThrow(
		'already owns an application',
	)
	await provider.dispose(replacement)
	expect(close).toHaveBeenCalledTimes(1)
	await expect(provider.dispose(first)).rejects.toBe(cleanupError)
	await expect(provider.start(replacement)).rejects.toThrow(
		'already owns an application',
	)
	close.mockImplementation((callback) => {
		callback?.()
		return listener
	})
	await provider.dispose(first)
	expect(close).toHaveBeenCalledTimes(3)
})
