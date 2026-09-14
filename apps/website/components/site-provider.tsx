'use client'

import { FrameworkProvider, type Framework } from 'fumadocs-core/framework'
import {
	RootProvider as BaseRootProvider,
	type RootProviderProps,
} from 'fumadocs-ui/provider/base'
import NextLink from 'next/link'
import {
	useParams,
	usePathname as useNextPathname,
	useRouter,
} from 'next/navigation'

// Both libraries target anchor props; this adapter bridges their optional-prop variance.
const FrameworkLink = NextLink as NonNullable<Framework['Link']>

/** Keeps Fumadocs route state stable across the canonical English rewrite. */
function useCanonicalPathname(): string {
	const pathname = useNextPathname()
	if (pathname === '/en') return '/'
	if (pathname.startsWith('/en/')) return pathname.slice('/en'.length)
	return pathname
}

/** Provides Fumadocs with the public URL rather than Next's internal locale URL. */
export function SiteProvider(props: RootProviderProps) {
	return (
		<FrameworkProvider
			Link={FrameworkLink}
			useParams={useParams}
			usePathname={useCanonicalPathname}
			useRouter={useRouter}
		>
			<BaseRootProvider {...props} />
		</FrameworkProvider>
	)
}
