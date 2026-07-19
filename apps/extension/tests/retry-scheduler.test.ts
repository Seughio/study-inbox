import { describe, expect, it, vi } from "vitest";
import {
  RETRY_ALARM_NAME,
  RETRY_ALARM_PERIOD_MINUTES,
  RetryScheduler,
  type RetryAlarmPort,
  type RetryController
} from "../src/background/retry-scheduler";

class MemoryAlarms implements RetryAlarmPort {
  public names = new Set<string>();
  public periods: number[] = [];
  public create = vi.fn(async (name: string, periodInMinutes: number) => {
    this.names.add(name);
    this.periods.push(periodInMinutes);
  });
  public clear = vi.fn(async (name: string) => {
    this.names.delete(name);
  });

  public async get(name: string): Promise<boolean> {
    return this.names.has(name);
  }
}

class MemoryRetryController implements RetryController {
  public queued = 0;
  public online = false;
  public retryCalls = 0;
  public sendCalls = 0;
  public beforeRetry: (() => Promise<void>) | undefined;

  public async retry(): Promise<{ sent: number; remaining: number }> {
    this.retryCalls += 1;
    await this.beforeRetry?.();
    if (!this.online) return { sent: 0, remaining: this.queued };
    const sent = this.queued;
    this.sendCalls += sent;
    this.queued = 0;
    return { sent, remaining: 0 };
  }

  public async retryCount(): Promise<number> {
    return this.queued;
  }
}

describe("RetryScheduler", () => {
  it("does not create an alarm for an empty queue", async () => {
    const controller = new MemoryRetryController();
    const alarms = new MemoryAlarms();
    await new RetryScheduler(controller, alarms).initialize();
    expect(alarms.create).not.toHaveBeenCalled();
  });

  it("cancels a stale alarm when startup finds an empty queue", async () => {
    const controller = new MemoryRetryController();
    const alarms = new MemoryAlarms();
    alarms.names.add(RETRY_ALARM_NAME);
    await new RetryScheduler(controller, alarms).initialize();
    expect(alarms.clear).toHaveBeenCalledWith(RETRY_ALARM_NAME);
  });

  it("creates a periodic alarm after an immediate post-enqueue retry fails", async () => {
    const controller = new MemoryRetryController();
    controller.queued = 1;
    const alarms = new MemoryAlarms();
    await new RetryScheduler(controller, alarms).flushAfterEnqueue();

    expect(controller.retryCalls).toBe(1);
    expect(controller.queued).toBe(1);
    expect(alarms.create).toHaveBeenCalledWith(
      RETRY_ALARM_NAME,
      RETRY_ALARM_PERIOD_MINUTES
    );
  });

  it("restores a missing alarm when a service worker is reconstructed", async () => {
    const controller = new MemoryRetryController();
    controller.queued = 1;
    const alarms = new MemoryAlarms();

    await new RetryScheduler(controller, alarms).initialize();
    alarms.names.clear();
    await new RetryScheduler(controller, alarms).initialize();

    expect(alarms.create).toHaveBeenCalledTimes(2);
    expect(alarms.names.has(RETRY_ALARM_NAME)).toBe(true);
  });

  it("automatically sends on alarm and clears the alarm after success", async () => {
    const controller = new MemoryRetryController();
    controller.queued = 1;
    controller.online = true;
    const alarms = new MemoryAlarms();
    alarms.names.add(RETRY_ALARM_NAME);
    const scheduler = new RetryScheduler(controller, alarms);

    await scheduler.handleAlarm(RETRY_ALARM_NAME);

    expect(controller.sendCalls).toBe(1);
    expect(controller.queued).toBe(0);
    expect(alarms.clear).toHaveBeenCalledWith(RETRY_ALARM_NAME);
  });

  it("keeps failed events and the existing alarm scheduled", async () => {
    const controller = new MemoryRetryController();
    controller.queued = 1;
    const alarms = new MemoryAlarms();
    alarms.names.add(RETRY_ALARM_NAME);

    await new RetryScheduler(controller, alarms).handleAlarm(RETRY_ALARM_NAME);

    expect(controller.queued).toBe(1);
    expect(alarms.names.has(RETRY_ALARM_NAME)).toBe(true);
    expect(alarms.clear).not.toHaveBeenCalled();
  });

  it("keeps alarm, startup, and manual triggers single-flight", async () => {
    const controller = new MemoryRetryController();
    controller.queued = 1;
    controller.online = true;
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    controller.beforeRetry = async () => blocked;
    const alarms = new MemoryAlarms();
    alarms.names.add(RETRY_ALARM_NAME);
    const scheduler = new RetryScheduler(controller, alarms);

    const alarm = scheduler.handleAlarm(RETRY_ALARM_NAME);
    const duplicateAlarm = scheduler.handleAlarm(RETRY_ALARM_NAME);
    const manual = scheduler.flush();
    await vi.waitFor(() => expect(controller.retryCalls).toBe(1));
    release?.();
    await Promise.all([alarm, duplicateAlarm, manual]);

    expect(controller.retryCalls).toBe(1);
    expect(controller.sendCalls).toBe(1);
    expect(controller.queued).toBe(0);
  });

  it("ignores unrelated alarms and keeps manual retry available", async () => {
    const controller = new MemoryRetryController();
    controller.queued = 1;
    controller.online = true;
    const scheduler = new RetryScheduler(controller, new MemoryAlarms());

    await scheduler.handleAlarm("unrelated-alarm");
    expect(controller.retryCalls).toBe(0);
    await scheduler.flush();
    expect(controller.sendCalls).toBe(1);
  });

  it("handles startup and alarm API failures without rejecting", async () => {
    const controller: RetryController = {
      retry: async () => { throw new Error("retry failed"); },
      retryCount: async () => { throw new Error("storage failed"); }
    };
    const alarms: RetryAlarmPort = {
      get: async () => { throw new Error("alarm get failed"); },
      create: async () => { throw new Error("alarm create failed"); },
      clear: async () => { throw new Error("alarm clear failed"); }
    };
    const scheduler = new RetryScheduler(controller, alarms);
    await expect(scheduler.initialize()).resolves.toBeUndefined();
    await expect(scheduler.handleAlarm(RETRY_ALARM_NAME)).resolves.toBeUndefined();
  });
});
