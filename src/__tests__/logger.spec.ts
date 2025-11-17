import { consoleLogger } from "../logger";

describe("logger", () => {
	const originalLog = console.log;
	const originalError = console.error;

	afterEach(() => {
		console.log = originalLog;
		console.error = originalError;
	});

	it("appends newline when missing", () => {
		const messages: string[] = [];
		console.log = (message: string) => {
			messages.push(message);
		};

		consoleLogger.log("hello");

		expect(messages).toEqual(["hello\n"]);
	});

	it("preserves newline when present", () => {
		const messages: string[] = [];
		console.error = (message: string) => {
			messages.push(message);
		};

		consoleLogger.error("boom\n");

		expect(messages).toEqual(["boom\n"]);
	});
});
