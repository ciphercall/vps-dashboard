<script lang="ts">
	import StatusBadge from './StatusBadge.svelte';
	import CountryFlag from './CountryFlag.svelte';
	import { isPrivateIp } from '$lib/ip';
	interface Project {
		id: string;
		name: string;
		publicUrl?: string;
		healthUrl?: string;
		status?: string;
		gatekeeper?: {
			state?: string;
			message?: string;
			lastActivity?: number | string;
			idleTimeoutMs?: number;
		} | null;
		visitsToday?: number;
		visits7d?: number;
	}

	interface Props {
		project: Project;
		columns?: number;
		onChanged?: () => void;
		onDeployStart?: (id: string) => void;
	}
	let { project, columns = 6, onChanged, onDeployStart }: Props = $props();

	let expanded = $state(false);
	let visits = $state<any[]>([]);
	let visitsLoading = $state(false);
	let visitsPage = $state(1);
	let visitsPageSize = $state(10);
	let visitsTotal = $state(0);
	let summary = $state<any>(null);
	let actionLoading = $state<'deploy' | 'teardown' | null>(null);
	let confirmTeardown = $state(false);
	let error = $state<string | null>(null);

	const gatekeeperState = $derived(project.gatekeeper?.state ?? (project.gatekeeper === null ? 'n/a' : 'unknown'));
	const gatekeeperLabel = $derived(
		project.gatekeeper === null || project.gatekeeper === undefined ? 'n/a (always-on)' : (project.gatekeeper?.state ?? 'unknown')
	);

	async function loadVisits(page = 1) {
		visitsLoading = true;
		error = null;
		try {
			const offset = (page - 1) * visitsPageSize;
			const [vRes, sRes] = await Promise.all([
				fetch(`/api/projects/${encodeURIComponent(project.id)}/visits?limit=${visitsPageSize}&offset=${offset}`),
				fetch(`/api/projects/${encodeURIComponent(project.id)}/visits/summary`)
			]);
			if (vRes.ok) {
				const data = await vRes.json();
				visits = data.items ?? data.visits ?? data ?? [];
				visitsTotal = data.total ?? visits.length;
				visitsPage = page;
			}
			if (sRes.ok) {
				summary = await sRes.json();
			}
		} catch (e) {
			error = (e as Error)?.message ?? 'Failed to load visits';
		} finally {
			visitsLoading = false;
		}
	}

	async function toggle() {
		expanded = !expanded;
		if (expanded && visits.length === 0 && !visitsLoading) {
			await loadVisits(1);
		}
	}

	async function doDeploy() {
		actionLoading = 'deploy';
		error = null;
		try {
			onDeployStart?.(project.id);
			const res = await fetch(`/api/projects/${encodeURIComponent(project.id)}/deploy`, { method: 'POST' });
			if (!res.ok) throw new Error(await res.text());
			onChanged?.();
		} catch (e) {
			error = (e as Error)?.message ?? 'Deploy failed';
		} finally {
			actionLoading = null;
		}
	}

	async function doTeardown() {
		confirmTeardown = false;
		actionLoading = 'teardown';
		error = null;
		try {
			const res = await fetch(`/api/projects/${encodeURIComponent(project.id)}/teardown`, { method: 'POST' });
			if (!res.ok) throw new Error(await res.text());
			onChanged?.();
		} catch (e) {
			error = (e as Error)?.message ?? 'Teardown failed';
		} finally {
			actionLoading = null;
		}
	}

	const totalPages = $derived(Math.max(1, Math.ceil(visitsTotal / visitsPageSize)));
</script>

