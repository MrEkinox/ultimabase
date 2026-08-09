# Inference, registry, and validation plans

Schema metadata drives operation-specific TypeScript inputs and the structural
plans consumed by the future Runtime package.

```ts
import {
	SchemaRegistry,
	compileValidationPlans,
	type InferCreateInput,
	type InferObject,
	type InferUpdateInput,
} from '@ultimabase/core'

import { UserSchema } from './basic-schema.js'
import { ProductSchema } from './field-options.js'

export type User = InferObject<typeof UserSchema>
export type CreateUserInput = InferCreateInput<typeof UserSchema>
export type UpdateUserInput = InferUpdateInput<typeof UserSchema>

// Every application owns an isolated registry with deterministic order.
export const schemas = new SchemaRegistry([UserSchema, ProductSchema])

// Framework application initialization performs this before plugin setup.
// Plugin setup receives this completed registry through a read-only contract.
schemas.compileSchemas()
export const schemaTargets = schemas.schemaTargets

export const userPlans = compileValidationPlans(UserSchema)

// Runtime will execute the create and update plans before access checks.
const usernamePresence = userPlans.create.fields.username?.presence
const updateUnknownFieldPolicy = userPlans.update.unknownFields
```

The registry does not create global state. Atomic compilation resolves every
deferred field map and relationship target, closes further schema registration,
and publishes one application-local immutable graph. Application code normally
lets `createApplication()` own this boundary instead of invoking
`compileSchemas()` directly.
`compileValidationPlans` retains the original field definitions and describes
presence, nullability, objects, and lists without invoking defaults or
validating request data itself.
