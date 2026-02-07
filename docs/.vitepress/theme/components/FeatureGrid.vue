<script setup lang="ts">
interface Feature {
	icon: string;
	title: string;
	description: string;
}

const features: Feature[] = [
	{
		icon: "🤖",
		title: "Multi-Agent Reviews",
		description:
			"Specialized audit agents analyze code per project — security, performance, architecture.",
	},
	{
		icon: "📡",
		title: "Real-Time Dashboard",
		description:
			"WebSocket-powered live progress tracking for every review in flight.",
	},
	{
		icon: "🔄",
		title: "Automated Follow-Ups",
		description:
			"Iterative review loop with thread resolution — no manual back-and-forth.",
	},
	{
		icon: "🔧",
		title: "MCP Integration",
		description:
			"Structured MCP tools for progress reporting, thread management, and actions.",
	},
	{
		icon: "⚡",
		title: "Smart Queue",
		description:
			"Concurrency control, deduplication, and memory guards keep reviews reliable.",
	},
	{
		icon: "🌐",
		title: "Multi-Platform",
		description:
			"Works with GitLab and GitHub out of the box — zero API tokens needed.",
	},
];
</script>

<template>
	<section class="feature-section">
		<div class="feature-grid">
			<article
				v-for="feature in features"
				:key="feature.title"
				class="feature-card"
			>
				<span class="feature-icon">{{ feature.icon }}</span>
				<h3 class="feature-title">{{ feature.title }}</h3>
				<p class="feature-description">{{ feature.description }}</p>
			</article>
		</div>
	</section>
</template>

<style scoped>
.feature-section {
	padding: 4rem 1.5rem;
	max-width: 1200px;
	margin: 0 auto;
}

.feature-grid {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 1.5rem;
}

.feature-icon {
	font-size: 1.75rem;
	display: block;
	margin-bottom: 0.75rem;
}

.feature-title {
	font-size: 1.1rem;
	font-weight: 600;
	margin-bottom: 0.5rem;
	color: var(--vp-c-text-1);
}

.feature-description {
	font-size: 0.95rem;
	color: var(--vp-c-text-2);
	line-height: 1.6;
}

@media (max-width: 768px) {
	.feature-grid {
		grid-template-columns: 1fr;
	}

	.feature-section {
		padding: 2rem 1rem;
	}
}
</style>
