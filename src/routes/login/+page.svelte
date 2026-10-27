<script lang="ts">
	import { goto } from '$app/navigation';
	import { Lock, Server, User } from 'lucide-svelte';

	let username = $state('');
	let password = $state('');
	let loading = $state(false);
	let error = $state<string | null>(null);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		loading = true;
		error = null;
		try {
			const res = await fetch('/api/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username, password })
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data?.message ?? 'Invalid credentials');
			}
			await goto('/', { invalidateAll: true });
		} catch (err) {
			error = (err as Error)?.message ?? 'Login failed';
		} finally {
			loading = false;
		}
	}
</script>

<div class="flex min-h-[80vh] items-center justify-center">
	<div class="w-full max-w-md">
		<div class="mb-8 text-center">
			<div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-indigo-500 shadow-glow">
				<Server class="h-8 w-8 text-slate-950" />
			</div>
			<h1 class="text-2xl font-bold gradient-text">VPS Operations Dashboard</h1>
			<p class="mt-1 text-sm text-slate-500">Sign in to continue</p>
		</div>

		<form onsubmit={submit} class="glass-strong rounded-2xl p-6 space-y-4">
			{#if error}
				<div class="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
					{error}
				</div>
			{/if}

			<label class="block">
				<span class="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Username</span>
				<div class="relative">
					<User class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
					<input
						class="input pl-9"
						type="text"
						autocomplete="username"
						bind:value={username}
						required
						disabled={loading}
					/>
				</div>
			</label>

			<label class="block">
				<span class="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Password</span>
				<div class="relative">
					<Lock class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
					<input
						class="input pl-9"
						type="password"
						autocomplete="current-password"
						bind:value={password}
						required
						disabled={loading}
					/>
				</div>
			</label>

			<button type="submit" class="btn btn-primary w-full justify-center" disabled={loading}>
				{#if loading}
					<span class="animate-spin-slow inline-block h-4 w-4 rounded-full border-2 border-slate-900 border-t-transparent"></span>
					Signing in…
				{:else}
					Sign in
				{/if}
			</button>
		</form>
	</div>
</div>