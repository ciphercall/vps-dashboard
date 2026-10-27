<script lang="ts">
	interface Props {
		code?: string | null;
		name?: string;
		size?: number;
	}
	let { code, name, size = 20 }: Props = $props();

	const cc = $derived((code ?? '').toUpperCase().trim());

	let svg = $state<string | null>(null);
	let failed = $state(false);

	const flagModules = import.meta.glob('../../../node_modules/country-flag-icons/string/3x2/*.js', { eager: false });

	$effect(() => {
		const c = cc;
		svg = null;
		failed = false;
		if (!c || c.length !== 2) {
			failed = true;
			return;
		}
		const suffix = `/${c}.js`;
		const key = Object.keys(flagModules).find((k) => k.endsWith(suffix));
		const loader = key ? flagModules[key] : undefined;
		if (!loader) {
			failed = true;
			return;
		}
		let cancelled = false;
		loader()
			.then((m: any) => {
				if (cancelled) return;
				svg = m.default ?? null;
				if (!svg) failed = true;
			})
			.catch(() => {
				if (cancelled) return;
				failed = true;
			});
		return () => {
			cancelled = true;
		};
	});

	// emoji fallback from regional indicator symbols
	const emoji = $derived.by(() => {
		if (!cc || cc.length !== 2) return '🏳️';
		const A = 0x1f1e6;
		const base = 'A'.charCodeAt(0);
		try {
			return String.fromCodePoint(A + (cc.charCodeAt(0) - base)) +
				String.fromCodePoint(A + (cc.charCodeAt(1) - base));
		} catch {
			return '🏳️';
		}
	});
</script>

<span
	class="inline-flex items-center justify-center overflow-hidden rounded-sm ring-1 ring-white/10"
	style="width:{size * 1.5}px;height:{size}px"
	title={name ?? cc}
>
	{#if svg && !failed}
		<span class="h-full w-full [&>svg]:h-full [&>svg]:w-full">{@html svg}</span>
	{:else}
		<span class="text-base leading-none">{emoji}</span>
	{/if}
</span>