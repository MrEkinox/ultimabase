import { createMDX } from 'fumadocs-mdx/next'
import type { NextConfig } from 'next'

const config: NextConfig = {
	output: 'export',
	// Each page is `<path>/index.html`, which every static host serves.
	trailingSlash: true,
	reactStrictMode: true,
	// `yarn typecheck` checks the site; Next's own check needs TypeScript's
	// former API.
	typescript: { ignoreBuildErrors: true },
}

export default createMDX()(config)
