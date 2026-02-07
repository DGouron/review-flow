export interface McpToolInputSchema {
	type: "object";
	properties: Record<string, { type: string; description?: string }>;
	required?: string[];
}

export interface McpToolResult {
	content: Array<{ type: "text"; text: string }>;
	isError?: boolean;
}

export interface McpToolDefinition {
	name: string;
	description: string;
	inputSchema: McpToolInputSchema;
	handler: (args: Record<string, unknown>) => Promise<McpToolResult>;
}

export interface McpToolInfo {
	name: string;
	description: string;
	inputSchema: McpToolInputSchema;
}
