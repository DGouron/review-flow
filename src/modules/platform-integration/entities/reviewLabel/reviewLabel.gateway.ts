export interface EnsureReviewLabelInput {
  projectPath: string;
  label: string;
}

export interface ReviewLabelInput extends EnsureReviewLabelInput {
  mrNumber: number;
}

export interface ReviewLabelGateway {
  /**
   * Creates the label on the project when it is missing. Contractually non-throwing:
   * neither platform CLI offers an idempotent create, and telling "already exists"
   * apart from "no permission" would mean parsing stderr. A genuine permission
   * problem surfaces one call later, as an `addLabel` failure.
   */
  ensureLabelExists(input: EnsureReviewLabelInput): Promise<void>;
  addLabel(input: ReviewLabelInput): Promise<void>;
  removeLabel(input: ReviewLabelInput): Promise<void>;
}
