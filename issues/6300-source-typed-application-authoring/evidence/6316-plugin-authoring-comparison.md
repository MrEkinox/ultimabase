# Complete small plugin-author comparison

Both files declare the same option, manifest, privilege and public nominal type.
The package name is an example publication identity, not an added official plugin.
The before form illustrates the baseline side-effect-only declaration callback;
the after form returns its registration receipt. Neither installs behavior by import.
The nominal reference is retained for supported standalone/graph consumers.

## Before

```ts
import { contributeDeclarations, plugin } from '@ultimabase/core'
import { definePluginFieldOption } from '@ultimabase/plugin-kit'

// Public nominal references are still needed by retained graph consumers.
export type HighlightedFieldOption = boolean

const highlighted = definePluginFieldOption({
	contexts: ['stored'],
	normalize: (value) => value === true,
	protocolVersion: 1,
	typegen: {
		module: '@example/highlight-plugin',
		type: 'HighlightedFieldOption',
	},
})

export const highlightPlugin = () =>
	plugin({
		id: 'community.highlight',
		version: '1.0.0',
		core: '^0.0.0',
		permissions: { 'schema:declare': 'Declares the highlighted field option.' },
		contributions: [
			contributeDeclarations({
				schema: ({ schemas }) => {
					schemas.defineOptions({
						contributionId: 'highlighted',
						field: { highlighted },
					})
				},
			}),
		],
	})
```

## After

```ts
import { contributeDeclarations, plugin } from '@ultimabase/core'
import { definePluginFieldOption } from '@ultimabase/plugin-kit'

// Public nominal references are still needed by retained graph consumers.
export type HighlightedFieldOption = boolean

const highlighted = definePluginFieldOption({
	contexts: ['stored'],
	normalize: (value) => value === true,
	protocolVersion: 1,
	typegen: {
		module: '@example/highlight-plugin',
		type: 'HighlightedFieldOption',
	},
})

export const highlightPlugin = () =>
	plugin({
		id: 'community.highlight',
		version: '1.0.0',
		core: '^0.0.0',
		permissions: { 'schema:declare': 'Declares the highlighted field option.' },
		contributions: [
			contributeDeclarations({
				schema: ({ schemas }) => {
					return schemas.defineOptions({
						contributionId: 'highlighted',
						field: { highlighted },
					})
				},
			}),
		],
	})
```

No second descriptor, handwritten module augmentation or Plugin Kit registry
is added. The configured consumer can now infer its option from the returned
receipt; retained standalone consumers still require the public nominal reference
and Typegen. This is deliberately a small gain for authors, not a claim that
large multi-capability plugins cease to need manifests, contracts and handlers.
Runtime option validation and privilege checks are identical.

The existing packed Plugin Kit authoring fixture tests this declaration pattern,
configured field use and inferred application exports; the Core-native fixture
tests the same receipt mechanism without Plugin Kit. The hypothetical publication
module here is not resolved by those fixtures or claimed to be a published package.
The complete after file plus a configured consumer declaring
`field.string({ highlighted: true })` also passes a fresh strict NodeNext
TypeScript program through current built public exports with zero diagnostics.
