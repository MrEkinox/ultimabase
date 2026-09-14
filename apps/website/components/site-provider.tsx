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
import type { ComponentProps } from 'react'

/** Avoids invalid segment-prefetch requests across the canonical locale rewrite. */
function FrameworkLink({ href, ...props }: ComponentProps<'a'>) {
	if (href === undefined) return <a {...props} />
	const linkProps = props as Omit<ComponentProps<typeof NextLink>, 'href'>
	return <NextLink {...linkProps} href={href} prefetch={false} />
}

const frameworkLink = FrameworkLink as NonNullable<Framework['Link']>

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
			Link={frameworkLink}
			useParams={useParams}
			usePathname={useCanonicalPathname}
			useRouter={useRouter}
		>
			<BaseRootProvider {...props} />
		</FrameworkProvider>
	)
}
