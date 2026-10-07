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
	type PluginOperationDefinition,
	type PluginOperationInput,
} from '@ultimabase/core'
import {
	httpRoute,
	provideHttpEndpoints,
	type HttpEndpointDefinition,
} from '@ultimabase/http-plugin'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { ResolvedPasswordAuthCookieOptions } from './http-options.js'
import { passwordAuthCookiePaths } from './http-session-resolver.js'
import {
	passwordAuthErrorCodes,
	passwordAuthOperations,
	rejectPasswordChange,
	rejectPasswordCredentials,
	rejectPasswordSignUp,
} from './operations.js'
import type {
	PasswordAuthenticationResult,
	PasswordChangeResult,
	PasswordLogoutResult,
} from './session.js'

const passwordAuthHttpProtocol = defineOperationTransport({
	name: 'ultimabase.password-auth.http-cookie',
	version: '1.0.0',
})
const passwordAuthHttpEndpointProtocol = immutableRecord({
	name: passwordAuthHttpProtocol.name,
	version: passwordAuthHttpProtocol.version,
})

const createHttpBinding = <TOperation extends PluginOperationDefinition>(
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

const operationBindings = [
	['change-password', createHttpBinding(passwordAuthOperations.changePassword)],
	['login', createHttpBinding(passwordAuthOperations.login)],
	['logout', createHttpBinding(passwordAuthOperations.logout)],
	[
		'logout-everywhere',
		createHttpBinding(passwordAuthOperations.logoutEverywhere),
	],
	['refresh', createHttpBinding(passwordAuthOperations.refresh)],
	['sign-up', createHttpBinding(passwordAuthOperations.signUp)],
] as const

const operationBindingContributions = operationBindings.map(([, binding]) =>
	contributeOperationBinding(binding),
)

interface PasswordHttpOperationExecutor {
	bind(transport: ApplicationOperationTransport): void
	execute(
		operation: PluginOperationDefinition,
		input: unknown,
	): Promise<unknown>
}

const createPasswordHttpOperationExecutor =
	(): PasswordHttpOperationExecutor => {
		let bound: ApplicationOperationTransport | undefined
		return {
			bind: (transport) => {
				if (bound !== undefined) {
					throw new TypeError(
						'Password Auth HTTP operation executor is already bound',
					)
				}
				bound = transport
			},
			execute: (operation, input) => {
				if (bound === undefined) {
					throw new TypeError(
						'Password Auth HTTP operation executor is unavailable',
					)
				}
				return bound.execute({
					context: getCurrentRequest(),
					input,
					operation: operation.name,
					version: operation.version,
				})
			},
		}
	}

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

const authenticationBody = (result: PasswordAuthenticationResult) =>
	immutableRecord({
		principal: immutableRecord({ user: result.principal.user.toJSON() }),
		session: immutableRecord({
			absoluteExpiresAt: result.session.absoluteExpiresAt,
			expiresAt: result.session.expiresAt,
			id: result.session.id,
		}),
	})

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

const readAuthenticationInput = async (
	request: Request,
	operation:
		| typeof passwordAuthOperations.login
		| typeof passwordAuthOperations.signUp
		| typeof passwordAuthOperations.refresh,
): Promise<unknown> => {
	// Refresh consumes the resolved session and never reads a request body.
	if (operation === passwordAuthOperations.refresh) return null
	try {
		return operation.input.snapshot(
			await request.json(),
			`${operation.name}.http-input`,
		)
	} catch {
		return operation === passwordAuthOperations.login
			? rejectPasswordCredentials()
			: rejectPasswordSignUp()
	}
}

/** Keeps the cookie protocol and safe failure envelope identical for every route. */
const cookieRoute = (
	path: string,
	handle: (request: Request) => Promise<Response>,
): HttpEndpointDefinition =>
	httpRoute({
		handle: async (request) => {
			try {
				return await handle(request)
			} catch (error: unknown) {
				return errorResponse(error)
			}
		},
		method: 'POST',
		path,
		protocol: passwordAuthHttpEndpointProtocol,
	})

const authenticationRoute = (
	path: string,
	operation:
		| typeof passwordAuthOperations.login
		| typeof passwordAuthOperations.signUp
		| typeof passwordAuthOperations.refresh,
	executor: PasswordHttpOperationExecutor,
	cookie: ResolvedPasswordAuthCookieOptions,
): HttpEndpointDefinition =>
	cookieRoute(path, async (request) => {
		const input = await readAuthenticationInput(request, operation)
		const result = operation.result.snapshot(
			await executor.execute(operation, input),
			`${operation.name}.http-result`,
		)
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
	})

const changePasswordRoute = (
	executor: PasswordHttpOperationExecutor,
): HttpEndpointDefinition =>
	cookieRoute(passwordAuthCookiePaths.changePassword, async (request) => {
		const operation = passwordAuthOperations.changePassword
		let input: unknown
		try {
			input = operation.input.snapshot(
				await request.json(),
				`${operation.name}.http-input`,
			)
		} catch {
			return rejectPasswordChange()
		}
		const result: PasswordChangeResult = operation.result.snapshot(
			await executor.execute(operation, input),
			`${operation.name}.http-result`,
		)
		return Response.json({ result })
	})

const logoutRoute = (
	operation:
		| typeof passwordAuthOperations.logout
		| typeof passwordAuthOperations.logoutEverywhere,
	path:
		| typeof passwordAuthCookiePaths.logout
		| typeof passwordAuthCookiePaths.logoutEverywhere,
	executor: PasswordHttpOperationExecutor,
	cookie: ResolvedPasswordAuthCookieOptions,
): HttpEndpointDefinition =>
	cookieRoute(path, async () => {
		const result: PasswordLogoutResult = operation.result.snapshot(
			await executor.execute(operation, null),
			`${operation.name}.http-result`,
		)
		return Response.json(
			{ result },
			{ headers: { 'Set-Cookie': serializeExpiredCookie(cookie) } },
		)
	})

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
	const executor = createPasswordHttpOperationExecutor()
	const endpointProvider = provideHttpEndpoints({
		contributionId: 'password-cookie-routes',
		create: () =>
			immutableArray([
				authenticationRoute(
					passwordAuthCookiePaths.signUp,
					passwordAuthOperations.signUp,
					executor,
					cookie,
				),
				changePasswordRoute(executor),
				authenticationRoute(
					passwordAuthCookiePaths.login,
					passwordAuthOperations.login,
					executor,
					cookie,
				),
				logoutRoute(
					passwordAuthOperations.logout,
					passwordAuthCookiePaths.logout,
					executor,
					cookie,
				),
				logoutRoute(
					passwordAuthOperations.logoutEverywhere,
					passwordAuthCookiePaths.logoutEverywhere,
					executor,
					cookie,
				),
				authenticationRoute(
					passwordAuthCookiePaths.refresh,
					passwordAuthOperations.refresh,
					executor,
					cookie,
				),
			]),
	})
	return immutableRecord({
		capabilities: immutableArray([endpointProvider]),
		operations: immutableArray(operationBindingContributions),
		start: (requestExecutor) => {
			executor.bind(
				requestExecutor.exposeOperations({
					operations: Object.values(passwordAuthOperations),
					transport: passwordAuthHttpProtocol,
				}),
			)
		},
	})
}
