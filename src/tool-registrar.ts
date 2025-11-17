import type { JSONSchema4, JSONSchema4TypeName } from "json-schema";
import type { Logger } from "vscode-jsonrpc";
import type { LspClient } from "./lsp";
import type { LspManager } from "./lsp-manager";
import {
	type LSPMethods,
	lspMethodHandler,
	openFileContents,
} from "./lsp-methods";
import type { LspSelector } from "./lsp-selector";
import type { ToolManager } from "./tool-manager";

export interface ToolRegistrar {
	registerAll(methods: LSPMethods[]): void;
}

export class DefaultToolRegistrar implements ToolRegistrar {
	public constructor(
		private readonly toolManager: ToolManager,
		private readonly lspManager: LspManager,
		private readonly selector: LspSelector,
		private readonly logger: Logger,
		private readonly fileOpener: typeof openFileContents = openFileContents,
	) {}

	public registerAll(methods: LSPMethods[]): void {
		this.registerBuiltInTools();
		this.registerDynamicTools(methods);
	}

	private registerBuiltInTools() {
		this.toolManager.registerTool({
			id: "lsp_info",
			description:
				"Returns information about the the LSP tools available. This is useful for debugging which programming languages are supported.",
			inputSchema: {
				type: "object" as const,
			},
			handler: async () => {
				const result = this.lspManager.getLsps().map((lsp) => {
					const started = lsp.isStarted();
					return {
						id: lsp.id,
						languages: lsp.languages,
						extensions: lsp.extensions,
						started: started
							? true
							: `Not started. LSP will start automatically when needed, such as when analyzing a file with extensions ${lsp.extensions.join(", ")}.`,
						capabilities: started
							? lsp.capabilities
							: "LSP not started. Capabilities will be available when started.",
					};
				});

				return JSON.stringify(result, null, 2);
			},
		});

		this.toolManager.registerTool({
			id: "file_contents_to_uri",
			description:
				"Creates a URI given some file contents to be used in the LSP methods that require a URI. This is only required if the file is not on the filesystem. Otherwise you may pass the file path directly.",
			inputSchema: {
				type: "object" as const,
				properties: {
					file_contents: {
						type: "string",
						description: "The contents of the file",
					},
					programming_language: {
						type: "string",
						description: "The programming language of the file",
					},
				},
				required: ["file_contents"],
			},
			handler: async (args) => {
				const { file_contents, programming_language } = args;
				const lsp =
					this.lspManager.getLspByLanguage(programming_language) ||
					this.lspManager.getDefaultLsp();
				if (!lsp) {
					throw new Error(`No LSP found for language: ${programming_language}`);
				}
				const uri = `mem://${Math.random().toString(36).substring(2, 15)}.${lsp.id}`;

				await this.fileOpener(lsp, uri, file_contents);

				return uri;
			},
		});
	}

	private registerDynamicTools(methods: LSPMethods[]) {
		const sorted = [...methods].sort((a, b) => a.id.localeCompare(b.id));
		const lspProperty = this.createLspProperty();

		for (const method of sorted) {
			const inputSchema = this.removeInvariants(method.inputSchema);
			if (inputSchema.properties && lspProperty) {
				inputSchema.properties[lspProperty.name] = lspProperty;
			}

			this.toolManager.registerTool({
				id: method.id.replace("/", "_"),
				description: method.description,
				inputSchema,
				handler: (args) => {
					const lsp = this.selector.select({
						args,
						lspManager: this.lspManager,
						lspPropertyName: lspProperty?.name,
					});

					return lspMethodHandler(lsp, method.id, args);
				},
			});
		}
	}

	private createLspProperty(): JSONSchema4 | undefined {
		const lsps = this.lspManager.getLsps();
		if (lsps.length <= 1) {
			return undefined;
		}

		return {
			type: "string",
			name: "lsp",
			description: `The LSP to use to execute this method. Options are: ${lsps
				.map(
					(lsp) =>
						`  ${lsp.id} for the programming languages ${lsp.languages.join(", ")}`,
				)
				.join("\n")}`,
			enum: lsps.map((lsp) => lsp.id),
		};
	}

	private removeInvariants(inputSchema: JSONSchema4): JSONSchema4 {
		let type = inputSchema.type;
		if (type && Array.isArray(type)) {
			type = type.includes("string")
				? "string"
				: (type[0] as JSONSchema4["type"]);
		}
		return {
			...inputSchema,
			type,
			properties: inputSchema.properties
				? Object.fromEntries(
						Object.entries(inputSchema.properties).map(([key, value]) => [
							key,
							this.removeInvariants(value),
						]),
					)
				: undefined,
		};
	}
}
