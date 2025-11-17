import type { LspClient } from "./lsp";
import type { LspManager } from "./lsp-manager";

export interface LspSelector {
	select(context: LspSelectionContext): LspClient;
}

export interface LspSelectionContext {
	args: Record<string, unknown>;
	lspManager: LspManager;
	lspPropertyName?: string;
}

export class DefaultLspSelector implements LspSelector {
	public select({
		args,
		lspManager,
		lspPropertyName,
	}: LspSelectionContext): LspClient {
		let lsp: LspClient | undefined;

		if (lspPropertyName) {
			const explicit = args[lspPropertyName];
			if (typeof explicit === "string" && explicit.length > 0) {
				lsp =
					lspManager.getLsp(explicit) ?? lspManager.getLspByLanguage(explicit);
			}

			if (!lsp) {
				const uri = extractUri(args);
				const extension = uri && extractExtension(uri);
				if (extension) {
					lsp = lspManager.getLspByExtension(extension);
				}
			}
		}

		return lsp ?? lspManager.getDefaultLsp();
	}
}

function extractUri(args: Record<string, unknown>): string | undefined {
	const textDocument = args.textDocument;
	if (!textDocument || typeof textDocument !== "object") {
		return undefined;
	}

	const uri = (textDocument as Record<string, unknown>).uri;
	return typeof uri === "string" ? uri : undefined;
}

function extractExtension(uri: string): string | undefined {
	const dotIndex = uri.lastIndexOf(".");
	if (dotIndex === -1 || dotIndex === uri.length - 1) {
		return undefined;
	}

	return uri.slice(dotIndex + 1);
}
