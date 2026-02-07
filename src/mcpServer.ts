import { startMcpServer } from "./mcp/mcpServerStdio.js";
import { mcpLogger } from "./mcp/mcpLogger.js";

mcpLogger.info("MCP Server entry point called", {
	argv: process.argv,
	env: {
		MCP_JOB_ID: process.env.MCP_JOB_ID,
		MCP_LOCAL_PATH: process.env.MCP_LOCAL_PATH,
		MCP_MERGE_REQUEST_ID: process.env.MCP_MERGE_REQUEST_ID,
		MCP_JOB_TYPE: process.env.MCP_JOB_TYPE,
	},
});

startMcpServer().catch((error) => {
	mcpLogger.error("Failed to start MCP server", { error: String(error) });
	process.exit(1);
});
