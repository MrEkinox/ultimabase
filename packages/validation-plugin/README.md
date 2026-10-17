# @ultimabase/validation-plugin

Official field and schema validation: Standard Schema or function validators on
fields and schema checks in `.with`, reported together as one
`VALIDATION_ERROR`.

## Installation

```sh
npm install @ultimabase/validation-plugin @ultimabase/core
```

`@ultimabase/core` is a peer dependency. A Standard Schema V1 library such as
Zod is optional.

## Example

Checking input without writing, from the tested
[`examples/validation`](../../examples/validation/README.md) application:

<!-- region ../../examples/validation/tests/check.test.ts#check -->

```ts
const validation = ultimabase.plugin(validationPlugin)

const accepted = await validation.check(Event, {
	data: {
		title: 'Autumn meetup',
		startsOn: '2026-11-02',
		endsOn: '2026-11-03',
		seatsLeft: 40,
	},
})
const rejected = await validation.check(Event, {
	data: {
		title: 'Autumn meetup',
		code: 'meetup',
		startsOn: '2026-11-03',
		endsOn: '2026-11-02',
		seatsLeft: 40,
	},
})
```

<!-- endregion -->

## Documentation

- [Validation](../../apps/website/content/docs/1.0.0/plugins/official/validation.mdx)
- [Using Plugins](../../apps/website/content/docs/1.0.0/plugins/using-plugins.mdx)
