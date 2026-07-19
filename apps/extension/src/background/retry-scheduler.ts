export const RETRY_ALARM_NAME = "study-inbox-retry-queue";
export const RETRY_ALARM_PERIOD_MINUTES = 1;

export interface RetryController {
  retry(): Promise<{ sent: number; remaining: number }>;
  retryCount(): Promise<number>;
}

export interface RetryAlarmPort {
  get(name: string): Promise<boolean>;
  create(name: string, periodInMinutes: number): Promise<void>;
  clear(name: string): Promise<void>;
}

export class ChromeRetryAlarmPort implements RetryAlarmPort {
  public async get(name: string): Promise<boolean> {
    return (await chrome.alarms.get(name)) !== undefined;
  }

  public async create(name: string, periodInMinutes: number): Promise<void> {
    await chrome.alarms.create(name, {
      delayInMinutes: periodInMinutes,
      periodInMinutes
    });
  }

  public async clear(name: string): Promise<void> {
    await chrome.alarms.clear(name);
  }
}

export class RetryScheduler {
  private inFlight: Promise<void> | null = null;

  public constructor(
    private readonly controller: RetryController,
    private readonly alarms: RetryAlarmPort = new ChromeRetryAlarmPort()
  ) {}

  public async initialize(): Promise<void> {
    await this.reconcileSafely();
  }

  public flush(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.flushOnce().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  public async flushAfterEnqueue(): Promise<void> {
    const existing = this.inFlight;
    if (existing) await existing;
    await this.flush();
  }

  public async handleAlarm(name: string): Promise<void> {
    if (name === RETRY_ALARM_NAME) await this.flush();
  }

  private async flushOnce(): Promise<void> {
    try {
      await this.controller.retry();
    } catch {
      // Queue persistence remains authoritative; reconciliation below is best effort.
    }
    await this.reconcileSafely();
  }

  private async reconcileSafely(): Promise<void> {
    try {
      const count = await this.controller.retryCount();
      const exists = await this.alarms.get(RETRY_ALARM_NAME);
      if (count > 0 && !exists) {
        await this.alarms.create(RETRY_ALARM_NAME, RETRY_ALARM_PERIOD_MINUTES);
      } else if (count === 0 && exists) {
        await this.alarms.clear(RETRY_ALARM_NAME);
      }
    } catch {
      // Startup, installation, and alarm handlers must not fail the service worker.
    }
  }
}
