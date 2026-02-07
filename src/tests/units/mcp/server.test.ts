import { describe, it, expect } from "vitest";
import { ReviewProgressMcpServer } from "../../../mcp/server.js";

describe("ReviewProgressMcpServer", () => {
	describe("registerTool", () => {
		it("should register a tool and make it available in tools list", () => {
			const server = new ReviewProgressMcpServer();

			server.registerTool({
				name: "get_workflow",
				description: "Get workflow status",
				inputSchema: {
					type: "object",
					properties: {
						jobId: { type: "string" },
					},
					required: ["jobId"],
				},
				handler: async () => ({ content: [{ type: "text", text: "ok" }] }),
			});

			const tools = server.listTools();

			expect(tools).toHaveLength(1);
			expect(tools[0].name).toBe("get_workflow");
			expect(tools[0].description).toBe("Get workflow status");
			expect(tools[0].inputSchema).toEqual({
				type: "object",
				properties: { jobId: { type: "string" } },
				required: ["jobId"],
			});
		});

		it("should register multiple tools", () => {
			const server = new ReviewProgressMcpServer();
			const handler = async () => ({ content: [{ type: "text" as const, text: "ok" }] });

			server.registerTool({
				name: "tool1",
				description: "First tool",
				inputSchema: { type: "object", properties: {} },
				handler,
			});
			server.registerTool({
				name: "tool2",
				description: "Second tool",
				inputSchema: { type: "object", properties: {} },
				handler,
			});
			server.registerTool({
				name: "tool3",
				description: "Third tool",
				inputSchema: { type: "object", properties: {} },
				handler,
			});

			const tools = server.listTools();

			expect(tools).toHaveLength(3);
			expect(tools.map((t) => t.name)).toEqual(["tool1", "tool2", "tool3"]);
		});
	});

	describe("callTool", () => {
		it("should execute the tool handler with provided arguments", async () => {
			const server = new ReviewProgressMcpServer();
			let receivedArgs: Record<string, unknown> | null = null;

			server.registerTool({
				name: "get_workflow",
				description: "Get workflow status",
				inputSchema: {
					type: "object",
					properties: { jobId: { type: "string" } },
					required: ["jobId"],
				},
				handler: async (args) => {
					receivedArgs = args;
					return { content: [{ type: "text", text: "workflow-result" }] };
				},
			});

			const result = await server.callTool("get_workflow", { jobId: "123" });

			expect(receivedArgs).toEqual({ jobId: "123" });
			expect(result.content[0].text).toBe("workflow-result");
			expect(result.isError).toBeUndefined();
		});

		it("should return error for unknown tool", async () => {
			const server = new ReviewProgressMcpServer();

			const result = await server.callTool("unknown_tool", {});

			expect(result.isError).toBe(true);
			expect(result.content[0].text).toBe("Unknown tool: unknown_tool");
		});
	});
});
