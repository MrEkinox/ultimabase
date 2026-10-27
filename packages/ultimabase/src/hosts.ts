// Which hosts are this machine's own, for the checks that trust them.

/** A host only this machine reaches (D-66, D-105, D-115). */
export function isLocalHost(hostname: string): boolean {
	return (
		hostname === 'localhost' ||
		hostname.endsWith('.localhost') ||
		hostname === '127.0.0.1' ||
		hostname === '[::1]'
	)
}
