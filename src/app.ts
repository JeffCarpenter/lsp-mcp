import type { Server as McpServer } from "@modelcontextprotocol/sdk/server/index.js";
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { JSONSchema4, JSONSchema4TypeName } from "json-schema";
import type { Logger } from "vscode-jsonrpc";
import type { Config } from "./config";
import { type LspClient, LspClientImpl } from "./lsp";
import { LspManager } from "./lsp-manager";
import {
	type LSPMethods,
	getLspMethods,
	lspMethodHandler,
	openFileContents,
} from "./lsp-methods";
import { selectLsp } from "./lsp-selection";
import { createMcp, startMcp } from "./mcp";
import { ToolManager } from "./tool-manager";

export class App {
	private readonly toolManager: ToolManager;
	private readonly lspManager: LspManager;
	private readonly mcp: McpServer;
	private readonly availableMethodIds: Promise<LSPMethods[]>;
	private readonly workspace: string;
	private readonly toolRegistrar: DefaultToolRegistrar;

	constructor(
		config: Config,
		protected readonly logger: Logger,
	) {
		// keeps track of all the tools we're sending to the MCP
		this.toolManager = new ToolManager(logger);
		// keeps track of all the LSP Clients we're using
		this.lspManager = new LspManager(this.buildLsps(config.lsps, logger));
		// the MCP server
		this.mcp = createMcp();
		// The LSP methods we support (textDocument/foo, etc)
		this.availableMethodIds = getLspMethods(config.methods);

		this.workspace = config.workspace ?? "/";

		const lspSelector = new DefaultLspSelector();
		this.toolRegistrar = new DefaultToolRegistrar(
			this.toolManager,
			this.lspManager,
			lspSelector,
			logger,
		);

		// Cleanup on any signal
		process.on("SIGINT", () => this.dispose());
		process.on("SIGTERM", () => this.dispose());
		process.on("exit", () => this.dispose());
	}

	private async initializeMcp() {
		this.mcp.setRequestHandler(ListToolsRequestSchema, async () => {
			const mcpTools = this.toolManager.getTools().map((tool) => ({
				name: tool.id,
				description: tool.description,
				inputSchema: tool.inputSchema,
			}));

			return {
				tools: mcpTools,
			};
		});

		this.mcp.setRequestHandler(CallToolRequestSchema, async (request) => {
			const { name, arguments: args } = request.params;
			if (!args) {
				throw new Error("No arguments");
			}

			const result = await this.toolManager.callTool(name, args);
			const serialized =
				typeof result === "string" ? result : JSON.stringify(result, null, 2);

			return {
				content: [{ type: "text", text: serialized }],
			};
		});
	}

	public async start() {
		const methods = await this.availableMethodIds;
		this.toolRegistrar.registerAll(methods);
		await this.initializeMcp();
		await startMcp(this.mcp);
	}

	public async dispose() {
		if (this.lspManager !== undefined) {
			for (const lsp of this.lspManager.getLsps()) {
				lsp.dispose();
			}
		}

		if (this.mcp !== undefined) {
			await this.mcp.close();
		}
	}

	private async getAvailableMethodIds() {
		return this.availableMethodIds;
	}

	// Remove invariant types from the input schema since some MCPs have a hard time with them
	// Looking at you mcp-client-cli
	private buildLsps(lspConfigs: Config["lsps"], logger: Logger): LspClient[] {
		return lspConfigs.map(
			(lspConfig) =>
				new LspClientImpl(
					lspConfig.id,
					lspConfig.languages,
					lspConfig.extensions,
					this.workspace,
					lspConfig.command,
					lspConfig.args,
					logger,
				),
		);
	}
}
