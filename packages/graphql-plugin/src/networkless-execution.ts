import type { Logger } from '@ultimabase/core'
import type { PointerValue, ApplicationRequestExecutor } from '@ultimabase/core'
import { isPlainRecord } from '@ultimabase/shared'
import {
	BREAK,
	GraphQLError,
	Kind,
	Lexer,
	Source,
	TokenKind,
	execute,
	parse,
	validate,
	visit,
	type DocumentNode,
	type ExecutionResult,
	type FragmentDefinitionNode,
	type GraphQLSchema,
	type OperationDefinitionNode,
	type SelectionSetNode,
	type ValidationRule,
} from 'graphql'

import type { NormalizedGraphqlExecutionLimits } from './connection-limits.js'
import {
	createCancelledGraphqlError,
	createSafeGraphqlError,
} from './execution-errors.js'
import {
	graphqlHideSuggestionsKey,
	readGraphqlHideSuggestions,
} from './hidden-suggestions.js'
import { assertGraphqlKnownKeys } from './known-keys.js'
import {
	RequestContext,
	type ApplicationCallbackExecutor,
	type PluginIdentity,
} from '@ultimabase/core/plugin'

/** Supplies a trusted context and one exact GraphQL operation document. */
export interface GraphqlExecuteOptions {
	readonly context: RequestContext
	readonly document: string | DocumentNode
	readonly operationName?: string
	/**
	 * Runs the document as this principal instead of the authentication
	 * provider's answer for `context`; `undefined` runs it anonymously
	 * (ADR-0304). Server-side only.
	 * @example `principal: TodoUser.pointer(userId)`
	 */
	readonly principal?: PointerValue | undefined
	readonly variables?: Readonly<Record<string, unknown>>
}

const optionKeys = new Set<string | symbol>([
	'context',
	'document',
	'operationName',
	'principal',
	'variables',
	graphqlHideSuggestionsKey,
])

const assertOptions: (
	value: unknown,
) => asserts value is GraphqlExecuteOptions = (value) => {
	if (!isPlainRecord(value)) {
		throw new TypeError('GraphQL execute options must be a plain object')
	}
	assertGraphqlKnownKeys(value, optionKeys, 'GraphQL execute options')
	if (!(value.context instanceof RequestContext)) {
		throw new TypeError('GraphQL execute context must be a real RequestContext')
	}
	if (
		typeof value.document !== 'string' &&
		(!isPlainRecord(value.document) || value.document.kind !== 'Document')
	) {
		throw new TypeError(
			'GraphQL execute document must be a string or DocumentNode',
		)
	}
	if (
		value.operationName !== undefined &&
		(typeof value.operationName !== 'string' || value.operationName === '')
	) {
		throw new TypeError(
			'GraphQL execute operationName must be a non-empty string',
		)
	}
}

const requestFailure = (
	code: 'GRAPHQL_REQUEST_INVALID' | 'GRAPHQL_REQUEST_LIMIT_EXCEEDED',
	message: string,
	requestId: string,
): GraphQLError =>
	new GraphQLError(message, {
		extensions: { code, requestId, retryable: false },
	})

const countSourceTokens = (source: string, maximum: number): boolean => {
	const lexer = new Lexer(new Source(source))
	let count = 0
	while (lexer.advance().kind !== TokenKind.EOF) {
		count += 1
		if (count > maximum) return false
	}
	return true
}

const countAstNodes = (document: DocumentNode, maximum: number): boolean => {
	let count = 0
	visit(document, {
		enter: () => {
			count += 1
			return count > maximum ? BREAK : undefined
		},
	})
	return count <= maximum
}

const selectedOperation = (
	document: DocumentNode,
	operationName: string | undefined,
): OperationDefinitionNode | 'ambiguous' | undefined => {
	const operations = document.definitions.filter(
		(definition): definition is OperationDefinitionNode =>
			definition.kind === Kind.OPERATION_DEFINITION,
	)
	if (operationName !== undefined) {
		return operations.find(({ name }) => name?.value === operationName)
	}
	return operations.length > 1 ? 'ambiguous' : operations[0]
}

