<!--
	Every editor page (/people, /icons, /calendar) lives in this group. Build a page from
	#lib/editor: EditorHeader (with the Home button), LiveList, GroupSection, the dialogs and
	NoticeBar.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<div class="contents" data-editor-page>
	{@render children()}
</div>

<style>
	/* app.css gives html and body `transform: translateZ(0)`. A transform makes position: fixed
	   relative to the whole page instead of the window, which on a long, scrolling editor page put
	   the dialogs and the message bar far below the visible area. Switch it off while an editor
	   page is shown (the presenter keeps it). */
	:global(html:has([data-editor-page])),
	:global(body:has([data-editor-page])) {
		transform: none;
	}
</style>
