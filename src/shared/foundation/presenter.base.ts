export interface Presenter<TDomain, TViewModel> {
  present(data: TDomain): TViewModel
}
