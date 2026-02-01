export interface UseCase<TInput, TOutput> {
  execute(input: TInput): TOutput
}
