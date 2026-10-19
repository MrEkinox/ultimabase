import { defineEnum } from '../../lib/core.ts'

/** Shared enum, used by several fields. */
export const TodoPriority = defineEnum('TodoPriority', ['low', 'normal', 'high'])
