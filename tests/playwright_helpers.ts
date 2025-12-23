import { expect, Page } from "@playwright/test";
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
	await page.addInitScript((flag) => {
		window.sessionStorage?.setItem(flag, "1");
	}, ENV_KEY_SKIP_FLAG);
	await page.goto("/");
	await page.evaluate((keys) => {
		const [apiKeyKey, methodKey] = keys;
		window.localStorage?.removeItem(apiKeyKey);
		window.localStorage?.removeItem(methodKey);
	}, [API_KEY_STORAGE_KEY, AUTH_METHOD_STORAGE_KEY]);
	await page.evaluate((dbName) => {
		return new Promise<void>((resolve, reject) => {
			const request = indexedDB.deleteDatabase(dbName);
			request.onsuccess = () => resolve();
			request.onblocked = () => resolve();
			request.onerror = () => reject(request.error);
		});
	}, IMAGE_TOOLS_DB_NAME);
	await page.reload();
};
