<script setup lang="ts">
import FeatureGrid from "./FeatureGrid.vue";
import HeroSection from "./HeroSection.vue";
</script>

<template>
	<div class="home-page">
		<HeroSection />
		<FeatureGrid />
	</div>
</template>

<style scoped>
.home-page {
	min-height: 100vh;
}
</style>
