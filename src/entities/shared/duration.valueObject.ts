import { z } from 'zod';

export const DurationSchema = z.number().int().nonnegative();

export class Duration {
  private constructor(private readonly milliseconds: number) {}

  static fromMilliseconds(ms: number): Duration {
    const validated = DurationSchema.parse(ms);
    return new Duration(validated);
  }

  static fromSeconds(seconds: number): Duration {
    return new Duration(Math.round(seconds * 1000));
  }

  static fromMinutes(minutes: number): Duration {
    return new Duration(Math.round(minutes * 60 * 1000));
  }

  static zero(): Duration {
    return new Duration(0);
  }

  get ms(): number {
    return this.milliseconds;
  }

  get seconds(): number {
    return Math.floor(this.milliseconds / 1000);
  }

  get minutes(): number {
    return Math.floor(this.milliseconds / 60000);
  }

  get formatted(): string {
    const totalSeconds = this.seconds;
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;

    if (mins === 0) return `${secs}s`;
    if (secs === 0) return `${mins}m`;
    return `${mins}m ${secs}s`;
  }

  add(other: Duration): Duration {
    return new Duration(this.milliseconds + other.milliseconds);
  }

  subtract(other: Duration): Duration {
    const result = this.milliseconds - other.milliseconds;
    return new Duration(Math.max(0, result));
  }

  isGreaterThan(other: Duration): boolean {
    return this.milliseconds > other.milliseconds;
  }

  equals(other: Duration): boolean {
    return this.milliseconds === other.milliseconds;
  }

  toJSON(): number {
    return this.milliseconds;
  }

  toString(): string {
    return this.formatted;
  }
}
