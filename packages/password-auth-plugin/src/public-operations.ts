import type { PluginOperationPublicDeclaration } from '@ultimabase/core/plugin'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { passwordAuthOperations } from './operations.js'

const stringProperty = immutableRecord({ type: 'string' })
const objectInput = (first: string, second: string) =>
	immutableRecord({
		type: 'object',
		properties: immutableRecord({
			[first]: stringProperty,
			[second]: stringProperty,
		}),
		required: immutableArray([first, second]),
		additionalProperties: false,
	})
const nullSchema = immutableRecord({ type: 'null' })

/**
 * Declares all six operations public (ADR-0324): every installed transport
 * exposes them; `restPlugin({ hide: [passwordAuthOperations.refresh] })`
 * hides one.
 */
export const passwordAuthPublicOperations: Readonly<
	Record<keyof typeof passwordAuthOperations, PluginOperationPublicDeclaration>
> = immutableRecord({
	changePassword: immutableRecord({
		name: 'changePassword',
		input: objectInput('currentPassword', 'newPassword'),
	}),
	login: immutableRecord({
		name: 'login',
		input: objectInput('username', 'password'),
	}),
	logout: immutableRecord({ name: 'logout', input: nullSchema }),
	logoutEverywhere: immutableRecord({
		name: 'logoutEverywhere',
		input: nullSchema,
	}),
	refresh: immutableRecord({ name: 'refresh', input: nullSchema }),
	signUp: immutableRecord({ name: 'signUp' }),
})
