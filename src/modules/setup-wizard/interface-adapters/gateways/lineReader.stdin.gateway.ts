import { createInterface, type Interface } from 'node:readline';
import type { Readable } from 'node:stream';

import type { LineReader } from '@/modules/setup-wizard/entities/lineReader/lineReader.gateway.js';

type PendingResolver = (line: string | null) => void;

export class NodeStdinLineReader implements LineReader {
  private readonly readline: Interface;
  private readonly buffered: string[] = [];
  private readonly waiting: PendingResolver[] = [];
  private closed = false;

  constructor(input: Readable = process.stdin) {
    this.readline = createInterface({ input });
    this.readline.on('line', (line) => this.enqueue(line));
    this.readline.on('close', () => this.finish());
  }

  async read(): Promise<string | null> {
    const buffered = this.buffered.shift();
    if (buffered !== undefined) return buffered;
    if (this.closed) return null;
    return new Promise<string | null>((resolve) => {
      this.waiting.push(resolve);
    });
  }

  private enqueue(line: string): void {
    const resolver = this.waiting.shift();
    if (resolver) {
      resolver(line);
      return;
    }
    this.buffered.push(line);
  }

  private finish(): void {
    this.closed = true;
    while (this.waiting.length > 0) {
      const resolver = this.waiting.shift();
      if (resolver) resolver(null);
    }
  }
}
