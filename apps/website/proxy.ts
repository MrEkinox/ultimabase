import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { i18n } from './lib/i18n'

const rewriteHeader = 'x-ultimabase-locale-rewrite'

export default function proxy(request: NextRequest) {
	if (request.headers.get(rewriteHeader) === i18n.defaultLanguage) {
		return NextResponse.next()
	}

	const { pathname } = request.nextUrl
	if (pathname === '/fr' || pathname.startsWith('/fr/')) {
		return NextResponse.next()
	}

	if (pathname === '/en' || pathname.startsWith('/en/')) {
		const canonicalUrl = request.nextUrl.clone()
		canonicalUrl.pathname = pathname.slice('/en'.length) || '/'
		return NextResponse.redirect(canonicalUrl)
	}

	const internalUrl = request.nextUrl.clone()
	internalUrl.pathname = `/en${pathname === '/' ? '' : pathname}`
	const requestHeaders = new Headers(request.headers)
	requestHeaders.set(rewriteHeader, i18n.defaultLanguage)

	return NextResponse.rewrite(internalUrl, {
		request: { headers: requestHeaders },
	})
}

export const config = {
	matcher: [
		'/((?!api|_next/static|_next/image|icon|favicon.ico|robots.txt|sitemap.xml).*)',
	],
}
