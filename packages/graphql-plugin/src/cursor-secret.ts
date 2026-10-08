import { createHash } from 'node:crypto'
import process from 'node:process'

/** Names the environment variable read when `cursorSecret` is omitted. */
export const graphqlCursorSecretVariable = 'ULTIMABASE_CURSOR_SECRET'

const minimumSecretLength = 32

/**
 * Derives the 32-byte cursor HMAC key. A stable secret keeps cursors valid
 * across restarts and between instances; without one, development uses a
 * random per-process key and production refuses to start. The plugin factory
 * reads the environment, never Core.
 */
export const resolveGraphqlCursorKey = (
	cursorSecret: unknown,
): Uint8Array | undefined => {
	const fromEnvironment = cursorSecret === undefined || cursorSecret === null
	const configured = fromEnvironment
		? process.env[graphqlCursorSecretVariable]
		: cursorSecret
	if (configured === undefined || configured === '') {
		if (process.env.NODE_ENV === 'production') {
			throw new TypeError(
				`GraphQL cursorSecret is required in production: set the cursorSecret option or ${graphqlCursorSecretVariable} so pagination cursors stay valid across restarts and instances`,
			)
		}
		return undefined
	}
	if (
		typeof configured !== 'string' ||
		configured.length < minimumSecretLength
	) {
		// Name the source the developer must fix, never the secret value itself.
		const source = fromEnvironment
			? graphqlCursorSecretVariable
			: 'GraphQL cursorSecret'
		throw new TypeError(
			`${source} must be a string of at least ${String(minimumSecretLength)} characters`,
		)
	}
	return createHash('sha256').update(configured, 'utf8').digest()
}
