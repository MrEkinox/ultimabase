// Apollo's link to live subscriptions (D-154), placed before the WebSocket
// link: it applies each message of a live list to the result it holds and
// hands Apollo the whole result, and for the hook writes the rows that changed
// to the cache (D-252). It grows the list by completing it and subscribing
// again with the token, in one tick, so the socket stays open.
import type { ApolloCache } from '@apollo/client'
import { ApolloLink } from '@apollo/client'
import type { DocumentNode, FieldNode, OperationDefinitionNode } from 'graphql'
import type { Subscription } from 'rxjs'
import { Observable } from 'rxjs'
import type { LiveChange, LiveList } from './apply.ts'
import { applyLive } from './apply.ts'
import { LiveError, liveErrorOf } from './error.ts'
import { isList, isMessage, isRecord } from './guards.ts'
import { CachedRows, rowsOf } from './rows.ts'

/** A growth's rows: `first`, or as many as the first page's. */
export type LiveGrowth = { readonly first?: number }

/**
 * What grows a live subscription, passed as its `live` context: the link
 * sets `fetchMore`. A subscription read with one has its rows written to the
 * cache one by one (D-252).
 */
export type LiveControl = {
	fetchMore?: (options?: LiveGrowth) => Promise<void>
}

type Data = { readonly [key: string]: unknown }
type Waiter = {
	readonly resolve: () => void
	readonly reject: (error: unknown) => void
}

const isControl = (value: unknown): value is LiveControl =>
	typeof value === 'object' && value !== null

/** The root field, its key, and the variable its `first` or `take` reads. */
function rootOf(query: DocumentNode): {
	readonly field?: FieldNode
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
		field,
		key: field.alias?.value ?? field.name.value,
		...(value?.kind === 'Variable' && { grows: value.name.value }),
	}
}

/** The error a result refuses with, unless it holds data or is live. */
function refusalOf(result: ApolloLink.Result): LiveError | undefined {
	const [error] = result.errors ?? []
	if (error === undefined || isRecord(result.data)) return undefined
	if (result.extensions?.['live'] !== undefined) return undefined
	const fallback = new LiveError('INTERNAL', error.message)
	return liveErrorOf({ ...error.extensions, message: error.message }, fallback)
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
	const { field, key, grows } = rootOf(operation.query)
	const { cache } = operation.client
	const { extensions } = operation
	const asked: unknown = extensions['live']
	const control: unknown = operation.getContext()['live']
	const page: unknown =
		grows === undefined ? undefined : operation.variables[grows]
	return new Observable((observer) => {
		const rows =
			field !== undefined && isControl(control)
				? new CachedRows(operation, field)
				: undefined
		let data: Data | undefined
		let revision = 0
		let token: string | undefined
		let inner: Subscription | undefined
		let closed = false
		// What takes back a growth that has not arrived yet.
		let undo: (() => void) | undefined
		const waiting: Waiter[] = []
		const settle = (error?: unknown) => {
			undo = undefined
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
			// A growth refused, past maxConnectionRows: the list goes on as it was.
			const refused = undo && refusalOf(result)
			if (undo !== undefined && refused !== undefined) {
				undo()
				settle(refused)
				return open()
			}
			const live: unknown = result.extensions?.['live']
			const whole: unknown = 'data' in result ? result.data : undefined
			if (key !== undefined && isRecord(whole)) rows?.shown(whole[key])
			if (key === undefined || !isMessage(live)) return observer.next(result)
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
			rows?.changed(live.changes ?? [], !Array.isArray(list))
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
			control.fetchMore = async (options) => {
				const shown: unknown =
					grows === undefined ? undefined : operation.variables[grows]
				const more = options?.first ?? page
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
				if (typeof more !== 'number' || !Number.isInteger(more) || more < 1) {
					throw new LiveError(
						'BAD_USER_INPUT',
						'first must be a positive integer.',
					)
				}
				undo ??= () => {
					operation.variables = { ...operation.variables, [grows]: shown }
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
			rows?.close()
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
