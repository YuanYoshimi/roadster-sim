// Shared presentation for deterministic, measured coaching.
export function focusText(focus, lang = "en", dataset = "live") {
  const example = dataset === "demo" ? (lang === "ja" ? "例のデータ: " : "Example data: ") : "";
  if (focus.metric === "brakedEarlyMeters") {
    return example + (lang === "ja" ? focus.corner + "では次の有効な周回でブレーキを" + focus.actionMeters + "m遅らせて比較しましょう。" :
      "At " + focus.corner + ", try braking " + focus.actionMeters + " m later on the next valid lap, then compare.");
  }
  return example + (lang === "ja" ? focus.corner + "では次の有効な周回でアクセル開始を" + focus.actionMeters + "m早めて比較しましょう。" :
    "At " + focus.corner + ", try picking up throttle " + focus.actionMeters + " m earlier on the next valid lap, then compare.");
}

export function outcomeText(outcome, lang = "en", dataset = "live") {
  const example = dataset === "demo" ? (lang === "ja" ? "例: " : "Example: ") : "";
  const movement = Math.abs(outcome.metricChangeMeters);
  const change = Math.abs(outcome.lossChangeSeconds);
  if (lang === "ja") {
    return example + outcome.corner + "の操作位置の変化は" + outcome.metricChangeMeters + "m、タイムロスは" +
      (outcome.lossChangeSeconds >= 0 ? change + "秒減少" : change + "秒増加") + "。同条件の1回の比較で、因果関係は未確認です。";
  }
  let behavior;
  if (outcome.metric === "brakedEarlyMeters") behavior = "braking moved " + movement + " m " + (outcome.metricChangeMeters >= 0 ? "later" : "earlier");
  else behavior = "throttle pickup moved " + movement + " m " + (outcome.metricChangeMeters >= 0 ? "earlier" : "later");
  return example + outcome.corner + " " + behavior + "; time loss " + (outcome.lossChangeSeconds >= 0 ? "fell " : "rose ") +
    change + " s versus the pre-cue lap. One comparable attempt; cause unproven.";
}
