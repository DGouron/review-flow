import type { z } from 'zod'

export function createGuard<T extends z.ZodType>(schema: T) {
  return {
    parse(input: unknown): z.infer<T> {
      return schema.parse(input)
    },
    safeParse(input: unknown) {
      return schema.safeParse(input)
    },
    isValid(input: unknown): input is z.infer<T> {
      return schema.safeParse(input).success
    },
    parseCollection(input: unknown): z.infer<T>[] {
      return schema.array().parse(input)
    },
  }
}
