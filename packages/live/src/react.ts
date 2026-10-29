// React's hook to a live subscription (D-154): Apollo's `useSubscription`
// through `ultimabaseLive`, with what grows its list.
import type {
	DocumentNode,
	OperationVariables,
	TypedDocumentNode,
} from '@apollo/client'
import { useSubscription } from '@apollo/client/react'
import { useMemo, useState } from 'react'
import type { LiveControl } from './apollo.ts'
import { LiveError } from './error.ts'

/** A live subscription's result, and what adds rows to its list. */
export type LiveSubscriptionResult<TData> = useSubscription.Result<TData> & {
	/** Adds `first` rows to the list; resolves once they arrived. */
	readonly fetchMore: (options: { readonly first: number }) => Promise<void>
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
	const [live] = useState(() => {
		const control: LiveControl = {}
		const fetchMore = async (more: { readonly first: number }) => {
			if (control.fetchMore === undefined) {
				throw new LiveError(
					'BAD_USER_INPUT',
					'fetchMore grows a live subscription once it runs.',
				)
			}
			return control.fetchMore(more)
		}
		return { control, fetchMore }
	})
	// The rest parameter's type holds the variables a subscription requires.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- TypeScript cannot follow it through the spread.
	const asked = {
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
	return useMemo(
		() => ({ ...result, fetchMore: live.fetchMore }),
		[result, live],
	)
}
