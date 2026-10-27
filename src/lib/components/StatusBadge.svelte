<script lang="ts">
	type Status = 'awake' | 'asleep' | 'unknown' | 'warming' | 'ready' | 'stopping' | 'error' | 'idle' | 'n/a';

	interface Props {
		status: string;
		pulse?: boolean;
	}
	let { status, pulse = true }: Props = $props();

	const normalized = $derived((status ?? '').toLowerCase());

	const config = $derived.by(() => {
		switch (normalized) {
			case 'awake':
			case 'ready':
				return { label: status, dot: 'bg-emerald-400', text: 'text-emerald-300', ring: 'ring-emerald-400/30', bg: 'bg-emerald-400/10' };
			case 'asleep':
			case 'idle':
				return { label: status, dot: 'bg-slate-400', text: 'text-slate-300', ring: 'ring-slate-400/30', bg: 'bg-slate-400/10' };
			case 'warming':
				return { label: status, dot: 'bg-amber-400', text: 'text-amber-300', ring: 'ring-amber-400/30', bg: 'bg-amber-400/10' };
			case 'stopping':
				return { label: status, dot: 'bg-orange-400', text: 'text-orange-300', ring: 'ring-orange-400/30', bg: 'bg-orange-400/10' };
			case 'error':
				return { label: status, dot: 'bg-red-400', text: 'text-red-300', ring: 'ring-red-400/30', bg: 'bg-red-400/10' };
			case 'n/a':
				return { label: 'always-on', dot: 'bg-cyan-400', text: 'text-cyan-300', ring: 'ring-cyan-400/30', bg: 'bg-cyan-400/10' };
			default:
				return { label: status || 'unknown', dot: 'bg-slate-500', text: 'text-slate-400', ring: 'ring-slate-500/30', bg: 'bg-slate-500/10' };
		}
	});

	const isLive = $derived(normalized === 'awake' || normalized === 'ready' || normalized === 'warming');
</script>

<span class="inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 {config.bg} {config.text} {config.ring}">
	<span class="relative flex h-2 w-2">
		{#if pulse && isLive}
			<span class="absolute inline-flex h-full w-full animate-ping rounded-full {config.dot} opacity-60"></span>
		{/if}
		<span class="relative inline-flex h-2 w-2 rounded-full {config.dot}"></span>
	</span>
	{config.label}
</span>