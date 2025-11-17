import { nullLogger } from "../logger";
import type { LspClient } from "../lsp";
import { LspManager } from "../lsp-manager";
import type { LSPMethods } from "../lsp-methods";
import { DefaultLspSelector } from "../lsp-selector";
import { ToolManager } from "../tool-manager";
import { DefaultToolRegistrar } from "../tool-registrar";
describe("DefaultToolRegistrar", () => {
	const selector = new DefaultLspSelector();

	function createLsp(id: string, languages: string[]): LspClient {
		return {
			id,
			languages,
			extensions: languages.map((lang) => lang.toLowerCase()),
			capabilities: undefined,
			start: jest.fn(),
			isStarted: jest.fn(() => false),
			dispose: jest.fn(),
			sendRequest: jest.fn(),
			sendNotification: jest.fn(),
		};
	}

	function createMethod(id: string): LSPMethods {
		return {
			id,
			description: `method: ${id}`,
			inputSchema: {
				type: "object",
				properties: {
					textDocument: { type: "object" },
					partialResultToken: { type: "string" },
				},
			},
		};
	}

	it("registers built-in tools and dynamic methods for single LSP", () => {
		const toolManager = new ToolManager(nullLogger);
		const lspManager = new LspManager([
			createLsp("typescript", ["TypeScript"]),
		]);
		const registrar = new DefaultToolRegistrar(
			toolManager,
			lspManager,
			selector,
			nullLogger,
			jest.fn(),
		);

		registrar.registerAll([createMethod("textDocument/documentSymbol")]);

		const tools = toolManager.getTools();
		const builtinIds = tools.filter((tool) =>
			["lsp_info", "file_contents_to_uri"].includes(tool.id),
		);
		expect(builtinIds).toHaveLength(2);

		const dynamicTool = tools.find(
			(tool) => tool.id === "textDocument_documentSymbol",
		);
		expect(dynamicTool).toBeDefined();
		if (!dynamicTool) {
			throw new Error("dynamic tool missing");
		}
		expect(dynamicTool.inputSchema.properties?.lsp).toBeUndefined();
	});

	it("injects optional lsp selector when multiple LSPs exist", () => {
		const toolManager = new ToolManager(nullLogger);
		const lsps = [
			createLsp("typescript", ["TypeScript"]),
			createLsp("python", ["python"]),
		];
		const lspManager = new LspManager(lsps);
		const registrar = new DefaultToolRegistrar(
			toolManager,
			lspManager,
			selector,
			nullLogger,
			jest.fn(),
		);

		registrar.registerAll([createMethod("textDocument/documentSymbol")]);

		const dynamicTool = toolManager
			.getTools()
			.find((tool) => tool.id === "textDocument_documentSymbol");
		expect(dynamicTool?.inputSchema.properties?.lsp).toMatchObject({
			enum: ["typescript", "python"],
		});
	});
});
