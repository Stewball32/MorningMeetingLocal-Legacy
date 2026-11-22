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
