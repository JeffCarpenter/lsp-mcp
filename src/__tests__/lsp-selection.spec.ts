import type { LspClient } from "../lsp";
import type { LspManager } from "../lsp-manager";
import { DefaultLspSelector } from "../lsp-selector";

function stubClient(id: string): LspClient {
	return {
		id,
		languages: [id],
		extensions: [id],
		capabilities: undefined,
		start: jest.fn(),
		isStarted: jest.fn(() => true),
		dispose: jest.fn(),
		sendRequest: jest.fn(),
		sendNotification: jest.fn(),
	};
}

function createManager(overrides: Partial<LspManager> = {}): LspManager {
	const defaultClient = stubClient("default");
	const manager: Partial<LspManager> = {
		getDefaultLsp: () => defaultClient,
		getLsp: jest.fn(() => undefined),
		getLspByLanguage: jest.fn(() => undefined),
		getLspByExtension: jest.fn(() => undefined),
		...overrides,
	};
	return manager as LspManager;
}

describe("DefaultLspSelector", () => {
	it("returns explicit LSP id", () => {
		const chosen = stubClient("typescript");
		const manager = createManager({
			getLsp: jest.fn(() => chosen),
		});
		const selector = new DefaultLspSelector();

		const result = selector.select({
			args: { lsp: "typescript" },
			lspManager: manager,
			lspPropertyName: "lsp",
		});

		expect(result).toBe(chosen);
		expect(manager.getLsp).toHaveBeenCalledWith("typescript");
	});

	it("falls back to language identifier", () => {
		const chosen = stubClient("python");
		const manager = createManager({ getLspByLanguage: jest.fn(() => chosen) });
		const selector = new DefaultLspSelector();

		const result = selector.select({
			args: { lsp: "Python" },
			lspManager: manager,
			lspPropertyName: "lsp",
		});

		expect(result).toBe(chosen);
		expect(manager.getLspByLanguage).toHaveBeenCalledWith("Python");
	});

	it("uses extension from textDocument uri", () => {
		const chosen = stubClient("ts-lsp");
		const manager = createManager({ getLspByExtension: jest.fn(() => chosen) });
		const selector = new DefaultLspSelector();

		const result = selector.select({
			args: { lsp: "", textDocument: { uri: "file:///tmp/example.ts" } },
			lspManager: manager,
			lspPropertyName: "lsp",
		});

		expect(result).toBe(chosen);
		expect(manager.getLspByExtension).toHaveBeenCalledWith("ts");
	});

	it("falls back to default when no hints", () => {
		const defaultClient = stubClient("fallback");
		const manager = createManager({ getDefaultLsp: () => defaultClient });
		const selector = new DefaultLspSelector();

		const result = selector.select({ args: {}, lspManager: manager });

		expect(result).toBe(defaultClient);
	});
});
