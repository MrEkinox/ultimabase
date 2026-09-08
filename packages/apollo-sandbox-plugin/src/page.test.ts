import { describe, expect, it } from 'vitest'

import { createApolloSandboxPageResponse } from './page.js'

describe('Apollo Sandbox page', () => {
	it('uses the supported v2 asset and fixes every request to one endpoint', async () => {
		const response = createApolloSandboxPageResponse('/api/graphql')
		const html = await response.text()

		expect(html).toContain(
			'https://embeddable-sandbox.cdn.apollographql.com/v2/',
		)
		expect(html).not.toContain('/_latest/')
		expect(html).toContain('endpointIsEditable:false')
		expect(html).toContain('hideCookieToggle:true')
		expect(html).toContain('handleRequest:(_url,options)')
		expect(html).toContain('X-UltimaBase-Application-Id')
		expect(response.headers.get('Content-Security-Policy')).toContain(
			'frame-src https://sandbox.embed.apollographql.com',
		)
		expect(response.headers.get('X-Frame-Options')).toBe('DENY')
	})

	it('escapes a path before placing it in executable HTML', async () => {
		const response = createApolloSandboxPageResponse(
			'/</script><script>alert(1)',
		)
		const html = await response.text()

		expect(html).not.toContain('</script><script>alert(1)')
		expect(html).toContain('\\u003c/script\\u003e')
	})
})
