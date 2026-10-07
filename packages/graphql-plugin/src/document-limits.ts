import { isPlainRecord } from '@ultimabase/shared'
import {
	GraphQLError,
	Kind,
	Lexer,
	Source,
	TokenKind,
	parse,
	visit,
	type DocumentNode,
	type FragmentDefinitionNode,
	type OperationDefinitionNode,
	type SelectionSetNode,
} from 'graphql'

import type { NormalizedGraphqlExecutionLimits } from './connection-limits.js'

const limitError = (message: string, requestId: string): GraphQLError =>
	new GraphQLError(message, {
		extensions: {
			code: 'GRAPHQL_REQUEST_LIMIT_EXCEEDED',
			requestId,
			retryable: false,
		},
	})

const requestError = (message: string, requestId: string): GraphQLError =>
	new GraphQLError(message, {
		extensions: {
			code: 'GRAPHQL_REQUEST_INVALID',
			requestId,
			retryable: false,
		},
	})

const countSourceTokens = (
	source: string,
	maximum: number,
	requestId: string,
): void => {
	const lexer = new Lexer(new Source(source))
	let count = 0
	while (lexer.advance().kind !== TokenKind.EOF) {
		count += 1
		if (count > maximum) {
			throw limitError('GraphQL document token limit exceeded.', requestId)
		}
	}
}

const countAstNodes = (
	document: DocumentNode,
	maximum: number,
	requestId: string,
): void => {
	let count = 0
	visit(document, {
		enter: () => {
			count += 1
			if (count > maximum) {
				throw limitError('GraphQL document node limit exceeded.', requestId)
			}
		},
	})
}

const selectedOperation = (
	document: DocumentNode,
	operationName: string | undefined,
	requestId: string,
): OperationDefinitionNode | undefined => {
	const operations = document.definitions.filter(
		(definition): definition is OperationDefinitionNode =>
			definition.kind === Kind.OPERATION_DEFINITION,
	)
	if (operationName !== undefined) {
		return operations.find(({ name }) => name?.value === operationName)
	}
	if (operations.length === 1) return operations[0]
	if (operations.length > 1) {
		throw requestError(
			'GraphQL operationName is required for a multi-operation document.',
			requestId,
		)
	}
	return undefined
}

const fragmentMap = (
	document: DocumentNode,
): ReadonlyMap<string, FragmentDefinitionNode> =>
	new Map(
		document.definitions
			.filter(
				(definition): definition is FragmentDefinitionNode =>
					definition.kind === Kind.FRAGMENT_DEFINITION,
			)
			.map((fragment) => [fragment.name.value, fragment]),
	)

interface SelectionCounts {
	aliases: number
	depth: number
	rootFields: number
}

const selectionCounts = (
	document: DocumentNode,
	operation: OperationDefinitionNode,
): SelectionCounts => {
	const fragments = fragmentMap(document)
	let aliases = 0
	let depth = 0
	let rootFields = 0
	const walk = (
		selectionSet: SelectionSetNode,
		level: number,
		root: boolean,
		fragmentPath: ReadonlySet<string>,
	): void => {
		depth = Math.max(depth, level)
		for (const selection of selectionSet.selections) {
			if (selection.kind === Kind.FIELD) {
				if (selection.alias !== undefined) aliases += 1
				if (root) rootFields += 1
				if (selection.selectionSet !== undefined) {
					walk(selection.selectionSet, level + 1, false, fragmentPath)
				}
			} else if (selection.kind === Kind.INLINE_FRAGMENT) {
				walk(selection.selectionSet, level, root, fragmentPath)
			} else {
				const name = selection.name.value
				if (fragmentPath.has(name)) continue
				const fragment = fragments.get(name)
				if (fragment !== undefined) {
					walk(
						fragment.selectionSet,
						level,
						root,
						new Set([...fragmentPath, name]),
					)
				}
			}
		}
	}
	walk(operation.selectionSet, 1, true, new Set())
	return { aliases, depth, rootFields }
}

