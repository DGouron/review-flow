import type { McpToolResult } from "../../../mcp/types.js";
import type { ReviewPhase } from "../../../entities/progress/progress.type.js";
import {
	setPhase,
	type SetPhaseDependencies,
} from "../../../usecases/mcp/setPhase.usecase.js";

const VALID_PHASES: ReviewPhase[] = [
	"initializing",
	"agents-running",
	"synthesizing",
	"publishing",
	"completed",
];

function isValidPhase(phase: unknown): phase is ReviewPhase {
	return typeof phase === "string" && VALID_PHASES.includes(phase as ReviewPhase);
}

export function createSetPhaseHandler(
	deps: SetPhaseDependencies,
): (args: Record<string, unknown>) => McpToolResult {
	return (args: Record<string, unknown>): McpToolResult => {
		const jobId = args.jobId;
		const phase = args.phase;

		if (typeof jobId !== "string" || !jobId) {
			return {
				content: [{ type: "text", text: "Error: jobId is required" }],
				isError: true,
			};
		}

		if (!phase) {
			return {
				content: [{ type: "text", text: "Error: phase is required" }],
				isError: true,
			};
		}

		if (!isValidPhase(phase)) {
			return {
				content: [
					{
						type: "text",
						text: `Error: Invalid phase '${phase}'. Valid phases: ${VALID_PHASES.join(", ")}`,
					},
				],
				isError: true,
			};
		}

		const result = setPhase(jobId, phase, deps);

		if (!result.success) {
			return {
				content: [{ type: "text", text: `Error: ${result.error}` }],
				isError: true,
			};
		}

		return {
			content: [
				{
					type: "text",
					text: JSON.stringify(
						{
							success: true,
							phase: result.phase,
							overallProgress: result.overallProgress,
						},
						null,
						2,
					),
				},
			],
		};
	};
}
