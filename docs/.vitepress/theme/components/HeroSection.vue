<script setup lang="ts">
import { VPButton } from "vitepress/theme";
</script>

<template>
	<section class="hero-section">
		<div class="hero-content">
			<h1 class="hero-title">
				<span class="gradient-text">AI-Powered</span>
				<br />
				Code Review Automation
			</h1>
			<p class="hero-tagline">
				Assign a reviewer — Claude reviews the code, tracks progress,
				follows up.
			</p>
			<div class="hero-actions">
				<VPButton
					tag="a"
					size="medium"
					theme="brand"
					href="/review-flow/guide/quick-start"
					text="Get Started"
				/>
				<VPButton
					tag="a"
					size="medium"
					theme="alt"
					href="https://github.com/DGouron/review-flow"
					text="View on GitHub"
				/>
			</div>
		</div>
	</section>
</template>

<style scoped>
.hero-section {
	position: relative;
	padding: 6rem 1.5rem 4rem;
	text-align: center;
	overflow: hidden;
	background: radial-gradient(
			ellipse at 20% 50%,
			rgba(6, 182, 212, 0.15) 0%,
			transparent 50%
		),
		radial-gradient(
			ellipse at 80% 20%,
			rgba(20, 184, 166, 0.1) 0%,
			transparent 50%
		),
		radial-gradient(
			ellipse at 50% 80%,
			rgba(6, 182, 212, 0.08) 0%,
			transparent 50%
		);
}

.hero-content {
	max-width: 800px;
	margin: 0 auto;
}

.hero-title {
	font-size: 3.5rem;
	font-weight: 700;
	line-height: 1.1;
	letter-spacing: -0.02em;
	margin-bottom: 1.5rem;
	color: var(--vp-c-text-1);
}

.hero-tagline {
	font-size: 1.25rem;
	color: var(--vp-c-text-2);
	margin-bottom: 2.5rem;
	max-width: 560px;
	margin-left: auto;
	margin-right: auto;
	line-height: 1.6;
}

.hero-actions {
	display: flex;
	gap: 1rem;
	justify-content: center;
	flex-wrap: wrap;
}

@media (max-width: 768px) {
	.hero-section {
		padding: 4rem 1rem 3rem;
	}

	.hero-title {
		font-size: 2.25rem;
	}

	.hero-tagline {
		font-size: 1.1rem;
	}
}
</style>
