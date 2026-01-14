import { expect, Page } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import { IMAGE_TOOLS_DB_NAME } from "../services/persistence/constants";
import { ENV_KEY_SKIP_FLAG } from "../lib/authFlags";
import {
	API_KEY_STORAGE_KEY,
	AUTH_METHOD_STORAGE_KEY,
} from "../lib/authStorage";

// Note: google/gemini-2.5-flash-image (aka "Nano Banana") supports image output,
// whereas google/gemini-2.5-flash only supports text output.
export const inexpensive_model_for_testing = "google/gemini-2.5-flash-image";

export const resetImageToolsPersistence = async (page: Page) => {
	await page.addInitScript(
		({
			flag,
			apiKeyKey,
			methodKey,
			dbName,
			uiKeyPrefix,
		}: {
			flag: string;
			apiKeyKey: string;
			methodKey: string;
			dbName: string;
			uiKeyPrefix: string;
		}) => {
			// Always set this so tests don't accidentally pick up an env key.
			window.sessionStorage?.setItem(flag, "1");

			// Only perform the destructive reset once per test session.
			const resetMarker = "__imageToolsDidReset";
			if (window.sessionStorage?.getItem(resetMarker) === "1") {
				(window as any).__imageToolsResetPromise = Promise.resolve();
				return;
			}
			window.sessionStorage?.setItem(resetMarker, "1");

			try {
				window.localStorage?.removeItem(apiKeyKey);
				window.localStorage?.removeItem(methodKey);
				// Clear UI preference keys (e.g. persisted textarea sizes).
				const keysToRemove: string[] = [];
				for (let i = 0; i < (window.localStorage?.length ?? 0); i++) {
					const key = window.localStorage?.key(i);
					if (key && key.startsWith(uiKeyPrefix)) {
						keysToRemove.push(key);
					}
				}
				keysToRemove.forEach((key) => window.localStorage?.removeItem(key));
			} catch {
				// ignore
			}

			// Kick off the deletion before the app opens the DB.
			// We'll await this promise from the test after navigation.
			(window as any).__imageToolsResetPromise = new Promise<void>((resolve) => {
				try {
					const request = indexedDB.deleteDatabase(dbName);
					request.onsuccess = () => resolve();
					request.onerror = () => resolve();
					request.onblocked = () => resolve();
				} catch {
					resolve();
				}
			});
		},
		{
			flag: ENV_KEY_SKIP_FLAG,
			apiKeyKey: API_KEY_STORAGE_KEY,
			methodKey: AUTH_METHOD_STORAGE_KEY,
			dbName: IMAGE_TOOLS_DB_NAME,
			uiKeyPrefix: "bloom-ai-image-tools:textarea-height:",
		}
	);

	await page.goto("/");
	await page.evaluate(() => (window as any).__imageToolsResetPromise);
	await page.reload();
};

export const openSettingsDialog = async (page: Page) => {
	// Prefer the CTA when present; it is the most stable entry point.
	const connectCta = page.getByRole("button", { name: /Connect to OpenRouter/i });
	if ((await connectCta.count()) > 0 && (await connectCta.isVisible())) {
		await connectCta.click();
		return;
	}

	// Fallback to the gear icon button in the header.
	await page
		.getByRole("button", { name: /^Settings\s+•/i })
		.first()
		.click();
};

export const closeSettingsDialog = async (page: Page) => {
	const closeButton = page.getByRole("button", { name: /^Close$/i });
	if ((await closeButton.count()) > 0 && (await closeButton.isVisible())) {
		await closeButton.click();
	}
};

export const setOpenRouterApiKey = async (page: Page, key: string) => {
	await openSettingsDialog(page);

	const input = page
		.getByTestId("openrouter-api-key-input")
		.locator("input")
		.first();
	await input.fill(key);
	// The UI commits on blur.
	await input.press("Tab");

	await closeSettingsDialog(page);
};

export const clearOpenRouterApiKey = async (page: Page) => {
	await openSettingsDialog(page);
	const clearButton = page.getByTestId("openrouter-clear-key");
	if ((await clearButton.count()) > 0 && (await clearButton.isVisible())) {
		await clearButton.click();
	}
	await closeSettingsDialog(page);
};

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export const SAMPLE_IMAGE_PATH = path.resolve(
	currentDir,
	"..",
	"assets",
	"art-styles",
	"line-drawing-sketch.png"
);

export const ALT_SAMPLE_IMAGE_PATH = path.resolve(
	currentDir,
	"..",
	"assets",
	"art-styles",
	"watercolor-dream.png"
);

