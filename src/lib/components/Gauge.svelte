<script lang="ts">
	interface Props {
		value: number; // 0..100
		label: string;
		unit?: string;
		color?: string;
		size?: number;
	}
	let { value, label, unit = '%', color, size = 160 }: Props = $props();

	const clamped = $derived(Math.max(0, Math.min(100, value ?? 0)));

	const autoColor = $derived(
		clamped >= 85 ? '#ef4444' : clamped >= 65 ? '#f59e0b' : '#22c55e'
	);
	const strokeColor = $derived(color ?? autoColor);

	const gradId = $derived('gaugeGrad-' + label.replace(/\W+/g, '-'));
	const blurId = $derived('gaugeBlur-' + label.replace(/\W+/g, '-'));
	const cx = 80;
	const cy = 80;
	const r = 62;
	const startAngle = 225; // degrees
	const sweep = 270; // total arc degrees
	const circumference = 2 * Math.PI * r;
	const arcLen = (sweep / 360) * circumference;

	const offset = $derived(arcLen * (1 - clamped / 100));

	function polar(angleDeg: number) {
		const a = ((angleDeg - 90) * Math.PI) / 180;
		return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
	}
	const start = polar(startAngle);
	const end = polar(startAngle + sweep);

	const trackPath = `M ${start.x} ${start.y} A ${r} ${r} 0 1 1 ${end.x} ${end.y}`;

	let mounted = $state(false);
	$effect(() => {
		mounted = true;
	});
</script>

<div class="gauge flex flex-col items-center gap-2" style="width:{size}px">
	<div class="relative">
		<svg viewBox="0 0 160 160" role="img" aria-label="{label}: {clamped.toFixed(0)}{unit}">
			<defs>
				<linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
					<stop offset="0%" stop-color={strokeColor} stop-opacity="0.9" />
					<stop offset="100%" stop-color={strokeColor} stop-opacity="0.5" />
				</linearGradient>
				<filter id={blurId}>
					<feGaussianBlur stdDeviation="3" />
				</filter>
			</defs>
			<!-- track -->
			<path d={trackPath} class="gauge-track" stroke-width="12" />
			<!-- glow -->
			<path
				d={trackPath}
				class="gauge-glow"
				stroke={strokeColor}
				stroke-width="12"
				stroke-dasharray={arcLen}
				stroke-dashoffset={mounted ? offset : arcLen}
				filter="url(#{blurId})"
			/>
			<!-- progress -->
			<path
				class="gauge-progress"
				d={trackPath}
				stroke="url(#{gradId})"
				stroke-width="12"
				stroke-dasharray={arcLen}
				stroke-dashoffset={mounted ? offset : arcLen}
				style="color:{strokeColor}"
			/>
			<!-- center text -->
			<text x={cx} y={cy - 4} text-anchor="middle" class="fill-slate-100" font-size="26" font-weight="700">
				{clamped.toFixed(0)}
			</text>
			<text x={cx} y={cy + 16} text-anchor="middle" class="fill-slate-400" font-size="11" font-weight="500">
				{unit}
			</text>
		</svg>
	</div>
	<div class="text-center">
		<div class="text-sm font-semibold text-slate-200">{label}</div>
		<div class="text-xs text-slate-500">{clamped.toFixed(1)}{unit}</div>
	</div>
</div>