'use client'
// Searches the index the site exports, in the browser: a static site has no
// server to ask. Only the pages of the version being read are searched.
import { useStaticSearch } from 'fumadocs-core/search/client'
import {
	SearchDialog,
	SearchDialogClose,
	SearchDialogContent,
	SearchDialogHeader,
	SearchDialogIcon,
	SearchDialogInput,
	SearchDialogList,
	SearchDialogOverlay,
} from 'fumadocs-ui/components/dialog/search'
import type { SharedProps } from 'fumadocs-ui/contexts/search'
import { usePathname } from 'next/navigation'

import { versionAt } from '../lib/versions'

export function Search(props: SharedProps) {
	const search = useStaticSearch({ tag: versionAt(usePathname()) })
	return (
		<SearchDialog {...search} {...props}>
			<SearchDialogOverlay />
			<SearchDialogContent>
				<SearchDialogHeader>
					<SearchDialogIcon />
					<SearchDialogInput />
					<SearchDialogClose />
				</SearchDialogHeader>
				<SearchDialogList />
			</SearchDialogContent>
		</SearchDialog>
	)
}
