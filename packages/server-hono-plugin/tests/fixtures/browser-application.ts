import {
	UltimaBase,
	MasterAuthority,
	definePlugin,
	getCurrentRequest,
	requireCapability,
} from '@ultimabase/core'
import {
	httpApplicationCapability,
	httpPlugin,
	httpMount,
	httpContextResolver,
	provideHttpEndpoints,
	provideHttpContextResolvers,
	type HttpApplication,
	type HttpBrowserPolicy,
} from '@ultimabase/http-plugin'
import { databasePlugin } from '../../../../tests/fixtures/graphql-explorer.js'

export interface BrowserBoundaryObservations {
	applicationEffects: number
	preflights: number
}

/** Exercises real HTTP identity, credential privacy and authority in the browser suite. */
export const createBrowserApplication = async (
	observations: BrowserBoundaryObservations,
	policy: HttpBrowserPolicy = { enabled: false },
) => {
	let http: HttpApplication | undefined
	let authorization: string | null = null
	let cookie: string | null = null
	const requirement = requireCapability(httpApplicationCapability, '^1.0.0', {
		phase: 'setup',
	})
	const application = new UltimaBase({
		schemas: [],
		pluginPrivileges: { logger: false },
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'browser', value: 'master-secret' }],
			onUse: () => undefined,
		}),
		plugins: [
			databasePlugin(),
			httpPlugin({
				appId: 'browser',
				master: { enabled: true },
				...(policy.enabled
					? {
							browser: {
								allowedOrigins: policy.allowedOrigins,
								allowedMethods: policy.allowedMethods,
								allowedHeaders: policy.allowedHeaders,
								credentials: policy.credentials,
								maxAgeSeconds: policy.maxAgeSeconds,
							},
						}
					: {}),
			}),
			definePlugin({
				pluginId: 'fixture.browser',
				version: '1.0.0',
				core: '^0.0.0',
				privileges: [
					{
						name: 'transport:expose',
						reason: 'Expose browser fixture responses.',
					},
				],
				capabilities: [
					provideHttpContextResolvers({
						contributionId: 'credentials',
						create: () =>
							httpContextResolver({
								resolve: ({ context, request }) => {
									authorization = request.headers.get('Authorization')
									cookie = request.headers.get('Cookie')
									return context
								},
							}),
					}),
					provideHttpEndpoints({
						contributionId: 'routes',
						create: () =>
							httpMount({
								path: '/',
								protocol: { name: 'fixture.browser', version: '1' },
								handle: (request) => {
									observations.applicationEffects += 1
									return Response.json({
										applicationEffects: observations.applicationEffects,
										authorization,
										cookie,
										mode: getCurrentRequest().access.mode,
										master: request.headers.get('X-UltimaBase-Master-Key'),
										preflights: observations.preflights,
									})
								},
							}),
					}),
					requirement,
				],
				setup: ({ capabilities }) => {
					http = capabilities.get(requirement)
				},
			}),
		],
	})
	try {
		await application.start()
	} catch (error: unknown) {
		await application.dispose()
		throw error
	}
	if (http === undefined) {
		await application.dispose()
		throw new TypeError('Missing HTTP application')
	}
	return { http, dispose: () => application.dispose() }
}
