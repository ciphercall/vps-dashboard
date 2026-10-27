<script lang="ts">
	import { onMount } from 'svelte';
	import { Activity, Cpu, Database, HardDrive, MemoryStick, RefreshCw, Server, Wifi } from 'lucide-svelte';
	import Gauge from '$lib/components/Gauge.svelte';
	import ProjectRow from '$lib/components/ProjectRow.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';

	type VpsInfo = {
		hostname?: string;
		ip?: string;
		os?: string;
		cpuCores?: number;
		ram?: string;
		disk?: string;
		region?: string;
		provider?: string;
		dockerVersion?: string;
		containerCount?: number;
		uptime?: number;
	};

	type Metrics = {
		cpu?: number;
		cpuPercent?: number;
		memory?: { used?: number; total?: number; percent?: number };
		mem?: { used?: number; total?: number; percent?: number };
		disk?: { used?: number; total?: number; percent?: number };
		fs?: { used?: number; total?: number; percent?: number };
	};

	let vps = $state<VpsInfo | null>(null);
	let metrics = $state<Metrics | null>(null);
	let projects = $state<any[]>([]);

	let loading = $state(true);
	let refreshing = $state(false);
	let lastUpdated = $state<Date | null>(null);
	let error = $state<string | null>(null);

	async function loadAll(initial = false) {
		if (initial) loading = true;
		refreshing = true;
		error = null;
		try {
			const [vRes, mRes, pRes] = await Promise.all([
				fetch('/api/vps'),
				fetch('/api/metrics'),
				fetch('/api/projects')
			]);
			if (vRes.ok) vps = await vRes.json();
			if (mRes.ok) metrics = await mRes.json();
			if (pRes.ok) {
				const data = await pRes.json();
				projects = Array.isArray(data) ? data : (data.projects ?? data.items ?? []);
			}
			lastUpdated = new Date();
		} catch (e) {
			error = (e as Error)?.message ?? 'Failed to load';
		} finally {
			loading = false;
			refreshing = false;
		}
	}

	onMount(() => {
		loadAll(true);
		const id = setInterval(() => loadAll(false), 10000);
		return () => clearInterval(id);
	});

	const cpuPercent = $derived(
		metrics?.cpuPercent ?? metrics?.cpu ?? 0
	);
	const memPercent = $derived(
		metrics?.memory?.percent ?? metrics?.mem?.percent ?? 0
	);
	const diskPercent = $derived(
		metrics?.disk?.percent ?? metrics?.fs?.percent ?? 0
	);

	function formatUptime(sec?: number) {
		if (!sec) return '—';
		const d = Math.floor(sec / 86400);
		const h = Math.floor((sec % 86400) / 3600);
		const m = Math.floor((sec % 3600) / 60);
		return `${d}d ${h}h ${m}m`;
	}

	function formatBytes(n?: number) {
		if (n == null) return '—';
		if (n > 1e12) return (n / 1e12).toFixed(1) + ' TB';
		if (n > 1e9) return (n / 1e9).toFixed(1) + ' GB';
		if (n > 1e6) return (n / 1e6).toFixed(1) + ' MB';
		return n + ' B';
	}
</script>