<tr class="table-row-expand border-b border-slate-800/60">
	<td class="px-4 py-3">
		<button
			type="button"
			class="flex items-center gap-2 text-left"
			onclick={toggle}
			aria-expanded={expanded}
		>
			<svg
				class="h-4 w-4 text-slate-400 transition-transform {expanded ? 'rotate-90' : ''}"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
			>
				<path d="M9 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
			<div>
				<div class="font-semibold text-slate-100">{project.name}</div>
				{#if project.publicUrl}
					<a
						href={project.publicUrl}
						target="_blank"
						rel="noopener"
						class="text-xs text-cyan-400 hover:underline"
						onclick={(e) => e.stopPropagation()}
					>{project.publicUrl}</a>
				{/if}
			</div>
		</button>
	</td>
	<td class="px-4 py-3">
		<StatusBadge status={project.status ?? 'unknown'} />
	</td>
	<td class="px-4 py-3">
		<StatusBadge status={gatekeeperLabel} pulse={gatekeeperState === 'warming'} />
	</td>
	<td class="px-4 py-3 text-sm text-slate-300">
		{#if summary}
			<div class="flex flex-col">
				<span class="font-medium">{summary.today ?? project.visitsToday ?? 0} today</span>
				<span class="text-xs text-slate-500">{summary.last7d ?? project.visits7d ?? 0} / 7d</span>
			</div>
		{:else}
			<span class="text-slate-500">—</span>
		{/if}
	</td>
	<td class="px-4 py-3">
		<div class="flex flex-wrap items-center gap-2">
			<button
				type="button"
				class="btn btn-primary btn-sm"
				disabled={actionLoading !== null || gatekeeperState === 'ready' || gatekeeperState === 'warming'}
				onclick={doDeploy}
			>
				{#if actionLoading === 'deploy'}
					<span class="animate-spin-slow inline-block h-3 w-3 rounded-full border-2 border-slate-900 border-t-transparent"></span>
				{/if}
				Deploy
			</button>
			<button
				type="button"
				class="btn btn-danger btn-sm"
				disabled={actionLoading !== null || project.gatekeeper === null || project.gatekeeper === undefined}
				onclick={() => (confirmTeardown = true)}
			>
				Teardown
			</button>
		</div>
	</td>
</tr>

{#if expanded}
	<tr class="bg-slate-900/40">
		<td colspan={columns} class="px-4 py-4">
			<div class="space-y-3">
				{#if error}
					<div class="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>
				{/if}

				<!-- summary chips -->
				{#if summary}
					<div class="flex flex-wrap gap-2">
						{#each (summary.topCountries ?? []) as c}
							<span class="inline-flex items-center gap-1.5 rounded-full bg-slate-800/70 px-2.5 py-1 text-xs text-slate-300 ring-1 ring-slate-700">
								<CountryFlag code={c.code} name={c.name} size={14} />
								{c.name ?? c.code}
								<span class="text-slate-500">{c.count}</span>
							</span>
						{/each}
					</div>
				{/if}

				<div class="table-scroll rounded-xl border border-slate-800/60">
					<table class="w-full text-sm">
						<thead class="bg-slate-900/60 text-xs uppercase tracking-wide text-slate-400">
							<tr>
								<th class="px-3 py-2 text-left">Time</th>
								<th class="px-3 py-2 text-left">IP</th>
								<th class="px-3 py-2 text-left">Country</th>
								<th class="px-3 py-2 text-left">Path</th>
								<th class="px-3 py-2 text-left">Status</th>
								<th class="px-3 py-2 text-left">User Agent</th>
							</tr>
						</thead>
						<tbody>
							{#if visitsLoading}
								{#each Array(4) as _}
									<tr>
										<td colspan="6" class="px-3 py-3">
											<div class="skeleton h-4 w-full"></div>
										</td>
									</tr>
								{/each}
							{:else if visits.length === 0}
								<tr>
									<td colspan="6" class="px-3 py-6 text-center text-slate-500">
										No visits yet — see docs/VISITOR_TRACKING.md
									</td>
								</tr>
							{:else}
								{#each visits as v}
									<tr class="border-t border-slate-800/40">
										<td class="px-3 py-2 text-xs text-slate-400 whitespace-nowrap">
											{new Date(v.ts ?? v.timestamp ?? Date.now()).toLocaleString()}
										</td>
										<td class="px-3 py-2 font-mono text-xs text-slate-300">
											{v.ip}
											{#if isPrivateIp(v.ip)}
												<span class="ml-1 inline-flex items-center rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-300 ring-1 ring-amber-500/30" title="Local/proxy address (Docker or LAN). Configure the project nginx to log $http_x_forwarded_for to capture real visitor IPs.">local</span>
											{/if}
										</td>
										<td class="px-3 py-2">
											<span class="inline-flex items-center gap-1.5">
												<CountryFlag code={v.country_code ?? v.countryCode} name={v.country_name ?? v.countryName} size={14} />
												<span class="text-xs text-slate-300">{v.country_name ?? v.countryCode ?? '—'}</span>
											</span>
										</td>
										<td class="px-3 py-2 text-xs text-slate-300 max-w-[200px] truncate">{v.path ?? '/'}</td>
										<td class="px-3 py-2 text-xs text-slate-300">{v.status ?? '—'}</td>
										<td class="px-3 py-2 text-xs text-slate-500 max-w-[240px] truncate">{v.user_agent ?? v.userAgent ?? ''}</td>
									</tr>
								{/each}
							{/if}
						</tbody>
					</table>
				</div>

				{#if visits.length > 0 && visits.every((v) => isPrivateIp(v.ip))}
					<p class="text-xs text-slate-500">All IPs above are local/proxy addresses. To capture real visitor IPs, configure the project's nginx access log to include $http_x_forwarded_for (see docs/VISITOR_TRACKING.md).</p>
				{/if}

				{#if visitsTotal > visitsPageSize}
					<div class="flex items-center justify-between text-xs text-slate-400">
						<span>Page {visitsPage} of {totalPages} · {visitsTotal} visits</span>
						<div class="flex gap-2">
							<button
								class="btn btn-ghost btn-sm"
								disabled={visitsPage <= 1 || visitsLoading}
								onclick={() => loadVisits(visitsPage - 1)}
							>Prev</button>
							<button
								class="btn btn-ghost btn-sm"
								disabled={visitsPage >= totalPages || visitsLoading}
								onclick={() => loadVisits(visitsPage + 1)}
							>Next</button>
						</div>
					</div>
				{/if}
			</div>
		</td>
	</tr>
{/if}

{#if confirmTeardown}
	<!-- confirm dialog -->
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true">
		<div class="glass-strong mx-4 w-full max-w-md rounded-2xl p-6">
			<h3 class="text-lg font-bold text-slate-100">Teardown {project.name}?</h3>
			<p class="mt-2 text-sm text-slate-400">
				This will stop the project container. It can be redeployed anytime.
			</p>
			<div class="mt-5 flex justify-end gap-2">
				<button class="btn btn-ghost" onclick={() => (confirmTeardown = false)}>Cancel</button>
				<button class="btn btn-danger" onclick={doTeardown} disabled={actionLoading !== null}>
					Confirm Teardown
				</button>
			</div>
		</div>
	</div>
{/if}
