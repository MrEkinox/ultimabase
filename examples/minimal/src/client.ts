export interface MinimalRestClientOptions {
	readonly applicationId?: string
	readonly baseUrl?: string
	/** Trusted integration tests only; never compile a Master key into a browser. */
	readonly masterKey?: string
}

/** Creates a small Fetch client that injects the canonical application pair. */
export const createMinimalRestClient = ({
	applicationId = 'minimal-rest',
	baseUrl = 'http://127.0.0.1:1337',
	masterKey,
}: MinimalRestClientOptions) => ({
	fetch: (path: string, init: RequestInit = {}): Promise<Response> => {
		const headers = new Headers(init.headers)
		headers.set('X-UltimaBase-Application-Id', applicationId)
		if (masterKey !== undefined) {
			headers.set('X-UltimaBase-Master-Key', masterKey)
		}
		return fetch(new URL(path, baseUrl), { ...init, headers })
	},
})