/** Parses and bounds one document before GraphQL validation or resolver work. */
export const prepareGraphqlDocument = (
	document: string | DocumentNode,
	operationName: string | undefined,
	limits: NormalizedGraphqlExecutionLimits,
	requestId: string,
): DocumentNode => {
	let parsed: DocumentNode
	if (typeof document === 'string') {
		if (Buffer.byteLength(document, 'utf8') > limits.maxDocumentBytes) {
			throw limitError('GraphQL document byte limit exceeded.', requestId)
		}
		countSourceTokens(document, limits.maxDocumentTokens, requestId)
		parsed = parse(document)
	} else {
		parsed = document
		countAstNodes(parsed, limits.maxDocumentTokens, requestId)
	}
	const operation = selectedOperation(parsed, operationName, requestId)
	if (operation !== undefined) {
		if (operation.operation === 'subscription') {
			throw requestError('GraphQL subscriptions are not supported.', requestId)
		}
		const counts = selectionCounts(parsed, operation)
		if (counts.aliases > limits.maxAliases) {
			throw limitError('GraphQL alias limit exceeded.', requestId)
		}
		if (counts.depth > limits.maxDepth) {
			throw limitError('GraphQL selection depth limit exceeded.', requestId)
		}
		if (counts.rootFields > limits.maxRootFields) {
			throw limitError('GraphQL root field limit exceeded.', requestId)
		}
	}
	visit(parsed, {
		Directive: (node) => {
			if (node.name.value === 'defer' || node.name.value === 'stream') {
				throw requestError(
					`GraphQL @${node.name.value} is not supported.`,
					requestId,
				)
			}
		},
	})
	return parsed
}

/** Snapshots an exact JSON-compatible variable map under its byte budget. */
export const prepareGraphqlVariables = (
	variables: Readonly<Record<string, unknown>> | undefined,
	maximumBytes: number,
	requestId: string,
): Readonly<Record<string, unknown>> | undefined => {
	if (variables === undefined) return undefined
	if (!isPlainRecord(variables)) {
		throw requestError('GraphQL variables must be a plain object.', requestId)
	}
	const seen = new WeakSet<object>()
	const assertJson = (value: unknown): void => {
		if (
			value === null ||
			typeof value === 'string' ||
			typeof value === 'boolean'
		) {
			return
		}
		if (typeof value === 'number') {
			if (Number.isFinite(value)) return
			throw requestError(
				'GraphQL variables must be JSON-compatible.',
				requestId,
			)
		}
		if (!Array.isArray(value) && !isPlainRecord(value)) {
			throw requestError(
				'GraphQL variables must be JSON-compatible.',
				requestId,
			)
		}
		if (
			!Array.isArray(value) &&
			Reflect.ownKeys(value).some((key) => typeof key !== 'string')
		) {
			throw requestError(
				'GraphQL variables must be JSON-compatible.',
				requestId,
			)
		}
		if (seen.has(value)) {
			throw requestError(
				'GraphQL variables must be JSON-compatible.',
				requestId,
			)
		}
		seen.add(value)
		for (const item of Array.isArray(value) ? value : Object.values(value)) {
			assertJson(item)
		}
		seen.delete(value)
	}
	assertJson(variables)
	let serialized: string
	try {
		serialized = JSON.stringify(variables)
	} catch {
		throw requestError('GraphQL variables must be JSON-compatible.', requestId)
	}
	const parsed: unknown = JSON.parse(serialized)
	if (!isPlainRecord(parsed)) {
		throw requestError(
			'GraphQL variables must be a plain JSON object.',
			requestId,
		)
	}
	if (Buffer.byteLength(serialized, 'utf8') > maximumBytes) {
		throw limitError('GraphQL variables byte limit exceeded.', requestId)
	}
	return parsed
}
