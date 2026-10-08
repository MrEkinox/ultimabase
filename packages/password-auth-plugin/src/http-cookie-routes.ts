import {
	PluginError,
	contributeOperationBinding,
	defineOperationTransport,
	getCurrentRequest,
	operationTransportBinding,
	operationWireCodec,
	type ApplicationOperationTransport,
	type ApplicationRequestExecutor,
	type CapabilityProviderDeclaration,
	type PluginOperationBindingContribution,
	type PluginOperationInput,
} from '@ultimabase/core'
import {
	httpRoute,
	provideHttpEndpoints,
	type HttpEndpointDefinition,
} from '@ultimabase/http-plugin'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import { readPasswordAuthJsonBody } from './http-json-body.js'
import type { ResolvedPasswordAuthCookieOptions } from './http-options.js'
import { passwordAuthCookiePaths } from './http-session-resolver.js'
import {
	passwordAuthErrorCodes,
	passwordAuthOperations,
	rejectPasswordChange,
	rejectPasswordCredentials,
	rejectPasswordSignUp,
} from './operations.js'
import type { PasswordAuthenticationResult } from './session.js'

type PasswordAuthOperationKey = keyof typeof passwordAuthOperations
type PasswordAuthOperation =
	(typeof passwordAuthOperations)[PasswordAuthOperationKey]

const passwordAuthHttpProtocol = defineOperationTransport({
	name: 'ultimabase.password-auth.http-cookie',
	version: '1.0.0',
})
const passwordAuthHttpEndpointProtocol = immutableRecord({
	name: passwordAuthHttpProtocol.name,
	version: passwordAuthHttpProtocol.version,
})

const createHttpBinding = <TOperation extends PasswordAuthOperation>(
	operation: TOperation,
) =>
	operationTransportBinding({
		codec: operationWireCodec({
			decode: (value) =>
				operation.input.snapshot(
					value,
					'password-http.input',
				) as PluginOperationInput<TOperation>,
			encode: (value) => value,
			operation,
			transport: passwordAuthHttpProtocol,
		}),
		metadata: immutableRecord({}),
		operation,
	})

// Bound in the same order as the operation record: change-password through sign-up.
const operationBindingContributions = Object.values(passwordAuthOperations).map(
	(operation) => contributeOperationBinding(createHttpBinding(operation)),
)

// Only routes that accept a JSON body map malformed or oversized input to a
// public failure; refresh and both logouts consume the resolved session and
// never read a body.
const bodyRejections = new Map<PasswordAuthOperation, () => never>([
	[passwordAuthOperations.changePassword, rejectPasswordChange],
	[passwordAuthOperations.login, rejectPasswordCredentials],
	[passwordAuthOperations.signUp, rejectPasswordSignUp],
])

const sameSiteAttributes = immutableRecord({
	lax: 'Lax',
	none: 'None',
	strict: 'Strict',
} as const)

const serializeSessionCookie = (
	options: ResolvedPasswordAuthCookieOptions,
	token: string,
	expiresAt: string,
): string =>
	`${options.name}=${token}; Path=/; Expires=${new Date(expiresAt).toUTCString()}; HttpOnly; Secure; SameSite=${sameSiteAttributes[options.sameSite]}`

const serializeExpiredCookie = (
	options: ResolvedPasswordAuthCookieOptions,
): string =>
	`${options.name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; Secure; SameSite=${sameSiteAttributes[options.sameSite]}`

// The raw token travels only in the cookie, never in the JSON body.
const authenticationBody = (result: PasswordAuthenticationResult) =>
	immutableRecord({
		principal: immutableRecord({ user: result.principal.user.toJSON() }),
		session: immutableRecord({
			absoluteExpiresAt: result.session.absoluteExpiresAt,
			expiresAt: result.session.expiresAt,
			id: result.session.id,
		}),
	})

