import { describe, it, expect } from 'vitest';

import { EntityBuilder } from '@/tests/helpers/entityBuilder.js';

interface CountProps {
  value: number;
}

class CounterBuilder extends EntityBuilder<CountProps, { value: number }> {
  constructor() {
    super({ value: 0 });
  }
  build(): { value: number } {
    return { value: this.props.value };
  }
  withValue(value: number): this {
    this.props.value = value;
    return this;
  }
}

describe('EntityBuilder', () => {
  it('builds a single entity with the default props', () => {
    const entity = new CounterBuilder().build();
    expect(entity).toEqual({ value: 0 });
  });

  it('supports fluent overrides via subclass methods', () => {
    const entity = new CounterBuilder().withValue(42).build();
    expect(entity).toEqual({ value: 42 });
  });

  it('builds many entities and produces independent instances', () => {
    const builder = new CounterBuilder().withValue(7);
    const entities = builder.buildMany(3);
    expect(entities).toHaveLength(3);
    expect(entities.every((entity) => entity.value === 7)).toBe(true);
    expect(entities[0]).not.toBe(entities[1]);
  });
});
