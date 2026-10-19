# f-plugin-methods (requested form, all callback methods chained, registry declared)

```
../../lib-f/types.ts(53,6): error TS2456: Type alias 'RegisteredList' circularly references itself.
../../lib-f/types.ts(65,6): error TS2456: Type alias 'RegisteredNames' circularly references itself.
../../lib-f/types.ts(68,13): error TS2456: Type alias 'SchemaNamed' circularly references itself.
../../lib-f/types.ts(78,52): error TS2315: Type 'SchemaNamed' is not generic.
src/application.ts(7,14): error TS7022: 'app' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
src/application.ts(11,12): error TS2502: 'app' is referenced directly or indirectly in its own type annotation.
src/usage.ts(22,25): error TS2344: Type 'false' does not satisfy the constraint 'true'.
src/usage.ts(23,25): error TS2344: Type 'false' does not satisfy the constraint 'true'.
src/usage.ts(30,1): error TS2578: Unused '@ts-expect-error' directive.
src/usage.ts(32,1): error TS2578: Unused '@ts-expect-error' directive.
src/user.ts(5,14): error TS7022: 'User' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
```

## Same without the registry entry

```
src/application.ts(7,46): error TS2322: Type 'Schema<"Role", { readonly name: ScalarField<"string", string, true>; readonly priority: ScalarField<"int", number, false>; readonly members: RelationField<() => any, "roles">; }, AppTypes<...>, NextState<...>, unknown>' is not assignable to type 'Defined
  Property ''~error'' is missing in type 'DefinedSchema<"Role", { readonly name: ScalarField<"string", string, true>; readonly priority: ScalarField<"int", number, false>; readonly members: RelationField<() => any, "roles">; }, AppTypes<...>> & SchemaChain<...>' but required in type 'SchemaRegistrat
src/application.ts(7,58): error TS2322: Type 'Schema<"Tag", { readonly label: ScalarField<"string", string, true>; readonly todos: RelationField<() => any, "tags">; }, AppTypes<readonly [AccessMethods, HooksMethods, AclMethods, SoftDeleteMethods, PostgresMethods], Readonly<...> & ... 1 more ... & { 
  Property ''~error'' is missing in type 'DefinedSchema<"Tag", { readonly label: ScalarField<"string", string, true>; readonly todos: RelationField<() => any, "tags">; }, AppTypes<readonly [AccessMethods, HooksMethods, AclMethods, SoftDeleteMethods, PostgresMethods], Readonly<...> & ... 1 more ... &
src/role.ts(9,29): error TS7023: 'target' implicitly has return type 'any' because it does not have a return type annotation and is referenced directly or indirectly in one of its return expressions.
src/role.ts(12,74): error TS2345: Argument of type '"assignedTodos"' is not assignable to parameter of type 'never'.
src/role.ts(12,106): error TS2339: Property 'eq' does not exist on type 'never'.
src/todo.ts(8,14): error TS7022: 'Todo' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
src/todo.ts(16,29): error TS7023: 'target' implicitly has return type 'any' because it does not have a return type annotation and is referenced directly or indirectly in one of its return expressions.
src/todo.ts(17,27): error TS7023: 'target' implicitly has return type 'any' because it does not have a return type annotation and is referenced directly or indirectly in one of its return expressions.
src/todo.ts(27,13): error TS7023: 'where' implicitly has return type 'any' because it does not have a return type annotation and is referenced directly or indirectly in one of its return expressions.
src/todo.ts(27,52): error TS2345: Argument of type '"assignee"' is not assignable to parameter of type 'K'.
  '"assignee"' is assignable to the constraint of type 'K', but 'K' could be instantiated with a different subtype of constraint 'PointerKeys<DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly completed: ScalarField<"boolean", boolean, true>; readonly archived: Sca
src/todo.ts(27,82): error TS2345: Argument of type 'string' is not assignable to parameter of type 'ScalarKeys<SchemaRef<TargetOf<Readonly<{ readonly title: ScalarField<"string", string, true>; readonly completed: ScalarField<"boolean", boolean, true>; readonly archived: ScalarField<"boolean", boole
  Type 'string' is not assignable to type 'FieldsOf<SchemaRef<TargetOf<Readonly<{ readonly title: ScalarField<"string", string, true>; readonly completed: ScalarField<"boolean", boolean, true>; readonly archived: ScalarField<"boolean", boolean, true>; ... 5 more ...; readonly tags: RelationField<...
src/usage.ts(14,25): error TS2344: Type 'false' does not satisfy the constraint 'true'.
src/usage.ts(15,25): error TS2344: Type 'false' does not satisfy the constraint 'true'.
src/usage.ts(16,25): error TS2344: Type 'false' does not satisfy the constraint 'true'.
src/usage.ts(17,25): error TS2344: Type 'false' does not satisfy the constraint 'true'.
src/usage.ts(18,25): error TS2344: Type 'false' does not satisfy the constraint 'true'.
src/usage.ts(22,25): error TS2344: Type 'false' does not satisfy the constraint 'true'.
src/usage.ts(23,25): error TS2344: Type 'false' does not satisfy the constraint 'true'.
src/usage.ts(26,25): error TS2344: Type 'false' does not satisfy the constraint 'true'.
src/usage.ts(28,1): error TS2578: Unused '@ts-expect-error' directive.
src/usage.ts(30,1): error TS2578: Unused '@ts-expect-error' directive.
src/usage.ts(32,1): error TS2578: Unused '@ts-expect-error' directive.
src/usage.ts(34,1): error TS2578: Unused '@ts-expect-error' directive.
src/usage.ts(36,1): error TS2578: Unused '@ts-expect-error' directive.
src/user.ts(5,14): error TS7022: 'User' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
src/user.ts(10,35): error TS7023: 'target' implicitly has return type 'any' because it does not have a return type annotation and is referenced directly or indirectly in one of its return expressions.
src/user.ts(17,11): error TS7023: 'where' implicitly has return type 'any' because it does not have a return type annotation and is referenced directly or indirectly in one of its return expressions.
src/user.ts(17,44): error TS2345: Argument of type '"assignedTodos"' is not assignable to parameter of type 'K'.
  '"assignedTodos"' is assignable to the constraint of type 'K', but 'K' could be instantiated with a different subtype of constraint 'RelationKeys<DefinedSchema<"User", { readonly displayName: ScalarField<"string", string, true>; readonly email: ScalarField<"string", string, true>; readonly assigne
src/user.ts(17,79): error TS2345: Argument of type 'string' is not assignable to parameter of type 'ScalarKeys<SchemaRef<TargetOf<Readonly<{ readonly displayName: ScalarField<"string", string, true>; readonly email: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => any
  Type 'string' is not assignable to type 'FieldsOf<SchemaRef<TargetOf<Readonly<{ readonly displayName: ScalarField<"string", string, true>; readonly email: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => any, "assignee">; readonly roles: RelationField<...>; } & Syst
```
