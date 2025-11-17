import { nullLogger } from "../logger";
import { ToolManager } from "../tool-manager";

describe("ToolManager", () => {
	it("executes registered tool handlers", async () => {
		const manager = new ToolManager(nullLogger);
		const handler = jest.fn().mockResolvedValue("ok");

		manager.registerTool({
			id: "echo",
			description: "test tool",
			inputSchema: { type: "object" },
			handler,
		});

		const result = await manager.callTool("echo", {});

		expect(result).toBe("ok");
		expect(handler).toHaveBeenCalledWith({});
	});

	it("throws when tool is missing", async () => {
		const manager = new ToolManager(nullLogger);

		await expect(manager.callTool("missing", {})).rejects.toThrow(
			"Tool missing not found",
		);
	});
});
