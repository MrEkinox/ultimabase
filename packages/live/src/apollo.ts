// Apollo's link to live subscriptions (D-154), placed before the WebSocket
// link: it applies each message of a live list to the result it holds and
// hands Apollo the whole result. It grows the list by completing it and
// subscribing again with the token, in one tick, so the socket stays open.
import type { ApolloCache } from '@apollo/client'
import { ApolloLink } from '@apollo/client'
import type { DocumentNode, FieldNode, OperationDefinitionNode } from 'graphql'
import type { Subscription } from 'rxjs'
import { Observable } from 'rxjs'
import type { LiveChange, LiveList } from './apply.ts'
import { applyLive } from './apply.ts'
import { LiveError } from './error.ts'
import { isList, isMessage, isRecord } from './guards.ts'

/**
 * What grows a live subscription, passed as its `live` context: the link
 * sets `fetchMore`.
 */
export type LiveControl = {
	fetchMore?: (options: { readonly first: number }) => Promise<void>
}

type Data = { readonly [key: string]: unknown }
type Waiter = {
	readonly resolve: () => void
	readonly reject: (error: unknown) => void
}

const isControl = (value: unknown): value is LiveControl =>
	typeof value === 'object' && value !== null

/** The root field's key, and the variable its `first` or `take` reads. */
function rootOf(query: DocumentNode): {
	readonly key?: string
	readonly grows?: string
} {
	const operation = query.definitions.find(
		(definition): definition is OperationDefinitionNode =>
			definition.kind === 'OperationDefinition',
	)
	const field = operation?.selectionSet.selections.find(
		(selection): selection is FieldNode =>
			selection.kind === 'Field' && selection.name.value !== '__typename',
	)
	if (field === undefined) return {}
	const value = field.arguments?.find(
		({ name }) => name.value === 'first' || name.value === 'take',
	)?.value
	return {
		key: field.alias?.value ?? field.name.value,
		...(value?.kind === 'Variable' && { grows: value.name.value }),
	}
}

/** The rows of `list`, the nodes under a connection. */
function rowsOf(list: LiveList): readonly unknown[] {
	if (Array.isArray(list)) return list
	const edges: unknown = Reflect.get(list, 'edges')
	if (!Array.isArray(edges)) return []
	return edges.map((edge: unknown) =>
		isRecord(edge) ? edge['node'] : undefined,
	)
}

/** Evicts from `cache` the rows of `list` that `changes` names gone. */
function evict(
	cache: ApolloCache,
	list: LiveList,
	changes: readonly LiveChange[] = [],
) {
	const gone = new Set(
		changes.flatMap((change) =>
			'remove' in change && change.gone === true ? [change.remove] : [],
		),
	)
	if (gone.size === 0) return
	for (const row of rowsOf(list)) {
		const { id, __typename } = isRecord(row) ? row : {}
		const entity =
			typeof id === 'string' && typeof __typename === 'string' && gone.has(id)
				? cache.identify({ __typename, id })
				: undefined
		if (entity !== undefined) cache.evict({ id: entity })
	}
	cache.gc()
}

/** Follows `operation`, a live subscription, applying its messages. */
function followed(
	operation: ApolloLink.Operation,
	forward: ApolloLink.ForwardFunction,
): Observable<ApolloLink.Result> {
	const { key, grows } = rootOf(operation.query)
	const { cache } = operation.client
	const { extensions } = operation
	const asked: unknown = extensions['live']
	const control: unknown = operation.getContext()['live']
	return new Observable((observer) => {
		let data: Data | undefined
		let revision = 0
		let token: string | undefined
		let inner: Subscription | undefined
		let closed = false
		const waiting: Waiter[] = []
		const settle = (error?: unknown) => {
			for (const { resolve, reject } of waiting.splice(0)) {
				if (error === undefined) resolve()
				else reject(error)
			}
		}
		const fail = (error: unknown) => {
			inner?.unsubscribe()
			settle(error)
			observer.error(error)
		}
		const received = (result: ApolloLink.Result) => {
			const live: unknown = result.extensions?.['live']
			if (key === undefined || !isMessage(live)) return observer.next(result)
			const whole: unknown = 'data' in result ? result.data : undefined
			if (isRecord(whole)) {
				data = whole
				revision = live.revision
				const resume: unknown = Reflect.get(live, 'resume')
				if (typeof resume === 'string') token = resume
				settle()
				return observer.next(result)
			}
			const list = data?.[key]
			const next =
				data !== undefined && live.revision === revision + 1 && isList(list)
					? applyLive(list, live)
					: undefined
			// Out of step: read the list again.
			if (data === undefined || next === undefined || !isList(list)) {
				data = undefined
				token = undefined
				return open()
			}
			revision += 1
			data = { ...data, [key]: next }
			observer.next({ ...result, data })
			evict(cache, list, live.changes)
			settle()
		}
		function open() {
			inner?.unsubscribe()
			operation.extensions =
				token === undefined
					? extensions
					: {
							...extensions,
							live: { ...(isRecord(asked) && asked), resume: token },
						}
			inner = forward(operation).subscribe({
				next: (result) => {
					try {
						received(result)
					} catch (error) {
						fail(error)
					}
				},
				error: fail,
				complete: () => {
					settle()
					observer.complete()
				},
			})
		}
		if (isControl(control)) {
			control.fetchMore = async ({ first: more }) => {
				const shown: unknown =
					grows === undefined ? undefined : operation.variables[grows]
				if (
					grows === undefined ||
					typeof shown !== 'number' ||
					!Number.isInteger(shown)
				) {
					throw new LiveError(
						'BAD_USER_INPUT',
						'fetchMore grows a live list: its root field needs first or take from a variable.',
					)
				}
				if (!Number.isInteger(more) || more < 1) {
					throw new LiveError(
						'BAD_USER_INPUT',
						'first must be a positive integer.',
					)
				}
				operation.variables = { ...operation.variables, [grows]: shown + more }
				if (closed) return
				const grown = new Promise<void>((resolve, reject) => {
					waiting.push({ resolve, reject })
				})
				open()
				return grown
			}
		}
		open()
		return () => {
			closed = true
			inner?.unsubscribe()
			settle()
		}
	})
}

/** The link that follows live subscriptions; other operations pass. */
export function ultimabaseLive(): ApolloLink {
	return new ApolloLink((operation, forward) =>
		operation.operationType === 'subscription'
			? followed(operation, forward)
			: forward(operation),
	)
}
