// React's hook to a live subscription (D-154, D-252): Apollo's
// `useSubscription` through `ultimabaseLive`, which holds the list so that a
// message costs the rows it changed, with what grows the list.
import type {
	DocumentNode,
	ErrorLike,
	OperationVariables,
	TypedDocumentNode,
} from '@apollo/client'
import { useSubscription } from '@apollo/client/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { LiveControl, LiveGrowth } from './apollo.ts'
import { LiveError } from './error.ts'

/** A live subscription's result, and what adds rows to its list. */
export type LiveSubscriptionResult<TData> = useSubscription.Result<TData> & {
	/**
	 * Adds `first` rows to the list, or a page of the first page's size;
	 * resolves once they arrived. A call during a growth is ignored, and a
	 * growth that fails goes to `error`, the list as it was.
	 */
	readonly fetchMore: (options?: LiveGrowth) => Promise<void>
	/** A growth is running. */
	readonly fetchingMore: boolean
}

/** A growth that failed, and the subscription's growth it belongs to. */
type Failure = {
	readonly error: ErrorLike
	readonly by: NonNullable<LiveControl['fetchMore']>
}

/** Follows `subscription`, a live list or row; `fetchMore` grows the list. */
export function useLiveSubscription<
	TData = unknown,
	TVariables extends OperationVariables = OperationVariables,
>(
	subscription: DocumentNode | TypedDocumentNode<TData, TVariables>,
	// As `useSubscription`: its options once a variable is required.
	...[options]: {} extends TVariables
		? [options?: useSubscription.Options<TData, TVariables>]
		: [options: useSubscription.Options<TData, TVariables>]
): LiveSubscriptionResult<TData> {
	const [fetchingMore, setFetchingMore] = useState(false)
	const [failure, setFailure] = useState<Failure>()
	const onError = useRef(options?.onError)
	useEffect(() => {
		onError.current = options?.onError
	})
	const [live] = useState(() => {
		const control: LiveControl = {}
		let growing = false
		const fetchMore = async (more?: LiveGrowth) => {
			const grow = control.fetchMore
			if (grow === undefined) {
				throw new LiveError(
					'BAD_USER_INPUT',
					'fetchMore grows a live subscription once it runs.',
				)
			}
			if (growing) return
			growing = true
			setFetchingMore(true)
			setFailure(undefined)
			try {
				await grow(more)
			} catch (error) {
				// Any other failure ended the subscription: Apollo told of it.
				if (!(error instanceof LiveError)) return
				if (error.code === 'BAD_USER_INPUT') throw error
				setFailure({ error, by: grow })
				onError.current?.(error)
			} finally {
				growing = false
				setFetchingMore(false)
			}
		}
		return { control, fetchMore }
	})
	// The rest parameter's type holds the variables a subscription requires.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- TypeScript cannot follow it through the spread.
	const asked = {
		fetchPolicy: 'no-cache',
		...options,
		// Each hook holds its own subscription, which its control grows.
		context: {
			...options?.context,
			live: live.control,
			queryDeduplication: false,
		},
	} as useSubscription.Options<TData, TVariables>
	const subscribed: (
		document: DocumentNode | TypedDocumentNode<TData, TVariables>,
		options: useSubscription.Options<TData, TVariables>,
	) => useSubscription.Result<TData> = useSubscription
	const result = subscribed(subscription, asked)
	// A growth's failure ends with its subscription: its variables changed, or
	// it restarted, and the link set what grows the new one.
	const failed = failure?.by === live.control.fetchMore ? failure : undefined
	return useMemo(
		() => ({
			...result,
			...(failed && !result.error && { error: failed.error }),
			fetchMore: live.fetchMore,
			fetchingMore,
		}),
		[result, live, failed, fetchingMore],
	)
}
