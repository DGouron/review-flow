import type { HeadConfig } from "vitepress";

const siteUrl = "https://dgouron.github.io/claude-review-automation/";
const title = "Claude Review Automation";
const description =
	"AI-powered code review automation for GitLab and GitHub merge requests";

export const head: HeadConfig[] = [
	["link", { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" }],
	["meta", { name: "theme-color", content: "#06b6d4" }],

	// Open Graph
	["meta", { property: "og:type", content: "website" }],
	["meta", { property: "og:title", content: title }],
	["meta", { property: "og:description", content: description }],
	["meta", { property: "og:url", content: siteUrl }],
	[
		"meta",
		{
			property: "og:image",
			content: `${siteUrl}og-image.svg`,
		},
	],

	// Twitter
	["meta", { name: "twitter:card", content: "summary_large_image" }],
	["meta", { name: "twitter:title", content: title }],
	["meta", { name: "twitter:description", content: description }],
	[
		"meta",
		{
			name: "twitter:image",
			content: `${siteUrl}og-image.svg`,
		},
	],
];
