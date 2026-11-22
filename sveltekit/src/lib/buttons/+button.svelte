<script lang="ts">
	interface Props {
		imageUrl?: string;
		text?: string;
		imgAlt?: string;
		orientation?: 'horizontal' | 'vertical';
		buttonPreset?:
			| 'primary'
			| 'secondary'
			| 'tertiary'
			| 'success'
			| 'warning'
			| 'error'
			| 'surface';
		buttonClass?: string;
		imageClass?: string;
		textClass?: string;
		overrideButtonClass?: boolean;
		showImage?: boolean;
		overrideImageClass?: boolean;
		showText?: boolean;
		overrideTextClass?: boolean;
		disable?: boolean;
		draggable?: boolean;
		onClick?: () => void;
	}

	const {
		imageUrl = '',
		text = '',
		imgAlt = '',
		orientation = 'horizontal',
		buttonPreset = 'surface',
		buttonClass = '',
		imageClass = '',
		textClass = '',
		overrideButtonClass = false,
		showImage = true,
		overrideImageClass = false,
		showText = true,
		overrideTextClass = false,
		disable: disabled = false,
		draggable = false,
		onClick
	}: Props = $props();

	const baseClass = `flex btn relative cursor-pointer pointer-none disabled:pointer-not-allowed  overflow-hidden rounded-full border items-center justify-center`;
	const orientationClass = $derived(orientation === 'vertical' ? 'flex-col' : 'flex-row');
	const presetMap = {
		surface: `preset-tonal-surface ${baseClass}`,
		primary: `preset-tonal-primary ${baseClass}`,
		secondary: `preset-tonal-secondary ${baseClass}`,
		tertiary: `preset-tonal-tertiary ${baseClass}`,
		success: `preset-tonal-success ${baseClass}`,
		warning: `preset-tonal-warning ${baseClass}`,
		error: `preset-tonal-error ${baseClass}`
	};

	const baseButtonClass = $derived(`${presetMap[buttonPreset]} ${orientationClass}`);
	let btnClassDerived = $derived(
		`${overrideButtonClass ? buttonClass : baseButtonClass} ${buttonClass}`
	);

	const baseImageClass = `aspect-auto h-full`;
	let imageClassDerived = $derived(
		`${overrideImageClass ? imageClass : baseImageClass}  ${imageClass}`
	);

	const baseTextClass = `text-center`;
	let TextClassDerived = $derived(`${overrideTextClass ? textClass : baseTextClass} ${textClass}`);

	// A picture that is missing or broken (e.g. its icon was just deleted) shows the default one
	// instead of a broken image; if even that fails, no picture.
	const FALLBACK_IMAGE = '/defaults/avatar.png';
	let failedUrls: string[] = $state([]);
	let src = $derived(
		[imageUrl || FALLBACK_IMAGE, FALLBACK_IMAGE].find((url) => !failedUrls.includes(url))
	);
	const onImageError = () => {
		if (src) failedUrls = [...failedUrls, src];
	};
</script>

<button {draggable} {disabled} class={btnClassDerived} onclick={onClick}>
	{#if showImage && src}
		<img draggable={false} {src} alt={imgAlt} class={imageClassDerived} onerror={onImageError} />
	{/if}
	{#if showText}
		<h3 class={TextClassDerived}>
			{text}
		</h3>
	{/if}
</button>
