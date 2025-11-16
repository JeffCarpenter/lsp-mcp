import * as protocol from "vscode-languageserver-protocol";
import * as path from "path";
import * as fs from "fs/promises";
import { LspClient } from "./lsp";
import $RefParser from "@apidevtools/json-schema-ref-parser";
import { JSONSchema4 } from "json-schema";
import { MetaModel } from "./3rdparty/metaModel";

// List of LSP requests that we do not want to expose
const toolBlacklist = [
  // These are handled by this program
  "initialize",
  "shutdown",

  // Useless for MCP?
  "client/registerCapability",
  "client/unregisterCapability",
];

export interface LSPMethods {
  id: string;
  description: string;
  inputSchema: JSONSchema4;
}

// Converts /path/to/file to file:///path/to/file
function pathToFileUri(path: string): string {
  return `file://${path}`
}

// convert file:///path/to/file to /path/to/file
function fileUriToPath(uri: string): string {
  if (uri.startsWith("file://")) {
    return path.resolve(uri.slice(7));
  }

  return path.resolve(uri);
}

// Let's the LSP know about a file contents
export async function openFileContents(lsp: LspClient, uri: string, contents: string): Promise<void> {
  await lsp.sendNotification(protocol.DidOpenTextDocumentNotification.method, {
    textDocument: {
      uri: uri,
      languageId: "typescript",
      version: 1,
      text: contents,
    },
  });
}

// Let's the LSP know about a file
async function openFile(lsp: LspClient, file: string, uri: string): Promise<void> {
  const contents = await fs.readFile(file, "utf8");
  await openFileContents(lsp, uri, contents);
}

export async function lspMethodHandler(lsp: LspClient, methodId: string, args: Record<string, any>): Promise<string> {
  let lspArgs = args;
  // For uris, we need to tell the LSP about the file contents
  // This helper makes the LLM's work easier (and less likely to break) by not requiring the LLM to have to handle opening files itself
  // However, don't handle mem:// files as they are special in that they are not actual files on disk
  if (lspArgs.textDocument?.uri && !lspArgs.textDocument.uri.startsWith("mem://")) {
    const file = fileUriToPath(lspArgs.textDocument.uri);
    const uri = pathToFileUri(file);
    // TODO: decide how to close the file. Timeout I think is the best option?
    await openFile(lsp, file, uri);
    lspArgs = { ...lspArgs, textDocument: { ...lspArgs.textDocument, uri } };
  }

  return await lsp.sendRequest(methodId, lspArgs);
};

async function getMetaModel() {
  const metaModelString = await fs.readFile(
    path.join(__dirname, "resources", "metaModel.json"),
    "utf8"
  );
  return JSON.parse(metaModelString) as MetaModel;
}

async function getDereferencedJsonSchema() {
  const parser = new $RefParser()
  const schema = await parser.parse(path.join(__dirname,"./resources/generated.protocol.schema.json"))

  const dereferenced = await parser.dereference(schema, {
    mutateInputSchema: false,
  })

  if (!dereferenced.definitions) {
    throw new Error("No definitions")
  }

  return dereferenced as { definitions: Record<string, JSONSchema4> };
}

let cachedMethods: LSPMethods[] | undefined;
let cachedLookups:
  | {
      metaModel: Map<string, MetaModel["requests"][number]>;
      jsonSchema: Map<string, JSONSchema4>;
      methodOrder: string[];
    }
  | undefined;

async function loadLookups() {
  if (!cachedLookups) {
    const [metaModel, jsonSchema] = await Promise.all([
      getMetaModel(),
      getDereferencedJsonSchema(),
    ]);

    cachedLookups = {
      methodOrder: metaModel.requests.map((request) => request.method),
      metaModel: new Map(metaModel.requests.map((request) => [request.method, request])),
      jsonSchema: new Map(
        Object.values(jsonSchema.definitions)
          .filter(
            (definition) => definition.properties?.method?.enum?.length === 1,
          )
          .map((definition) => [
            String(definition.properties?.method?.enum?.[0]),
            definition,
          ]),
      ),
    };
  }

  return cachedLookups;
}

function sanitizeInputSchema(paramsSchema?: JSONSchema4): JSONSchema4 {
  if (!paramsSchema || !paramsSchema.type) {
    return { type: "object" };
  }

  return paramsSchema;
}

function describeMethod(
  id: string,
  metaModelLookup: Map<string, MetaModel["requests"][number]>,
): string {
  const documentation = metaModelLookup.get(id)?.documentation ?? "";
  return `method: ${id}\n${documentation}`;
}

export async function getLspMethods(
  allowedMethodIds: string[] | undefined = undefined,
): Promise<LSPMethods[]> {
  if (cachedMethods) {
    return cachedMethods;
  }

  const { metaModel, jsonSchema, methodOrder } = await loadLookups();

  const candidateIds = allowedMethodIds ?? methodOrder;
  const filteredMethodIds = candidateIds.filter((id) => !toolBlacklist.includes(id));

  const generated = filteredMethodIds
    .map((id) => {
      const definition = jsonSchema.get(id);
      const paramsSchema = definition?.properties?.params;

      if (!definition?.properties) {
        return undefined;
      }

      return {
        id,
        description: describeMethod(id, metaModel),
        inputSchema: sanitizeInputSchema(paramsSchema),
      };
    })
    .filter((method): method is LSPMethods => method !== undefined);

  cachedMethods = generated;
  return cachedMethods;
}
