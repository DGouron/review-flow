import { defineConfig } from "vitepress";
import { head } from "./config/head";
import { nav } from "./config/nav";
import { sidebar } from "./config/sidebar";

export default defineConfig({
	title: "Reviewflow",
	description:
		"AI-powered code review automation for GitLab and GitHub",
	base: "/reviewflow/",

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
				link: "https://github.com/DGouron/reviewflow",
			},
		],

		editLink: {
			pattern:
				"https://github.com/DGouron/reviewflow/edit/master/docs/:path",
			text: "Edit this page on GitHub",
		},

		search: {
			provider: "local",
		},

		footer: {
			message: "Released under the MIT License.",
			copyright: "Copyright © 2026-present Damien Gouron",
		},
	},
});