// Counts aliases, root fields and depth through fragments, ignoring fragment cycles.
const selectionCounts = (
	document: DocumentNode,
	operation: OperationDefinitionNode,
): Readonly<{ aliases: number; depth: number; rootFields: number }> => {
	const fragments = new Map(
		document.definitions
			.filter(
				(definition): definition is FragmentDefinitionNode =>
					definition.kind === Kind.FRAGMENT_DEFINITION,
			)
			.map((fragment) => [fragment.name.value, fragment]),
	)
	const counts = { aliases: 0, depth: 0, rootFields: 0 }
	const walk = (
		selectionSet: SelectionSetNode,
		level: number,
		root: boolean,
		fragmentPath: ReadonlySet<string>,
	): void => {
		counts.depth = Math.max(counts.depth, level)
		for (const selection of selectionSet.selections) {
			if (selection.kind === Kind.FIELD) {
				if (selection.alias !== undefined) counts.aliases += 1
				if (root) counts.rootFields += 1
				if (selection.selectionSet !== undefined) {
					walk(selection.selectionSet, level + 1, false, fragmentPath)
				}
			} else if (selection.kind === Kind.INLINE_FRAGMENT) {
				walk(selection.selectionSet, level, root, fragmentPath)
			} else {
				const name = selection.name.value
				const fragment = fragments.get(name)
				if (fragmentPath.has(name) || fragment === undefined) continue
				walk(
					fragment.selectionSet,
					level,
					root,
					new Set([...fragmentPath, name]),
				)
			}
		}
	}
	walk(operation.selectionSet, 1, true, new Set())
	return counts
}

/** Parses and bounds one document before GraphQL validation or resolver work. */
const prepareDocument = (
	source: string | DocumentNode,
	operationName: string | undefined,
	limits: NormalizedGraphqlExecutionLimits,
	requestId: string,
): DocumentNode => {
	const limit = (message: string) =>
		requestFailure('GRAPHQL_REQUEST_LIMIT_EXCEEDED', message, requestId)
	const invalid = (message: string) =>
		requestFailure('GRAPHQL_REQUEST_INVALID', message, requestId)
	let document: DocumentNode
	if (typeof source === 'string') {
		if (Buffer.byteLength(source, 'utf8') > limits.maxDocumentBytes) {
			throw limit('GraphQL document byte limit exceeded.')
		}
		if (!countSourceTokens(source, limits.maxDocumentTokens)) {
			throw limit('GraphQL document token limit exceeded.')
		}
		document = parse(source)
	} else {
		document = source
		if (!countAstNodes(document, limits.maxDocumentTokens)) {
			throw limit('GraphQL document node limit exceeded.')
		}
	}
	const operation = selectedOperation(document, operationName)
	if (operation === 'ambiguous') {
		throw invalid(
			'GraphQL operationName is required for a multi-operation document.',
		)
	}
	if (operation !== undefined) {
		if (operation.operation === 'subscription') {
			throw invalid('GraphQL subscriptions are not supported.')
		}
		const counts = selectionCounts(document, operation)
		if (counts.aliases > limits.maxAliases) {
			throw limit('GraphQL alias limit exceeded.')
		}
		if (counts.depth > limits.maxDepth) {
			throw limit('GraphQL selection depth limit exceeded.')
		}
		if (counts.rootFields > limits.maxRootFields) {
			throw limit('GraphQL root field limit exceeded.')
		}
	}
	visit(document, {
		Directive: (node) => {
			if (node.name.value === 'defer' || node.name.value === 'stream') {
				throw invalid(`GraphQL @${node.name.value} is not supported.`)
			}
		},
	})
	return document
}

// Only acyclic plain records, arrays, strings, finite numbers, booleans and null;
// array holes are read as `undefined` and therefore rejected.
const isJsonValue = (value: unknown, ancestors: WeakSet<object>): boolean => {
	if (
		value === null ||
		typeof value === 'string' ||
		typeof value === 'boolean'
	) {
		return true
	}
	if (typeof value === 'number') return Number.isFinite(value)
	const array = Array.isArray(value)
	if (!array && !isPlainRecord(value)) return false
	if (
		(!array && Reflect.ownKeys(value).some((key) => typeof key !== 'string')) ||
		ancestors.has(value)
	) {
		return false
	}
	ancestors.add(value)
	for (const item of array ? value : Object.values(value)) {
		if (!isJsonValue(item, ancestors)) return false
	}
	ancestors.delete(value)
	return true
}

