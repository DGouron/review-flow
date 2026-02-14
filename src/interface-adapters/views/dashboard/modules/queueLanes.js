/**
 * @template MergeRequest
 * @param {MergeRequest[]} rankedPendingFix
 * @param {MergeRequest[]} pendingApproval
 * @returns {{
 *   nowLaneItem: MergeRequest | null,
 *   needsFixItems: MergeRequest[],
 *   readyToApproveItems: MergeRequest[],
 *   nowLaneCount: number,
 *   needsFixCount: number,
 *   readyToApproveCount: number
 * }}
 */
export function buildQueueLanesModel(rankedPendingFix, pendingApproval) {
  const nowLaneItem = rankedPendingFix[0] ?? null;
  const needsFixItems = rankedPendingFix.slice(1);
  const readyToApproveItems = [...pendingApproval];

  return {
    nowLaneItem,
    needsFixItems,
    readyToApproveItems,
    nowLaneCount: nowLaneItem ? 1 : 0,
    needsFixCount: needsFixItems.length,
    readyToApproveCount: readyToApproveItems.length,
  };
}
