import type {
	McpToolDefinition,
	McpToolInfo,
	McpToolResult,
} from "./types.js";

export class ReviewProgressMcpServer {
	private tools = new Map<string, McpToolDefinition>();

	registerTool(tool: McpToolDefinition): void {
		this.tools.set(tool.name, tool);
	}

	listTools(): McpToolInfo[] {
		return Array.from(this.tools.values()).map((tool) => ({
			name: tool.name,
			description: tool.description,
			inputSchema: tool.inputSchema,
		}));
	}

	async callTool(
		name: string,
		args: Record<string, unknown>,
	): Promise<McpToolResult> {
		const tool = this.tools.get(name);
		if (!tool) {
			return {
				content: [{ type: "text", text: `Unknown tool: ${name}` }],
				isError: true,
			};
		}
		return tool.handler(args);
	}
}
