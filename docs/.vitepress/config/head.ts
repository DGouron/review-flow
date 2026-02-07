import type { HeadConfig } from "vitepress";

export const head: HeadConfig[] = [
	["link", { rel: "icon", href: "/favicon.svg" }],
	["meta", { name: "theme-color", content: "#06b6d4" }],
	[
		"meta",
		{ property: "og:title", content: "Claude Review Automation" },
	],
	[
		"meta",
		{
			property: "og:description",
			content:
				"AI-powered code review automation for GitLab and GitHub merge requests",
		},
	],
	[
		"meta",
		{
			property: "og:url",
			content: "https://dgouron.github.io/claude-review-automation/",
		},
	],
];
