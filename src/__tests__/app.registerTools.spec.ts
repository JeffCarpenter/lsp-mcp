import { App } from "../app";
import { Config } from "../config";
import { nullLogger } from "../logger";
import { getLspMethods, lspMethodHandler, LSPMethods } from "../lsp-methods";

jest.mock("../lsp-methods", () => ({
  getLspMethods: jest.fn(),
  lspMethodHandler: jest.fn(),
  openFileContents: jest.fn(),
}));

const mockGetLspMethods = getLspMethods as jest.MockedFunction<typeof getLspMethods>;

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
    mockGetLspMethods.mockResolvedValue([createMethod("textDocument/documentSymbol")]);

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

    await (app as any).registerTools();
    const tools = (app as any).toolManager.getTools();

    const builtinIds = tools.filter((tool: any) => ["lsp_info", "file_contents_to_uri"].includes(tool.id));
    expect(builtinIds).toHaveLength(2);

    const dynamicTool = tools.find((tool: any) => tool.id === "textDocument_documentSymbol");
    expect(dynamicTool).toBeDefined();
    expect(dynamicTool.inputSchema.properties?.lsp).toBeUndefined();
    expect(dynamicTool.inputSchema.properties?.partialResultToken).toBeUndefined();
  });

  it("injects optional lsp selector when multiple LSPs are configured", async () => {
    mockGetLspMethods.mockResolvedValue([createMethod("textDocument/documentSymbol")]);

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

    await (app as any).registerTools();
    const tools = (app as any).toolManager.getTools();
    const dynamicTool = tools.find((tool: any) => tool.id === "textDocument_documentSymbol");
    expect(dynamicTool).toBeDefined();

    const lspProperty = dynamicTool.inputSchema.properties?.lsp;
    expect(lspProperty).toMatchObject({
      type: "string",
      enum: ["typescript", "python"],
    });
    expect(dynamicTool.inputSchema.properties).not.toHaveProperty("partialResultToken");
    expect(typeof lspProperty.description).toBe("string");
  });
});
