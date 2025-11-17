import * as fs from "node:fs/promises";
import * as protocol from "vscode-languageserver-protocol";
import type { LspClient } from "../lsp";
import * as lspMethods from "../lsp-methods";

jest.mock("node:fs/promises", () => ({
	readFile: jest.fn().mockResolvedValue("file contents"),
}));

describe("lsp-methods", () => {
	afterEach(() => {
		jest.clearAllMocks();
	});

	function createClient(): LspClient {
		return {
			id: "test",
			languages: ["typescript"],
			extensions: ["ts"],
			capabilities: undefined,
			start: jest.fn(),
			isStarted: jest.fn(() => true),
			dispose: jest.fn(),
			sendRequest: jest.fn(),
			sendNotification: jest.fn(),
		};
	}

	it("sends DidOpen notification with provided contents", async () => {
		const client = createClient();

		await lspMethods.openFileContents(client, "mem://doc.ts", "const a = 1;");

		expect(client.sendNotification).toHaveBeenCalledWith(
			protocol.DidOpenTextDocumentNotification.method,
			expect.objectContaining({
				textDocument: expect.objectContaining({
					uri: "mem://doc.ts",
					text: "const a = 1;",
				}),
			}),
		);
	});

	it("loads file contents when URI points to local file", async () => {
		const client = createClient();
		const openSpy = jest.spyOn(lspMethods, "openFileContents");
		const args = {
			textDocument: {
				uri: "file:///tmp/sample.ts",
			},
		};

		await lspMethods.lspMethodHandler(client, "textDocument/definition", args);

		expect(fs.readFile).toHaveBeenCalledWith(expect.stringContaining("sample.ts"), "utf8");
			expect(client.sendRequest).toHaveBeenCalledWith(
			"textDocument/definition",
			expect.objectContaining({
				textDocument: expect.objectContaining({
					uri: expect.stringContaining("sample.ts"),
				}),
			}),
		);
	});

	it("skips disk reads for mem URIs", async () => {
		const client = createClient();
		const openSpy = jest.spyOn(lspMethods, "openFileContents");
		const args = {
			textDocument: {
				uri: "mem://virtual.ts",
			},
		};

		await lspMethods.lspMethodHandler(client, "textDocument/hover", args);

		expect(fs.readFile).not.toHaveBeenCalled();
		expect(openSpy).not.toHaveBeenCalled();
		expect(client.sendRequest).toHaveBeenCalledWith(
			"textDocument/hover",
			expect.objectContaining({ textDocument: { uri: "mem://virtual.ts" } }),
		);
	});
});

