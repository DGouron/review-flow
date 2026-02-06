import { startMcpServer } from "./mcp/mcpServerStdio.js";

startMcpServer().catch((error) => {
	console.error("Failed to start MCP server:", error);
	process.exit(1);
});
