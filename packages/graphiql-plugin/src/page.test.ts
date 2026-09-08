import { describe, expect, it } from 'vitest'

import { createGraphiqlPageResponse } from './page.js'

describe('GraphiQL page', () => {
	it('pins assets and binds every request to the URL-selected application', async () => {
		const response = createGraphiqlPageResponse('/api/graphql')
		const html = await response.text()

		expect(html).toContain('graphiql@5.2.4')
		expect(html).not.toContain('@latest')
		expect(html).toContain('const endpoint="/api/graphql"')
		expect(html).toContain('X-UltimaBase-Application-Id')
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

	it('escapes a path before placing it in executable HTML', async () => {
		const response = createGraphiqlPageResponse('/</script><script>alert(1)')
		const html = await response.text()

		expect(html).not.toContain('</script><script>alert(1)')
		expect(html).toContain('\\u003c/script\\u003e')
	})
})
