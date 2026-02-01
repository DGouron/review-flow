export interface Gateway<TEntity, TId = string> {
  getById(id: TId): Promise<TEntity | undefined>
  save(entity: TEntity): Promise<void>
}

export interface ReadOnlyGateway<TEntity, TId = string> {
  getById(id: TId): Promise<TEntity | undefined>
  getAll(): Promise<TEntity[]>
}
