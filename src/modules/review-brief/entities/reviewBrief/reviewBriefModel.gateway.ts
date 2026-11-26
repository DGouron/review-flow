export type ReviewBriefModelRequest = {
  systemPrompt: string;
  material: string;
  localPath: string;
};

export type ReviewBriefModelResult =
  | { status: 'completed'; text: string }
  | { status: 'failed'; reason: string };

export interface ReviewBriefModelGateway {
  generate(request: ReviewBriefModelRequest): Promise<ReviewBriefModelResult>;
}
