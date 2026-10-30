// A version as a URL names it, readable in the browser, where the source is
// not: `/docs/next/…` and `/docs/<version>/…` name theirs, any other page
// reads the latest one.
const named = /^(?:next|\d+\.\d+)$/u

/** The search tag of the version a path reads. */
export function versionAt(pathname: string): string {
	const [, docs, version = ''] = pathname.split('/')
	return docs === 'docs' && named.test(version) ? version : 'latest'
}
