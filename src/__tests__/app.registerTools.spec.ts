import { App } from "../app";
import type { Config } from "../config";
import { nullLogger } from "../logger";
import {
	type LSPMethods,
	getLspMethods,
	lspMethodHandler,
} from "../lsp-methods";
import type { Tool } from "../tool-manager";

jest.mock("../lsp-methods", () => ({
	getLspMethods: jest.fn(),
	lspMethodHandler: jest.fn(),
	openFileContents: jest.fn(),
}));

const mockGetLspMethods = getLspMethods as jest.MockedFunction<
	typeof getLspMethods
>;

type TestableApp = App & {
	registerTools: () => Promise<void>;
	toolManager: {
		getTools: () => Tool[];
	};
};

function getTestableApp(app: App): TestableApp {
	return app as TestableApp;
}

function createConfig(lsps: Config["lsps"]): Config {
	return {
		lsps,
	};
}

function createMethod(id: string): LSPMethods {
	return {
		id,
		description: `method: ${id}`,
		inputSchema: {
			type: "object",
			properties: {
				textDocument: {
					type: "object",
				},
				partialResultToken: {
					type: "string",
				},
			},
		},
	};
}

describe("App.registerTools", () => {
	beforeEach(() => {
		jest.resetAllMocks();
	});

	it("registers builtin tools and dynamic methods without LSP override when only one LSP is configured", async () => {
		mockGetLspMethods.mockResolvedValue([
			createMethod("textDocument/documentSymbol"),
		]);

		const app = new App(
			createConfig([
				{
					id: "typescript",
					languages: ["typescript"],
					extensions: ["ts"],
					command: "node",
					args: ["-v"],
				},
			]),
			nullLogger,
		);

		const testApp = getTestableApp(app);
		await testApp.registerTools();
		const tools = testApp.toolManager.getTools();

		const builtinIds = tools.filter((tool) =>
			["lsp_info", "file_contents_to_uri"].includes(tool.id),
		);
		expect(builtinIds).toHaveLength(2);

		const dynamicTool = tools.find(
			(tool) => tool.id === "textDocument_documentSymbol",
		);
		expect(dynamicTool).toBeDefined();
		if (!dynamicTool) {
			throw new Error("dynamic tool was not registered");
		}
		expect(dynamicTool.inputSchema.properties?.lsp).toBeUndefined();
		expect(
			dynamicTool.inputSchema.properties?.partialResultToken,
		).toBeUndefined();
	});

	it("injects optional lsp selector when multiple LSPs are configured", async () => {
		mockGetLspMethods.mockResolvedValue([
			createMethod("textDocument/documentSymbol"),
		]);

		const app = new App(
			createConfig([
				{
					id: "typescript",
					languages: ["TypeScript"],
					extensions: ["ts"],
					command: "node",
					args: ["-v"],
				},
				{
					id: "python",
					languages: ["python"],
					extensions: ["py"],
					command: "python",
					args: ["-V"],
				},
			]),
			nullLogger,
		);

		const testApp = getTestableApp(app);
		await testApp.registerTools();
		const tools = testApp.toolManager.getTools();
		const dynamicTool = tools.find(
			(tool) => tool.id === "textDocument_documentSymbol",
		);
		expect(dynamicTool).toBeDefined();
		if (!dynamicTool) {
			throw new Error("dynamic tool was not registered");
		}

		const lspProperty = dynamicTool.inputSchema.properties?.lsp;
		expect(lspProperty).toMatchObject({
			type: "string",
			enum: ["typescript", "python"],
		});
		expect(dynamicTool.inputSchema.properties).not.toHaveProperty(
			"partialResultToken",
		);
		expect(typeof lspProperty?.description).toBe("string");
	});
});
