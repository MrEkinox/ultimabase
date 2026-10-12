import { describe, expect, it } from 'vitest'

import { createApolloSandboxPageResponse } from './apollo-sandbox-page.js'
import { graphiqlImports, graphiqlIntegrity } from './graphiql-assets.js'
import { createGraphiqlPageResponse } from './graphiql-page.js'

const readImportMap = (html: string): unknown => {
	const json = /<script type="importmap" nonce="[^"]+">(.*?)<\/script>/su.exec(
		html,
	)?.[1]
	if (json === undefined) throw new TypeError('Missing GraphiQL import map')
	return JSON.parse(json)
}

describe('GraphiQL page', () => {
	it('pins assets and sends the application header only from a prefixed URL', async () => {
		const response = createGraphiqlPageResponse('/api/graphql')
		const html = await response.text()

		expect(html).toContain('graphiql@5.2.4')
		expect(html).not.toContain('@latest')
		expect(html).toContain('const endpoint="/api/graphql"')
		expect(html).toContain('"X-UltimaBase-Application-Id"')
		expect(html).toContain('const prefix="/__ultimabase/apps/"')
		expect(html).toContain('appId===undefined?{}:')
		expect(html).toContain("credentials:'same-origin'")
		expect(response.headers.get('Content-Security-Policy')).toContain(
			"frame-ancestors 'none'",
		)
		expect(response.headers.get('Content-Security-Policy')).not.toContain(
			"'unsafe-inline'",
		)
		expect(html).toMatch(/<style nonce="[^"]+">/u)
		expect(response.headers.get('X-Frame-Options')).toBe('DENY')
	})

	it('gives every pinned module an integrity hash (ADR-0325)', async () => {
		const html = await createGraphiqlPageResponse('/graphql').text()
		const map = readImportMap(html)

		expect(map).toStrictEqual({
			imports: graphiqlImports,
			integrity: graphiqlIntegrity,
		})
		for (const url of Object.values(graphiqlImports)) {
			if (url.startsWith('data:')) continue
			expect(graphiqlIntegrity[url]).toMatch(/^sha384-[A-Za-z0-9+/]{64}$/u)
		}
		for (const url of Object.keys(graphiqlIntegrity)) {
			// Every hashed module is a pinned esm.sh build, never a version range.
			expect(url).toMatch(/^https:\/\/esm\.sh\/(?:node\/|@?[\w./-]+@\d)/u)
			expect(url).not.toMatch(/@[\^~>]|%5E|%3E/u)
		}
	})

	it('escapes a path before placing it in executable HTML', async () => {
		const response = createGraphiqlPageResponse('/</script><script>alert(1)')
		const html = await response.text()

		expect(html).not.toContain('</script><script>alert(1)')
		expect(html).toContain('\\u003c/script\\u003e')
	})
})

describe('Apollo Sandbox page', () => {
	it('fixes the endpoint and sends the application header only from a prefixed URL', async () => {
		const response = createApolloSandboxPageResponse('/api/graphql')
		const html = await response.text()

		expect(html).toContain(
			'https://embeddable-sandbox.cdn.apollographql.com/v2/embeddable-sandbox.umd.production.min.js',
		)
		expect(html).toContain('const endpoint="/api/graphql"')
		expect(html).toContain('endpointIsEditable:false')
		expect(html).toContain('hideCookieToggle:true')
		expect(html).toContain('appId===undefined?{}:')
		expect(response.headers.get('Content-Security-Policy')).toContain(
			'frame-src https://sandbox.embed.apollographql.com',
		)
		expect(response.headers.get('X-Frame-Options')).toBe('DENY')
	})
})
