export interface MinimalClientOptions {
	readonly applicationId?: string
	readonly baseUrl?: string
	/** Trusted integration tests only; never compile a Master key into a browser. */
	readonly masterKey?: string
	/** Opaque authentication session sent through the standard Bearer scheme. */
	readonly sessionToken?: string
}

/** Creates a Fetch client shared by the example's REST and GraphQL routes. */
export const createMinimalClient = ({
	applicationId = 'minimal',
	baseUrl = 'http://127.0.0.1:1337',
	masterKey,
	sessionToken,
}: MinimalClientOptions) => ({
	fetch: (path: string, init: RequestInit = {}): Promise<Response> => {
		const headers = new Headers(init.headers)
		headers.set('X-UltimaBase-Application-Id', applicationId)
		if (masterKey !== undefined) {
			headers.set('X-UltimaBase-Master-Key', masterKey)
		}
		if (sessionToken !== undefined) {
			headers.set('Authorization', `Bearer ${sessionToken}`)
		}
		return fetch(new URL(path, baseUrl), { ...init, headers })
	},
})
