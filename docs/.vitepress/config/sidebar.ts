import type { DefaultTheme } from "vitepress";

const guideSidebar: DefaultTheme.SidebarItem[] = [
	{
		text: "Guide",
		items: [
			{ text: "Overview", link: "/guide/" },
			{ text: "Quick Start", link: "/guide/quick-start" },
			{ text: "Project Configuration", link: "/guide/project-config" },
			{ text: "Review Skills", link: "/guide/review-skills" },
			{ text: "Troubleshooting", link: "/guide/troubleshooting" },
		],
	},
];

const referenceSidebar: DefaultTheme.SidebarItem[] = [
	{
		text: "Reference",
		items: [
			{ text: "Overview", link: "/reference/" },
			{ text: "Configuration", link: "/reference/config" },
			{ text: "Markers", link: "/reference/markers" },
			{ text: "MCP Tools", link: "/reference/mcp-tools" },
			{
				text: "Ubiquitous Language",
				link: "/reference/ubiquitous-language",
			},
		],
	},
];

const architectureSidebar: DefaultTheme.SidebarItem[] = [
	{
		text: "Architecture",
		items: [
			{ text: "Overview", link: "/architecture/" },
			{ text: "Current Architecture", link: "/architecture/current" },
			{ text: "Target Architecture", link: "/architecture/target" },
		],
	},
	{
		text: "MCP",
		items: [
			{
				text: "MCP Specification",
				link: "/architecture/mcp/specification",
			},
			{
				text: "MCP Architecture",
				link: "/architecture/mcp/architecture",
			},
		],
	},
];

const deploymentSidebar: DefaultTheme.SidebarItem[] = [
	{
		text: "Deployment",
		items: [{ text: "Deployment Guide", link: "/deployment/" }],
	},
];

export const sidebar: DefaultTheme.Sidebar = {
	"/guide/": guideSidebar,
	"/reference/": referenceSidebar,
	"/architecture/": architectureSidebar,
	"/deployment/": deploymentSidebar,
};