/** Maps the four declared failures to their status and hides every other error. */
const errorResponse = (error: unknown): Response => {
	const requestId = getCurrentRequest().requestId
	if (error instanceof PluginError) {
		switch (error.code) {
			case passwordAuthErrorCodes.invalidCredentials:
			case passwordAuthErrorCodes.invalidSession:
				return Response.json(
					{ error: { ...error.toJSON(), requestId } },
					{ status: 401 },
				)
			case passwordAuthErrorCodes.signUpRejected:
			case passwordAuthErrorCodes.passwordChangeRejected:
				return Response.json(
					{ error: { ...error.toJSON(), requestId } },
					{ status: 400 },
				)
		}
	}
	return Response.json(
		{
			error: {
				code: 'PASSWORD_AUTH_INTERNAL_ERROR',
				message: 'The Password Auth request could not be completed.',
				requestId,
				retryable: false,
			},
		},
		{ status: 500 },
	)
}

const readInput = async (
	request: Request,
	operation: PasswordAuthOperation,
): Promise<unknown> => {
	const reject = bodyRejections.get(operation)
	if (reject === undefined) return null
	try {
		return operation.input.snapshot(
			await readPasswordAuthJsonBody(request),
			`${operation.name}.http-input`,
		)
	} catch {
		return reject()
	}
}

/** Snapshots one operation result and sets or expires the session cookie. */
const respond = (
	operation: PasswordAuthOperation,
	value: unknown,
	cookie: ResolvedPasswordAuthCookieOptions,
): Response => {
	const path = `${operation.name}.http-result`
	switch (operation.name) {
		case 'ultimabase.password-auth.sign-up':
		case 'ultimabase.password-auth.login':
		case 'ultimabase.password-auth.refresh': {
			const result = operation.result.snapshot(value, path)
			return Response.json(
				{ result: authenticationBody(result) },
				{
					headers: {
						'Set-Cookie': serializeSessionCookie(
							cookie,
							result.session.token,
							result.session.expiresAt,
						),
					},
				},
			)
		}
		// Password change keeps the current session, so its cookie stays unchanged.
		case 'ultimabase.password-auth.change-password':
			return Response.json({ result: operation.result.snapshot(value, path) })
		case 'ultimabase.password-auth.logout':
		case 'ultimabase.password-auth.logout-everywhere':
			return Response.json(
				{ result: operation.result.snapshot(value, path) },
				{ headers: { 'Set-Cookie': serializeExpiredCookie(cookie) } },
			)
	}
}

/** Carries conditional declarations plus their one-time lifecycle binding. */
export interface PasswordHttpCookieIntegration {
	readonly capabilities: readonly CapabilityProviderDeclaration[]
	readonly operations: readonly PluginOperationBindingContribution[]
	start(executor: ApplicationRequestExecutor): void
}

/** Builds the cookie routes without duplicating credential operation logic. */
export const createPasswordHttpCookieIntegration = (
	cookie: ResolvedPasswordAuthCookieOptions,
): PasswordHttpCookieIntegration => {
	let transport: ApplicationOperationTransport | undefined
	const execute = (operation: PasswordAuthOperation, input: unknown) => {
		if (transport === undefined) {
			throw new TypeError(
				'Password Auth HTTP operation executor is unavailable',
			)
		}
		return transport.execute({
			context: getCurrentRequest(),
			input,
			operation: operation.name,
			version: operation.version,
		})
	}
	// Every route shares the same safe failure envelope.
	const route = (key: PasswordAuthOperationKey): HttpEndpointDefinition => {
		const operation = passwordAuthOperations[key]
		return httpRoute({
			handle: async (request) => {
				try {
					const input = await readInput(request, operation)
					return respond(operation, await execute(operation, input), cookie)
				} catch (error: unknown) {
					return errorResponse(error)
				}
			},
			method: 'POST',
			path: passwordAuthCookiePaths[key],
			protocol: passwordAuthHttpEndpointProtocol,
		})
	}
	const endpointProvider = provideHttpEndpoints({
		contributionId: 'password-cookie-routes',
		create: () =>
			immutableArray([
				route('signUp'),
				route('changePassword'),
				route('login'),
				route('logout'),
				route('logoutEverywhere'),
				route('refresh'),
			]),
	})
	return immutableRecord({
		capabilities: immutableArray([endpointProvider]),
		operations: immutableArray(operationBindingContributions),
		start: (requestExecutor) => {
			const exposed = requestExecutor.exposeOperations({
				operations: Object.values(passwordAuthOperations),
				transport: passwordAuthHttpProtocol,
			})
			if (transport !== undefined) {
				throw new TypeError(
					'Password Auth HTTP operation executor is already bound',
				)
			}
			transport = exposed
		},
	})
}
