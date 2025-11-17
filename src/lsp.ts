import { type ChildProcess, spawn } from "node:child_process";
import path from "node:path";
import * as rpc from "vscode-jsonrpc";
import type { Logger } from "vscode-jsonrpc";
import { StreamMessageReader, StreamMessageWriter } from "vscode-jsonrpc/node";
import * as protocol from "vscode-languageserver-protocol";

export interface LspClient {
	id: string;
	languages: string[];
	extensions: string[];
	capabilities: protocol.ServerCapabilities | undefined;
	start(): Promise<void>;
	isStarted(): boolean;
	dispose: () => void;
	sendRequest(method: string, args: unknown): Promise<unknown>;
	sendNotification(method: string, args: unknown): Promise<void>;
}

export class LspClientImpl implements LspClient {
	protected childProcess: ChildProcess | undefined;

	protected connection: rpc.MessageConnection | undefined;

	public capabilities: protocol.ServerCapabilities | undefined;

	public constructor(
		public readonly id: string,
		public readonly languages: string[],
		public readonly extensions: string[],
		public readonly workspace: string,
		private readonly command: string,
		private readonly args: string[],
		private readonly logger: Logger, // TODO: better long term solution for logging
	) {
		this.capabilities = undefined;
	}

	public async start() {
		// TODO: This should return a promise if the LSP is still starting
		// Just don't call start() twice and it'll be fine :)
		if (this.isStarted()) {
			return;
		}

		const childProcess = spawn(this.command, this.args);
		this.childProcess = childProcess;

		if (!childProcess.stdout || !childProcess.stdin) {
			throw new Error("Child process not started");
		}

		const connection = rpc.createMessageConnection(
			new StreamMessageReader(childProcess.stdout),
			new StreamMessageWriter(childProcess.stdin),
			this.logger,
		);

		this.connection = connection;

		connection.onError((error) => {
			this.logger.error(`Connection error: ${error}`);
			childProcess.kill();
		});

		connection.onClose(() => {
			this.logger.log("Connection closed");
			childProcess.kill();
		});

		connection.onUnhandledNotification((notification) => {
			this.logger.log(
				`Unhandled notification: ${JSON.stringify(notification)}`,
			);
		});

		connection.listen();

		// TODO: We should figure out how to specify the capabilities we want
		const capabilities: protocol.ClientCapabilities = {};

		const uri = `file://${this.workspace}`;
		const initializeParams: protocol.InitializeParams = {
			processId: process.pid ?? null,
			rootUri: uri,
			capabilities,
		};

		const response = await connection.sendRequest<protocol.InitializeResult>(
			protocol.InitializeRequest.method,
			initializeParams,
		);

		this.logger.info(
			`Server LSP capabilities: ${JSON.stringify(response, null, 2)}`,
		);
		this.capabilities = response.capabilities ?? undefined;
	}

	public isStarted(): this is LspClientImpl & {
		connection: rpc.MessageConnection;
	} {
		return !!this.connection;
	}

	private assertStarted(): asserts this is LspClientImpl & {
		connection: rpc.MessageConnection;
	} {
		if (!this.connection) {
			throw new Error("Not started");
		}
	}

	async sendRequest(method: string, args: unknown): Promise<unknown> {
		if (!this.isStarted()) {
			await this.start();
		}

		this.assertStarted();

		return await this.connection.sendRequest(method, args);
	}

	async sendNotification(method: string, args: unknown): Promise<void> {
		if (!this.isStarted()) {
			await this.start();
		}

		this.assertStarted();

		return await this.connection.sendNotification(method, args);
	}

	dispose() {
		try {
			this.connection?.dispose();
			this.childProcess?.kill();
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			this.logger.error(message);
		}
	}
}
