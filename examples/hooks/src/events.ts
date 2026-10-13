//#region event
import { defineEvent, onEvent } from '@ultimabase/hooks-plugin'

import { sendMessage } from './effects.ts'

/** Emitted by a Hook when a post goes live; bound by value, not by name. */
export const postPublished = defineEvent<{ postId: string; title: string }>(
	'post.published',
)

/** Runs after the commit, without delaying the response. */
export const announcePost = onEvent(postPublished, ({ event }) =>
	sendMessage({
		to: 'subscribers',
		subject: `New post: ${event.payload.title}`,
	}),
)
//#endregion event
