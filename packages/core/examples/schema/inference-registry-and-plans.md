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

export const userPlans = compileValidationPlans(UserSchema)

// Runtime will execute the create and update plans before access checks.
const usernamePresence = userPlans.create.fields.username?.presence
const updateUnknownFieldPolicy = userPlans.update.unknownFields
```

The registry does not create global state. `compileValidationPlans` retains the
original field definitions and describes presence, nullability, objects, and
lists without invoking defaults or validating request data itself.
