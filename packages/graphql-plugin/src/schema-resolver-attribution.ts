import {
	getCurrentRequest,
	type ApplicationCallbackExecutor,
} from '@ultimabase/core'
import type {
	GraphQLFieldResolver,
	GraphQLIsTypeOfFn,
	GraphQLScalarInputLiteralCoercer,
	GraphQLScalarInputValueCoercer,
	GraphQLScalarOutputValueCoercer,
	GraphQLTypeResolver,
} from 'graphql'

import { createSafeGraphqlError } from './execution-errors.js'
import type { OwnedGraphqlSchema } from './schema-composition-types.js'

const runAttributed = <TResult>(
	callbacks: ApplicationCallbackExecutor,
	source: OwnedGraphqlSchema,
	callback: () => TResult,
): TResult =>
	source.attribution.kind === 'application'
		? callbacks.runApplication(callback)
		: source.attribution.kind === 'plugin'
			? callbacks.runPlugin(source.attribution.owner, callback)
			: callback()

const requestId = (context: unknown): string => {
	if (typeof context !== 'object' || context === null) return 'unavailable'
	const request: unknown = Reflect.get(context, 'request')
	if (typeof request !== 'object' || request === null) return 'unavailable'
	const value: unknown = Reflect.get(request, 'requestId')
	return typeof value === 'string' ? value : 'unavailable'
}

const currentRequestId = (): string => {
	try {
		return getCurrentRequest().requestId
	} catch {
		return 'unavailable'
	}
}

export const attributedFieldResolver = (
	resolver: GraphQLFieldResolver<unknown, unknown>,
	source: OwnedGraphqlSchema,
	callbacks: ApplicationCallbackExecutor,
): GraphQLFieldResolver<unknown, unknown> =>
	source.attribution.kind === 'generated'
		? resolver
		: async (root, arguments_, context, info) => {
				try {
					return await runAttributed(callbacks, source, () =>
						resolver(root, arguments_, context, info),
					)
				} catch (error: unknown) {
					throw createSafeGraphqlError(error, requestId(context))
				}
			}

export const attributedTypeResolver = (
	resolver: GraphQLTypeResolver<unknown, unknown>,
	source: OwnedGraphqlSchema,
	callbacks: ApplicationCallbackExecutor,
): GraphQLTypeResolver<unknown, unknown> =>
	source.attribution.kind === 'generated'
		? resolver
		: async (value, context, info, abstractType) => {
				try {
					return await runAttributed(callbacks, source, () =>
						resolver(value, context, info, abstractType),
					)
				} catch (error: unknown) {
					throw createSafeGraphqlError(error, requestId(context))
				}
			}

export const attributedIsTypeOf = (
	resolver: GraphQLIsTypeOfFn<unknown, unknown>,
	source: OwnedGraphqlSchema,
	callbacks: ApplicationCallbackExecutor,
): GraphQLIsTypeOfFn<unknown, unknown> =>
	source.attribution.kind === 'generated'
		? resolver
		: async (value, context, info) => {
				try {
					return await runAttributed(callbacks, source, () =>
						resolver(value, context, info),
					)
				} catch (error: unknown) {
					throw createSafeGraphqlError(error, requestId(context))
				}
			}

const attributedScalarCallback = <
	TArguments extends readonly unknown[],
	TResult,
>(
	callback: (...arguments_: TArguments) => TResult,
	source: OwnedGraphqlSchema,
	callbacks: ApplicationCallbackExecutor,
): ((...arguments_: TArguments) => TResult) =>
	source.attribution.kind === 'generated'
		? callback
		: (...arguments_) => {
				try {
					return runAttributed(callbacks, source, () => callback(...arguments_))
				} catch (error: unknown) {
					throw createSafeGraphqlError(error, currentRequestId())
				}
			}

export const attributedScalarSerializer = (
	callback: GraphQLScalarOutputValueCoercer<unknown>,
	source: OwnedGraphqlSchema,
	callbacks: ApplicationCallbackExecutor,
): GraphQLScalarOutputValueCoercer<unknown> =>
	attributedScalarCallback(callback, source, callbacks)

export const attributedScalarValueParser = (
	callback: GraphQLScalarInputValueCoercer<unknown>,
	source: OwnedGraphqlSchema,
	callbacks: ApplicationCallbackExecutor,
): GraphQLScalarInputValueCoercer<unknown> =>
	attributedScalarCallback(callback, source, callbacks)

export const attributedScalarLiteralParser = (
	callback: GraphQLScalarInputLiteralCoercer<unknown>,
	source: OwnedGraphqlSchema,
	callbacks: ApplicationCallbackExecutor,
): GraphQLScalarInputLiteralCoercer<unknown> =>
	attributedScalarCallback(callback, source, callbacks)
