import { describe, it, expect } from 'vitest'
import type { UseCase } from '../../../../shared/foundation/usecase.base.js'
import type { Presenter } from '../../../../shared/foundation/presenter.base.js'
import type { Gateway, ReadOnlyGateway } from '../../../../shared/foundation/gateway.base.js'

describe('Foundation contracts', () => {
  describe('UseCase', () => {
    it('should allow sync implementation', () => {
      const useCase: UseCase<string, number> = {
        execute: (input: string) => input.length
      }
      expect(useCase.execute('test')).toBe(4)
    })

    it('should allow async implementation', async () => {
      const useCase: UseCase<string, Promise<number>> = {
        execute: async (input: string) => input.length
      }
      expect(await useCase.execute('test')).toBe(4)
    })
  })

  describe('Presenter', () => {
    it('should transform domain to view model', () => {
      const presenter: Presenter<{ name: string }, { displayName: string }> = {
        present: (data) => ({ displayName: data.name.toUpperCase() })
      }
      expect(presenter.present({ name: 'john' })).toEqual({ displayName: 'JOHN' })
    })
  })

  describe('Gateway', () => {
    it('should define CRUD operations', async () => {
      const store = new Map<string, { id: string }>()
      const gateway: Gateway<{ id: string }> = {
        getById: async (id) => store.get(id),
        save: async (entity) => { store.set(entity.id, entity) }
      }

      await gateway.save({ id: '1' })
      expect(await gateway.getById('1')).toEqual({ id: '1' })
    })
  })

  describe('ReadOnlyGateway', () => {
    it('should define read operations only', async () => {
      const gateway: ReadOnlyGateway<{ id: string }> = {
        getById: async () => ({ id: '1' }),
        getAll: async () => [{ id: '1' }, { id: '2' }]
      }

      expect(await gateway.getAll()).toHaveLength(2)
    })
  })
})
