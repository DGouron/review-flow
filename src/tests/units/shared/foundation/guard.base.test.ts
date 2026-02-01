import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { createGuard } from '../../../../shared/foundation/guard.base.js'

describe('createGuard', () => {
  const testSchema = z.object({
    name: z.string(),
    age: z.number(),
  })

  describe('parse', () => {
    it('should return parsed data when input is valid', () => {
      const guard = createGuard(testSchema)
      const input = { name: 'John', age: 30 }

      const result = guard.parse(input)

      expect(result).toEqual({ name: 'John', age: 30 })
    })

    it('should throw ZodError when input is invalid', () => {
      const guard = createGuard(testSchema)
      const invalidInput = { name: 'John', age: 'not a number' }

      expect(() => guard.parse(invalidInput)).toThrow()
    })
  })

  describe('safeParse', () => {
    it('should return success result when input is valid', () => {
      const guard = createGuard(testSchema)
      const input = { name: 'John', age: 30 }

      const result = guard.safeParse(input)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual({ name: 'John', age: 30 })
      }
    })

    it('should return failure result when input is invalid', () => {
      const guard = createGuard(testSchema)
      const invalidInput = { name: 'John', age: 'not a number' }

      const result = guard.safeParse(invalidInput)

      expect(result.success).toBe(false)
    })
  })
})