export const uploadImageToTarget = async (page: Page, filePath: string) => {
	const uploadInput = page.getByTestId("target-upload-input");
	await uploadInput.setInputFiles(filePath);
	await expect(
		page.getByRole("img", { name: "Image to Edit" })
	).toBeVisible();
};

export const uploadSampleImageToTarget = async (page: Page) => {
	await uploadImageToTarget(page, SAMPLE_IMAGE_PATH);
};

export const installMockFileSystemAccess = async (page: Page) => {
	await page.addInitScript(() => {
		const STORAGE_KEY = "__mockFsState";
		const ROOT_NAME = "mock-history";
		const ensureState = () => {
			const raw = window.localStorage?.getItem(STORAGE_KEY);
			if (raw) {
				try {
					return JSON.parse(raw);
				} catch {
					// ignore parse errors
				}
			}
			const next = {
				root: {
					name: ROOT_NAME,
					files: {},
					dirs: {
						images: {
							files: {},
							dirs: {},
						},
					},
				},
			};
			window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
			return next;
		};

		let state = ensureState();

		const persist = () => {
			try {
				window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
			} catch {
				// ignore
			}
		};

		const notFoundError = () => {
			throw new DOMException("Not found", "NotFoundError");
		};

		const dataUrlFromBlob = (blob: Blob) =>
			new Promise<string>((resolve, reject) => {
				const reader = new FileReader();
				reader.onloadend = () => {
					if (typeof reader.result === "string") {
						resolve(reader.result);
					} else {
						reject(new Error("Failed to read blob"));
					}
				};
				reader.onerror = () => reject(new Error("Failed to read blob"));
				reader.readAsDataURL(blob);
			});

		const blobFromDataUrl = async (dataUrl: string) => {
			const response = await fetch(dataUrl);
			return await response.blob();
		};

		const toBlob = (data: any) => {
			if (data instanceof Blob) return data;
			if (data instanceof ArrayBuffer) return new Blob([data]);
			if (ArrayBuffer.isView(data)) return new Blob([data.buffer]);
			if (typeof data === "string") return new Blob([data]);
			return new Blob([String(data)]);
		};

		const createFileHandle = (dirState: any, name: string) => ({
			kind: "file",
			name,
			getFile: async () => {
				const record = dirState.files[name];
				if (!record) {
					notFoundError();
				}
				let blob: Blob;
				if (record.text != null && record.type === "application/json") {
					blob = new Blob([record.text], { type: record.type });
				} else if (record.dataUrl) {
					blob = await blobFromDataUrl(record.dataUrl);
				} else {
					blob = new Blob([], { type: record.type || "" });
				}
				return new File([blob], name, {
					type: record.type || blob.type,
					lastModified: record.lastModified || Date.now(),
				});
			},
			createWritable: async () => {
				return {
					write: async (data: any) => {
						const blob = toBlob(data);
						const record = {
							type: blob.type || "",
							lastModified: Date.now(),
							dataUrl: await dataUrlFromBlob(blob),
							text: await blob.text().catch(() => null),
						};
						dirState.files[name] = record;
						persist();
					},
					close: async () => undefined,
				};
			},
		});

		const createDirectoryHandle = (dirState: any, name: string) => ({
			kind: "directory",
			name,
			queryPermission: async () => "granted",
			requestPermission: async () => "granted",
			getDirectoryHandle: async (dirName: string, options?: { create?: boolean }) => {
				const existing = dirState.dirs[dirName];
				if (existing) {
					return createDirectoryHandle(existing, dirName);
				}
				if (!options?.create) {
					notFoundError();
				}
				const next = { files: {}, dirs: {} };
				dirState.dirs[dirName] = next;
				persist();
				return createDirectoryHandle(next, dirName);
			},
			getFileHandle: async (fileName: string, options?: { create?: boolean }) => {
				if (!dirState.files[fileName]) {
					if (!options?.create) {
						notFoundError();
					}
					dirState.files[fileName] = {
						type: "",
						lastModified: Date.now(),
						dataUrl: "",
						text: "",
					};
					persist();
				}
				return createFileHandle(dirState, fileName);
			},
			removeEntry: async (fileName: string) => {
				if (!dirState.files[fileName]) {
					notFoundError();
				}
				delete dirState.files[fileName];
				persist();
			},
			entries: async function* () {
				for (const fileName of Object.keys(dirState.files)) {
					yield [fileName, createFileHandle(dirState, fileName)];
				}
			},
		});

		const rootHandle = createDirectoryHandle(state.root, state.root.name);

		(window as any).showDirectoryPicker = async () => rootHandle;
		(window as any).__getMockFsState = () => {
			try {
				return JSON.parse(window.localStorage?.getItem(STORAGE_KEY) || "{}");
			} catch {
				return {};
			}
		};
	});
};
