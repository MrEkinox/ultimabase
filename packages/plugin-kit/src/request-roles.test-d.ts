import { RequestSubjectReference } from '@ultimabase/core'
import type { CapabilityToken } from '@ultimabase/core/plugin'
import { expectTypeOf, test } from 'vitest'

import {
	requestRoleResolverCapability,
	resolveRequestRoleReference,
	type RequestRoleReference,
	type RequestRoleResolver,
} from './index.js'

test('types the role contract moved out of Core (ADR-0329)', () => {
	const editor = new RequestSubjectReference('role', 'editor')
	expectTypeOf(editor).toExtend<RequestRoleReference<'editor'>>()
	expectTypeOf(
		resolveRequestRoleReference(editor),
	).toEqualTypeOf<RequestRoleReference>()
	// @ts-expect-error -- Only a role reference is a role subject.
	resolveRequestRoleReference({ toRequestRoleReference: () => editor })
	expectTypeOf(requestRoleResolverCapability).toEqualTypeOf<
		CapabilityToken<
			RequestRoleResolver,
			RequestRoleResolver,
			'ultimabase.request-subject.role-resolver',
			'1.0.0',
			'single',
			'application'
		>
	>()
	expectTypeOf<
		NonNullable<RequestRoleResolver['resolvePersistentRole']>
	>().toBeFunction()
	// @ts-expect-error -- Plain records cannot forge nominal role references.
	const forged: RequestRoleReference<'editor'> = {
		kind: 'role',
		value: 'editor',
	}
	void forged
})
