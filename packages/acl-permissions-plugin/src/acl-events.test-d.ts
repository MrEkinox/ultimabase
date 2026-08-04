import { expectTypeOf, test } from 'vitest'

import { onACLChange } from './acl-events.js'
import type { aclChangedEvent, ACLChangedEvent } from './acl-events.js'

test('infers the exact ACL event payload in consumers', () => {
	type ChangedPermission =
		ACLChangedEvent['diff']['added'][number]['permissions'][number]

	const definition = onACLChange(({ event }) => {
		expectTypeOf(event.name).toEqualTypeOf<typeof aclChangedEvent>()
		expectTypeOf(event.payload).toEqualTypeOf<ACLChangedEvent>()
		expectTypeOf(event.payload.target.id).toEqualTypeOf<string>()
		expectTypeOf<ChangedPermission>().toEqualTypeOf<
			'delete' | 'read' | 'update'
		>()
	})

	expectTypeOf(definition.name).toEqualTypeOf<typeof aclChangedEvent>()
})