/** Snapshots an exact JSON-compatible variable map under its byte budget. */
const prepareVariables = (
	variables: Readonly<Record<string, unknown>> | undefined,
	maximumBytes: number,
	requestId: string,
): Readonly<Record<string, unknown>> | undefined => {
	if (variables === undefined) return undefined
	const invalid = (message: string) =>
		requestFailure('GRAPHQL_REQUEST_INVALID', message, requestId)
	if (!isPlainRecord(variables)) {
		throw invalid('GraphQL variables must be a plain object.')
	}
	if (!isJsonValue(variables, new WeakSet())) {
		throw invalid('GraphQL variables must be JSON-compatible.')
	}
	let serialized: string
	try {
		serialized = JSON.stringify(variables)
	} catch {
		throw invalid('GraphQL variables must be JSON-compatible.')
	}
	const parsed: unknown = JSON.parse(serialized)
	if (!isPlainRecord(parsed)) {
		throw invalid('GraphQL variables must be a plain JSON object.')
	}
	if (Buffer.byteLength(serialized, 'utf8') > maximumBytes) {
		throw requestFailure(
			'GRAPHQL_REQUEST_LIMIT_EXCEEDED',
			'GraphQL variables byte limit exceeded.',
			requestId,
		)
	}
	return parsed
}

const errorResult = (
	error: unknown,
	requestId: string,
	logger: Logger,
): ExecutionResult => ({
	errors: [
		error instanceof GraphQLError
			? error
			: createSafeGraphqlError(error, requestId, logger),
	],
})

/** Owns validated request entry without exposing Core's executor to callers. */
export class GraphqlNetworklessExecution {
	readonly #callbacks: ApplicationCallbackExecutor
	readonly #executor: ApplicationRequestExecutor
	readonly #logger: Logger
	readonly #limits: NormalizedGraphqlExecutionLimits
	readonly #owner: PluginIdentity
	readonly #schema: GraphQLSchema
	readonly #validationRules: readonly ValidationRule[]

	constructor(
		options: Readonly<{
			readonly callbacks: ApplicationCallbackExecutor
			readonly executor: ApplicationRequestExecutor
			readonly logger: Logger
			readonly limits: NormalizedGraphqlExecutionLimits
			readonly owner: PluginIdentity
			readonly schema: GraphQLSchema
			readonly validationRules: readonly ValidationRule[]
		}>,
	) {
		this.#callbacks = options.callbacks
		this.#executor = options.executor
		this.#logger = options.logger
		this.#limits = options.limits
		this.#owner = options.owner
		this.#schema = options.schema
		this.#validationRules = options.validationRules
	}

	async execute(options: GraphqlExecuteOptions): Promise<ExecutionResult> {
		assertOptions(options)
		// Variables are coerced during execution, so both steps hide them.
		const hideSuggestions = readGraphqlHideSuggestions(options)
		// An explicit principal, even `undefined`, replaces the provider's answer.
		const requestContext =
			'principal' in options
				? options.context.withPrincipal(options.principal)
				: options.context
		return await this.#callbacks.runPlugin(this.#owner, () =>
			this.#executor.runWithContext(requestContext, async (context) => {
				let document: DocumentNode
				let variables: Readonly<Record<string, unknown>> | undefined
				try {
					document = prepareDocument(
						options.document,
						options.operationName,
						this.#limits,
						context.requestId,
					)
					variables = prepareVariables(
						options.variables,
						this.#limits.maxVariablesBytes,
						context.requestId,
					)
				} catch (error: unknown) {
					return errorResult(error, context.requestId, this.#logger)
				}
				const errors = validate(this.#schema, document, this.#validationRules, {
					hideSuggestions,
				})
				if (errors.length > 0) return { errors }
				try {
					return await execute({
						schema: this.#schema,
						document,
						contextValue: Object.freeze({ request: context }),
						hideSuggestions,
						operationName: options.operationName,
						variableValues: variables,
						abortSignal: context.signal,
					})
				} catch (error: unknown) {
					return errorResult(
						context.signal.aborted
							? createCancelledGraphqlError(context.requestId)
							: error,
						context.requestId,
						this.#logger,
					)
				}
			}),
		)
	}
}