<!-- Hero -->
<section class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
	<div>
		<h1 class="text-2xl font-bold sm:text-3xl">
			<span class="gradient-text">VPS Operations</span> Dashboard
		</h1>
		<p class="mt-1 text-sm text-slate-400">
			Live health, project control and visitor analytics for your Contabo VPS.
		</p>
	</div>
	<div class="flex items-center gap-3">
		{#if lastUpdated}
			<span class="text-xs text-slate-500">
				Updated {lastUpdated.toLocaleTimeString()}
			</span>
		{/if}
		<button
			type="button"
			class="btn btn-ghost btn-sm"
			onclick={() => loadAll(false)}
			disabled={refreshing}
		>
			<RefreshCw class="h-4 w-4 {refreshing ? 'animate-spin' : ''}" />
			Refresh
		</button>
	</div>
</section>

{#if error}
	<div class="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
		{error}
	</div>
{/if}

<!-- Top row: VPS info + gauges -->
<section class="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-5">
	<!-- VPS info card -->
	<div class="glass gradient-border rounded-2xl p-5 lg:col-span-2">
		<div class="mb-4 flex items-center justify-between">
			<div class="flex items-center gap-2">
				<Server class="h-5 w-5 text-cyan-400" />
				<h2 class="text-base font-bold text-slate-100">VPS Configuration</h2>
			</div>
			<StatusBadge status="awake" />
		</div>

		{#if loading && !vps}
			<div class="space-y-3">
				{#each Array(8) as _}
					<div class="skeleton h-4 w-full"></div>
				{/each}
			</div>
		{:else if vps}
			<dl class="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
				<div>
					<dt class="text-xs uppercase tracking-wide text-slate-500">Hostname</dt>
					<dd class="font-mono text-slate-200">{vps.hostname ?? '—'}</dd>
				</div>
				<div>
					<dt class="text-xs uppercase tracking-wide text-slate-500">IP</dt>
					<dd class="font-mono text-slate-200">{vps.ip ?? '—'}</dd>
				</div>
				<div>
					<dt class="text-xs uppercase tracking-wide text-slate-500">OS</dt>
					<dd class="text-slate-200">{vps.os ?? '—'}</dd>
				</div>
				<div>
					<dt class="text-xs uppercase tracking-wide text-slate-500">CPU</dt>
					<dd class="text-slate-200">{vps.cpuCores ?? '—'} cores</dd>
				</div>
				<div>
					<dt class="text-xs uppercase tracking-wide text-slate-500">RAM</dt>
					<dd class="text-slate-200">{vps.ramBytes != null ? formatBytes(vps.ramBytes) : '—'}</dd>
				</div>
				<div>
					<dt class="text-xs uppercase tracking-wide text-slate-500">Disk</dt>
					<dd class="text-slate-200">{vps.disk ?? '—'}</dd>
				</div>
				<div>
					<dt class="text-xs uppercase tracking-wide text-slate-500">Region</dt>
					<dd class="text-slate-200">{vps.region ?? '—'}</dd>
				</div>
				<div>
					<dt class="text-xs uppercase tracking-wide text-slate-500">Provider</dt>
					<dd class="text-slate-200">{vps.provider ?? '—'}</dd>
				</div>
				<div>
					<dt class="text-xs uppercase tracking-wide text-slate-500">Docker</dt>
					<dd class="font-mono text-slate-200">{vps.dockerVersion ?? '—'}</dd>
				</div>
				<div>
					<dt class="text-xs uppercase tracking-wide text-slate-500">Containers</dt>
					<dd class="text-slate-200">{vps.containerCount ?? '—'}</dd>
				</div>
				<div class="col-span-2">
					<dt class="text-xs uppercase tracking-wide text-slate-500">Uptime</dt>
					<dd class="text-slate-200">{formatUptime(vps.uptime)}</dd>
				</div>
			</dl>
		{:else}
			<div class="text-sm text-slate-500">No VPS data yet.</div>
		{/if}
	</div>

	<!-- Gauges -->
	<div class="glass rounded-2xl p-5 lg:col-span-3">
		<div class="mb-4 flex items-center gap-2">
			<Activity class="h-5 w-5 text-cyan-400" />
			<h2 class="text-base font-bold text-slate-100">Resource Usage</h2>
		</div>
		{#if loading && !metrics}
			<div class="grid grid-cols-3 gap-4">
				{#each Array(3) as _}
					<div class="flex flex-col items-center gap-3">
						<div class="skeleton h-32 w-32 rounded-full"></div>
						<div class="skeleton h-4 w-20"></div>
					</div>
				{/each}
			</div>
		{:else}
			<div class="grid grid-cols-1 gap-6 sm:grid-cols-3">
				<Gauge value={cpuPercent} label="CPU" unit="%" />
				<Gauge value={memPercent} label="Memory" unit="%" />
				<Gauge value={diskPercent} label="Disk" unit="%" />
			</div>
			<div class="mt-4 grid grid-cols-3 gap-2 text-center text-xs text-slate-500">
				<div>
					<Cpu class="mx-auto mb-1 h-4 w-4" />
					{cpuPercent.toFixed(1)}%
				</div>
				<div>
					<MemoryStick class="mx-auto mb-1 h-4 w-4" />
					{metrics?.memory?.used != null ? formatBytes(metrics.memory.used) : '—'} / {metrics?.memory?.total != null ? formatBytes(metrics.memory.total) : '—'}
				</div>
				<div>
					<HardDrive class="mx-auto mb-1 h-4 w-4" />
					{metrics?.disk?.[0]?.used != null ? formatBytes(metrics.disk[0].used) : '—'} / {metrics?.disk?.[0]?.size != null ? formatBytes(metrics.disk[0].size) : '—'}
				</div>
			</div>
		{/if}
	</div>
</section>

<!-- Projects -->
<section class="glass rounded-2xl p-5">
	<div class="mb-4 flex items-center justify-between">
		<div class="flex items-center gap-2">
			<Database class="h-5 w-5 text-cyan-400" />
			<h2 class="text-base font-bold text-slate-100">Deployed Projects</h2>
		</div>
		<span class="text-xs text-slate-500">{projects.length} monitored</span>
	</div>

	{#if loading && projects.length === 0}
		<div class="space-y-3">
			{#each Array(3) as _}
				<div class="skeleton h-12 w-full"></div>
			{/each}
		</div>
	{:else if projects.length === 0}
		<div class="py-10 text-center text-slate-500">
			No projects configured.
		</div>
	{:else}
		<div class="table-scroll">
			<table class="w-full text-sm">
				<thead class="text-xs uppercase tracking-wide text-slate-400">
					<tr class="border-b border-slate-800/60">
						<th class="px-4 py-3 text-left">Project</th>
						<th class="px-4 py-3 text-left">Status</th>
						<th class="px-4 py-3 text-left">Gatekeeper</th>
						<th class="px-4 py-3 text-left">Visits</th>
						<th class="px-4 py-3 text-left">Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each projects as p (p.id)}
						<ProjectRow project={p} columns={5} onChanged={() => loadAll(false)} />
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>