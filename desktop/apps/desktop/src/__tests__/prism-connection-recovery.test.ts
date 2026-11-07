import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	PrismRemoteTransport,
	type Request,
} from "../lib/backend/prism-remote";

const projects = [{ id: "p", name: "Paper", mainFile: "main.tex" }];
const empty = { epoch: "host-1", events: [] };
const transports: PrismRemoteTransport[] = [];
function make(request: Request, registry = projects) {
	const transport = new PrismRemoteTransport(request, registry, "ledger");
	transports.push(transport);
	return transport;
}
function deferred() {
	let resolve!: (value: unknown) => void;
	let reject!: (reason: Error) => void;
	const promise = new Promise<unknown>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}
function visibility(hidden: boolean) {
	Object.defineProperty(document, "hidden", {
		configurable: true,
		value: hidden,
	});
	document.dispatchEvent(new Event("visibilitychange"));
}
const settle = async () => {
	for (let i = 0; i < 12; i++) await Promise.resolve();
};
beforeEach(() => {
	vi.useFakeTimers();
	localStorage.clear();
	visibility(false);
});
afterEach(() => {
	for (const t of transports.splice(0)) t.close();
	vi.useRealTimers();
});

describe("iPad event connection lifecycle", () => {
	it("recovers a transient warning on a successful empty poll, without a new prompt", async () => {
		const request = vi
			.fn()
			.mockRejectedValueOnce(Error("proxy interrupted"))
			.mockResolvedValue(empty);
		const transport = make(request);
		const event = vi.fn();
		await transport.listen("codex-event", event);
		await vi.advanceTimersByTimeAsync(1000);
		expect(event.mock.calls.map(([e]) => e.payload.method)).toEqual([
			"connection/interrupted",
		]);
		await vi.advanceTimersByTimeAsync(2000);
		expect(event.mock.calls.map(([e]) => e.payload.method)).toEqual([
			"connection/interrupted",
			"connection/restored",
		]);
		expect(
			request.mock.calls.every(
				([url, method]) =>
					url.includes("/prism/events?") && method === undefined,
			),
		).toBe(true);
	});

	it("keeps the warning until every registered project's poll succeeds", async () => {
		let failSecond = true;
		const request = vi.fn(async (url: string) => {
			if (url.includes("/q/") && failSecond)
				throw Error("second project failed");
			return empty;
		});
		const transport = make(request, [...projects, { ...projects[0], id: "q" }]);
		const event = vi.fn();
		await transport.listen("codex-event", event);
		await vi.advanceTimersByTimeAsync(2000);
		expect(event.mock.calls.map(([e]) => e.payload.method)).toEqual([
			"connection/interrupted",
		]);
		failSecond = false;
		await vi.advanceTimersByTimeAsync(1000);
		expect(event.mock.calls.map(([e]) => e.payload.method)).toEqual([
			"connection/interrupted",
			"connection/restored",
		]);
	});

	it.each([
		"resolve",
		"reject",
	] as const)("ignores an old %s after rebinding, while a new poll completes", async (outcome) => {
		const old = deferred();
		const request = vi.fn().mockReturnValue(old.promise);
		const transport = make(request);
		const event = vi.fn();
		await transport.listen("codex-event", event);
		await vi.advanceTimersByTimeAsync(1000);
		const next = vi.fn().mockResolvedValue(empty);
		transport.rebind(next, projects, "ledger");
		await settle();
		expect(next).toHaveBeenCalled();
		if (outcome === "reject") old.reject(Error("old port failed late"));
		else
			old.resolve({
				epoch: "old-host",
				events: [
					{
						id: 99,
						name: "codex-event",
						payload: { method: "connection/closed", params: {} },
					},
				],
			});
		await settle();
		expect(event).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1000);
		expect(next).toHaveBeenLastCalledWith(
			"/projects/p/prism/events?after=0",
			undefined,
			undefined,
		);
	});

	it("discards suspended failures and polls immediately when returning to the foreground", async () => {
		const old = deferred();
		const request = vi
			.fn()
			.mockReturnValueOnce(old.promise)
			.mockResolvedValue(empty);
		const transport = make(request);
		const event = vi.fn();
		await transport.listen("codex-event", event);
		await vi.advanceTimersByTimeAsync(1000);
		visibility(true);
		await vi.advanceTimersByTimeAsync(5000);
		expect(request).toHaveBeenCalledTimes(1);
		visibility(false);
		await settle();
		expect(request).toHaveBeenCalledTimes(2);
		old.reject(Error("background request timed out"));
		await settle();
		expect(event).not.toHaveBeenCalled();
	});

	it("does not let an obsolete completion release a newer pending poll", async () => {
		const old = deferred(),
			current = deferred();
		const transport = make(vi.fn().mockReturnValue(old.promise));
		await transport.listen("codex-event", vi.fn());
		await vi.advanceTimersByTimeAsync(1000);
		const next = vi.fn().mockReturnValue(current.promise);
		transport.rebind(next, projects, "ledger");
		await settle();
		old.reject(Error("obsolete"));
		await settle();
		await vi.advanceTimersByTimeAsync(3000);
		expect(next).toHaveBeenCalledTimes(1);
		current.resolve(empty);
		await settle();
		await vi.advanceTimersByTimeAsync(1000);
		expect(next).toHaveBeenCalledTimes(2);
	});

	it("retries read-only polling after pageshow and removes lifecycle listeners on close", async () => {
		const request = vi.fn().mockResolvedValue(empty);
		const transport = make(request);
		await transport.listen("codex-event", vi.fn());
		window.dispatchEvent(new Event("pageshow"));
		await settle();
		expect(request).toHaveBeenCalledTimes(1);
		transport.close();
		visibility(true);
		visibility(false);
		window.dispatchEvent(new Event("pageshow"));
		await vi.advanceTimersByTimeAsync(2000);
		expect(request).toHaveBeenCalledTimes(1);
	});

	it("retains genuine Codex disconnect events instead of relabeling them as transport failures", async () => {
		const request = vi
			.fn()
			.mockResolvedValue({
				epoch: "host-1",
				events: [
					{
						id: 1,
						name: "codex-event",
						payload: { method: "connection/closed", params: {} },
					},
				],
			});
		const transport = make(request);
		const event = vi.fn();
		await transport.listen("codex-event", event);
		await vi.advanceTimersByTimeAsync(2000);
		expect(event.mock.calls.map(([e]) => e.payload.method)).toEqual([
			"connection/closed",
		]);
	});
});
