<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import StatusBadge from './StatusBadge.svelte';

	interface Project {
		id: string;
		name: string;
		publicUrl?: string;
	}

	interface Props {
		projects: Project[];
		selectedId: string | null;
		onselect: (id: string) => void;
	}

	let { projects = [], selectedId = null, onselect }: Props = $props();

	let selected = $state<string | null>(null);

	$effect(() => {
		if (selectedId) {
			selected = selectedId;
		} else if (selected === null && (projects?.length ?? 0) > 0) {
			selected = projects[0].id;
		}
	});

	let status = $state<string>('idle');
	let message = $state<string>('Waiting for events…');
	let deployStartedAt = $state<number | null>(null);
	let readyAt = $state<number | null>(null);
	let estimated = $state<number>(90);
	let entries = $state<Array<{ ts: number; state: string; message: string }>>([]);
	let connected = $state<boolean>(false);
	let now = $state<number>(Date.now());
	let reconnectTick = $state<number>(0);

	let eventSource: EventSource | null = null;

	function colorFor(state: string): string {
		const s = (state ?? '').toLowerCase();
		if (s === 'ready' || s === 'awake') return 'text-emerald-300';
		if (s === 'warming') return 'text-amber-300';
		if (s === 'error') return 'text-red-300';
		return 'text-slate-400';
	}

	function reconnect() {
		reconnectTick++;
	}

	$effect(() => {
		const id = selected;
		const _tick = reconnectTick;
		if (!id) return;

		// reset
		entries = [];
		status = '';
		message = '';
		deployStartedAt = null;
		readyAt = null;
		estimated = 90;
		connected = false;

		if (eventSource) {
			try { eventSource.close(); } catch {}
			eventSource = null;
		}

		const es = new EventSource(`/api/projects/${encodeURIComponent(id)}/events`);
		eventSource = es;

		let lastState: string | null = null;
		let lastMessage: string | null = null;

		es.onopen = () => {
			connected = true;
		};
		es.onerror = () => {
			connected = false;
		};
		es.addEventListener('state', (e: any) => {
			let data: any = {};
			try {
				data = JSON.parse(e?.data ?? '{}');
			} catch {
				data = {};
			}
			const st = String(data?.state ?? data?.status ?? '');
			const msg = String(data?.message ?? '');
			if (st !== lastState || msg !== lastMessage) {
				entries = [...entries, { ts: Number(data?.ts ?? Date.now()), state: st, message: msg }];
				lastState = st;
				lastMessage = msg;
			}
			status = st;
			message = msg;
			if (data?.deployStartedAt != null) deployStartedAt = Number(data.deployStartedAt);
			if (data?.readyAt != null) readyAt = Number(data.readyAt);
			if (data?.estimatedDeploySeconds != null) estimated = Number(data.estimatedDeploySeconds);
		});

		return () => {
			try { es.close(); } catch {}
			if (eventSource === es) eventSource = null;
		};
	});

	const selectedProject = $derived(projects?.find((p) => p.id === selected) ?? null);

	const elapsedSec = $derived.by(() => {
		if (deployStartedAt == null) return 0;
		const end = readyAt ?? now;
		return Math.max(0, Math.floor((end - deployStartedAt) / 1000));
	});

	const progressPct = $derived.by(() => {
		if (deployStartedAt == null) return 0;
		if (readyAt != null) return 100;
		if (!estimated) return 0;
		return Math.min(95, (elapsedSec / estimated) * 100);
	});

	const browsable = $derived(status === 'ready');

	let timer: ReturnType<typeof setInterval> | undefined;
	onMount(() => {
		timer = setInterval(() => {
			now = Date.now();
		}, 1000);
	});
	onDestroy(() => {
		if (timer) clearInterval(timer);
		if (eventSource) {
			try { eventSource.close(); } catch {}
			eventSource = null;
		}
	});
</script>

<div class="glass card sticky top-24">
	<div class="mb-3 flex items-center justify-between">
		<h2 class="text-lg font-semibold text-slate-100">Build / Deploy</h2>
		<span
			class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 {connected
				? 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/30'
				: 'bg-slate-400/10 text-slate-400 ring-slate-400/30'}"
		>
			<span class="relative flex h-2 w-2">
				{#if connected}
					<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60"></span>
				{/if}
				<span class="relative inline-flex h-2 w-2 rounded-full {connected ? 'bg-emerald-400' : 'bg-slate-500'}"></span>
			</span>
			{connected ? 'live' : 'offline'}
		</span>
	</div>

	<select class="input mb-3" bind:value={selected} onchange={() => { if (selected) onselect?.(selected); }}>
		{#each projects as p (p.id)}
			<option value={p.id}>{p.name}</option>
		{/each}
	</select>

	<div class="mb-2 flex items-center gap-2">
		<StatusBadge status={status || 'unknown'} />
		<span class="text-sm text-slate-300">{message}</span>
	</div>

	<div class="mb-1 flex justify-between text-xs text-slate-400">
		<span>Elapsed {elapsedSec}s</span>
		<span>Est. {estimated}s</span>
	</div>
	<div class="mb-3 h-2 w-full overflow-hidden rounded-full bg-slate-800/60">
		<div
			class="h-full bg-gradient-to-r from-cyan-400 to-indigo-500 transition-all duration-500"
			style="width: {progressPct}%"
		></div>
	</div>

	<div class="mb-3 flex items-center justify-between text-sm">
		<span class="text-slate-300">Browsable: {browsable ? 'yes' : 'no'}</span>
		{#if selectedProject?.publicUrl}
			<a
				href={selectedProject.publicUrl}
				target="_blank"
				rel="noopener"
				class="text-cyan-400 hover:underline"
			>
				Open site
			</a>
		{/if}
	</div>

	<div class="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-800/60 bg-slate-900/40 p-2">
		{#if entries.length === 0}
			<div class="px-2 py-4 text-center text-sm text-slate-500">Waiting for events…</div>
		{:else}
			{#each entries as e (e.ts + e.state + e.message)}
				<div class="flex gap-2 text-xs">
					<span class="whitespace-nowrap text-slate-500">{new Date(e.ts).toLocaleTimeString()}</span>
					<span class={colorFor(e.state)}>{e.state}</span>
					<span class="text-slate-300">{e.message}</span>
				</div>
			{/each}
		{/if}
	</div>

	<button class="btn btn-ghost btn-sm mt-2" type="button" onclick={reconnect}>Reconnect</button>
</div>