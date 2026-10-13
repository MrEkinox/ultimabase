import { createMDX } from 'fumadocs-mdx/next'

const withMDX = createMDX()

export default withMDX({
	// The localhost dev server must also accept its exact LAN preview hostname.
	allowedDevOrigins: ['192.168.1.135'],
	experimental: {
		globalNotFound: true,
	},
	reactStrictMode: true,
	// Twoslash runs the TypeScript compiler while pages are rendered.
	serverExternalPackages: ['typescript', 'twoslash'],
	async rewrites() {
		return [
			{
				source: '/docs/:slug*.md',
				destination: '/llms.mdx/docs/:slug*/content.md',
			},
		]
	},
})
