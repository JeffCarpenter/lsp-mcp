import { LspClient } from "../lsp";
import { LspManager } from "../lsp-manager";

function createClient(id: string, languages: string[], extensions: string[]): LspClient {
  return {
    id,
    languages,
    extensions,
    capabilities: undefined,
    start: jest.fn(),
    isStarted: jest.fn().mockReturnValue(false) as any,
    dispose: jest.fn(),
    sendRequest: jest.fn(),
    sendNotification: jest.fn(),
  };
}

describe("LspManager selection", () => {
  const tsClient = createClient("typescript", ["TypeScript", "TS"], ["ts", "tsx"]);
  const pyClient = createClient("python", ["python"], ["py"]);
  const manager = new LspManager([tsClient, pyClient]);

  it("looks up LSPs by id case-insensively", () => {
    expect(manager.getLsp("TypeScript")).toBe(tsClient);
    expect(manager.getLsp("PYTHON")).toBe(pyClient);
  });

  it("looks up LSPs by language", () => {
    expect(manager.getLspByLanguage("typescript")).toBe(tsClient);
    expect(manager.getLspByLanguage("TS")).toBe(tsClient);
  });

  it("looks up LSPs by extension or id fallback", () => {
    expect(manager.getLspByExtension("TSX")).toBe(tsClient);
    expect(manager.getLspByExtension("py")).toBe(pyClient);
    // Ids are also mapped for fuzzy lookups
    expect(manager.getLspByExtension("python")).toBe(pyClient);
  });

  it("returns the first configured LSP as default and reports multi-LSP setups", () => {
    expect(manager.getDefaultLsp()).toBe(tsClient);
    expect(manager.hasManyLsps()).toBe(true);
  });
});
