import { defineConfig } from "vitepress";
import { head } from "./config/head";
import { nav } from "./config/nav";
import { sidebar } from "./config/sidebar";

export default defineConfig({
	title: "Claude Review Automation",
	description:
		"AI-powered code review automation for GitLab and GitHub merge requests",
	base: "/claude-review-automation/",

	lastUpdated: true,
	cleanUrls: true,
	head,

	markdown: {
		lineNumbers: true,
		theme: {
			light: "github-light",
			dark: "github-dark-dimmed",
		},
	},

	themeConfig: {
		logo: "/logo.svg",
		nav,
		sidebar,

		socialLinks: [
			{
				icon: "github",
				link: "https://github.com/DGouron/claude-review-automation",
			},
		],

		editLink: {
			pattern:
				"https://github.com/DGouron/claude-review-automation/edit/master/docs/:path",
			text: "Edit this page on GitHub",
		},

		search: {
			provider: "local",
		},

		footer: {
			message: "Released under the MIT License.",
			copyright: "Copyright © 2024-present Damien Gouron",
		},
	},
});
