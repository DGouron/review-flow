<script setup lang="ts">
import { VPButton } from "vitepress/theme";

interface Step {
	number: number;
	title: string;
	code: string;
}

const steps: Step[] = [
	{
		number: 1,
		title: "Install",
		code: "yarn add review-flow",
	},
	{
		number: 2,
		title: "Configure",
		code: "cp config.example.json config.json",
	},
	{
		number: 3,
		title: "Run",
		code: "yarn dev",
	},
];
</script>

<template>
	<section class="quickstart-section">
		<h2 class="quickstart-heading">Get Up and Running in Minutes</h2>
		<div class="steps-grid">
			<div v-for="step in steps" :key="step.number" class="step">
				<span class="step-number">{{ step.number }}</span>
				<h3 class="step-title">{{ step.title }}</h3>
				<code class="step-code">{{ step.code }}</code>
			</div>
		</div>
		<div class="quickstart-cta">
			<VPButton
				tag="a"
				size="medium"
				theme="alt"
				href="/guide/quick-start"
				text="View Full Quick Start →"
			/>
		</div>
	</section>
</template>

<style scoped>
.quickstart-section {
	padding: 4rem 1.5rem;
	max-width: 1000px;
	margin: 0 auto;
	text-align: center;
}

.quickstart-heading {
	font-size: 2rem;
	font-weight: 700;
	margin-bottom: 3rem;
	color: var(--vp-c-text-1);
}

.steps-grid {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 2rem;
	margin-bottom: 2.5rem;
}

.step {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.75rem;
}

.step-number {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 48px;
	height: 48px;
	border-radius: 50%;
	background: var(--brand-primary, #06b6d4);
	color: white;
	font-size: 1.25rem;
	font-weight: 700;
}

.step-title {
	font-size: 1.1rem;
	font-weight: 600;
	color: var(--vp-c-text-1);
}

.step-code {
	font-family: var(--vp-font-family-mono);
	font-size: 0.85rem;
	padding: 0.4rem 0.75rem;
	border-radius: 6px;
	background: var(--vp-c-bg-soft);
	color: var(--vp-c-text-2);
}

.quickstart-cta {
	margin-top: 1rem;
}

@media (max-width: 768px) {
	.steps-grid {
		grid-template-columns: 1fr;
		gap: 1.5rem;
	}

	.quickstart-heading {
		font-size: 1.5rem;
	}
}
</style>
