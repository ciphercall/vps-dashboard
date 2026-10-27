<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import { LogOut, Server } from 'lucide-svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const isLogin = $derived($page.url.pathname === '/login');
</script>

<svelte:head>
	<title>VPS Operations Dashboard</title>
	<meta name="description" content="Consolidated VPS health, project status and visitor analytics" />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="min-h-screen">
	{#if !isLogin}
		<header class="sticky top-0 z-40 border-b border-slate-800/60 bg-slate-950/70 backdrop-blur-xl">
			<div class="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
				<a href="/" class="flex items-center gap-3">
					<div class="gradient-border flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900/80">
						<Server class="h-5 w-5 text-cyan-400" />
					</div>
					<div class="leading-tight">
						<div class="text-sm font-bold gradient-text">VPS Operations</div>
						<div class="text-[11px] text-slate-500">169.58.90.13 · Contabo Cloud VPS 6</div>
					</div>
				</a>
				<div class="flex items-center gap-3">
					<div class="hidden items-center gap-2 rounded-full bg-emerald-400/10 px-3 py-1.5 ring-1 ring-emerald-400/30 sm:flex">
						<span class="pulse-dot h-2 w-2 rounded-full bg-emerald-400 text-emerald-400"></span>
						<span class="text-xs font-semibold text-emerald-300">Live</span>
					</div>
					<a
						href="/logout"
						class="btn btn-ghost btn-sm"
						data-sveltekit-reload
					>
						<LogOut class="h-4 w-4" />
						<span class="hidden sm:inline">Logout</span>
					</a>
				</div>
			</div>
		</header>
	{/if}

	<main class="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
		{@render children()}
	</main>

	<footer class="mx-auto max-w-7xl px-4 pb-8 text-center text-xs text-slate-600 sm:px-6">
		VPS Operations Dashboard · SvelteKit · Tailwind 4
	</footer>
</div>