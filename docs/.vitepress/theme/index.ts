import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";
import HomePage from "./components/HomePage.vue";
import "./style.css";

export default {
	extends: DefaultTheme,
	enhanceApp({ app }) {
		app.component("HomePage", HomePage);
	},
} satisfies Theme;
