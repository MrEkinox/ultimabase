//#region partner-credentials
import { createHash, timingSafeEqual } from 'node:crypto'

import { RequestContextValue, plugin } from '@ultimabase/core/plugin'
import {
	httpContextResolver,
	provideHttpContextResolvers,
} from '@ultimabase/http-plugin'

/** The partner a request authenticated as, read by route handlers. */
export const partner = new RequestContextValue<Readonly<{ name: string }>>(
	'example.partner',
	(value) => {
		const name: unknown =
			typeof value === 'object' && value !== null
				? Reflect.get(value, 'name')
				: undefined
		if (typeof name !== 'string') throw new TypeError('Partner needs a name')
		return Object.freeze({ name })
	},
)

const digest = (token: string): Buffer =>
	createHash('sha256').update(token).digest()

/**
 * Signs partner integrations in with `Authorization: Bearer <token>`. A
 * request without the header stays anonymous; an unknown token is refused
 * with `HTTP_APPLICATION_REJECTED` before any route runs.
 */
export const partnerCredentials = (
	tokens: Readonly<Record<string, string>>,
) => {
	const partners = Object.entries(tokens).map(([name, token]) => ({
		name,
		digest: digest(token),
	}))
	return plugin({
		id: 'example.partner-credentials',
		version: '1.0.0',
		core: '^0.0.0',
		contributions: [
			provideHttpContextResolvers({
				contributionId: 'partner-bearer',
				create: () =>
					httpContextResolver({
						// Checked once, before the application serves a request.
						validateBrowserPolicy: (policy) => {
							if (policy.enabled && policy.origins === '*') {
								throw new TypeError('Partner tokens need exact browser origins')
							}
						},
						resolve: ({ context, request }) => {
							const header = request.headers.get('Authorization')
							if (header === null) return context
							const presented = digest(header.replace(/^Bearer /u, ''))
							const match = partners.find((candidate) =>
								timingSafeEqual(candidate.digest, presented),
							)
							if (match === undefined) throw new TypeError('Unknown partner')
							return context.withValue(partner, { name: match.name })
						},
					}),
			}),
		],
	})
}
//#endregion partner-credentials
