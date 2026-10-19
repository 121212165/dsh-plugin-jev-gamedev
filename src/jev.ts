/**
 * Jev 三原语（Noul / Choice / Score）+ 五采样聚合 + 风险分层门控。
 * 移植自 novel-ai-writing-system/src/jev-judge/primitives.py 与
 * obsidian-plugins/jev-decision-log 的聚合口径：
 *   - 聚合 = 均值 × 离散惩罚（k = 1 − range/2）
 *   - 分歧 = range > 阈值，或 Choice 非唯一 argmax → 降一档风险
 *   - 门控：≥autoGate 自动执行 / ≥reviewGate 执行+复核 / 否则转人工
 */

export const GATE_DEFAULTS: GateLimits = {
  autoGate: 0.85,
  reviewGate: 0.6,
  divergentRange: 0.5,
};

export interface GateLimits {
  autoGate: number;
  reviewGate: number;
  divergentRange: number;
}

export type Verdict = 'auto' | 'review' | 'human';

export interface Noul {
  kind: 'noul';
  question: string;
  /** 0~1，"是"的概率；概率本身即答案 */
  prob: number;
  evidence: string;
}

export interface Choice {
  kind: 'choice';
  question: string;
  options: readonly string[];
  /** 必须落在 options 内（含"其他"） */
  value: string;
  /** 选项概率分布，和为 1；为空时按 one-hot 归一 */
  probabilities?: readonly number[] | undefined;
  evidence: string;
}

export interface Score {
  kind: 'score';
  question: string;
  /** 每档写成具体情形；渲染给答题者时隐藏档位编号 */
  legend: readonly string[];
  /** 0..legend.length-1 的位置，可带小数 */
  value: number;
  probabilities?: readonly number[] | undefined;
  evidence: string;
}

export type Judgement = Noul | Choice | Score;

export type JudgementInput =
  | (Omit<Noul, 'kind'> & { kind: string })
  | (Omit<Choice, 'kind'> & { kind: string })
  | (Omit<Score, 'kind'> & { kind: string });

const EPS = 1e-9;

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function normalize(probs: readonly number[]): number[] {
  const total = probs.reduce((sum, p) => sum + p, 0);
  if (!probs.length || total <= EPS || !Number.isFinite(total)) {
    return probs.map(() => 1 / Math.max(1, probs.length));
  }
  return probs.map((p) => p / total);
}

/** 置信度 = top1 概率 + 边际钝化（对齐 primitives.py） */
export function confidenceOf(probs: readonly number[]): number {
  if (!probs.length) return 0;
  const sorted = [...probs].sort((a, b) => b - a);
  const top = sorted[0] ?? 0;
  const next = sorted[1] ?? 0;
  return round(Math.min(1, 0.5 * top + 0.5 * (top + (top - next))), 3);
}

/** 单个判断的置信度：Noul 用与 0.5 的距离；Choice/Score 用分布形状 */
export function judgeConfidence(judge: Judgement): number {
  if (judge.kind === 'noul') {
    return round(0.5 + 0.5 * Math.abs(judge.prob * 2 - 1), 3);
  }
  const dist = judge.kind === 'choice'
    ? normalize(judge.probabilities ?? judge.options.map((option) => (option === judge.value ? 1 : 0)))
    : normalize(judge.probabilities ?? judge.legend.map((_, index) => (Math.round(judge.value) === index ? 1 : 0)));
  return confidenceOf(dist);
}

export function validateJudgement(raw: JudgementInput): Judgement {
  const evidence = String(raw.evidence ?? '');
  if (raw.kind === 'noul') {
    const prob = Number((raw as Noul).prob);
    if (!Number.isFinite(prob) || prob < 0 || prob > 1) {
      throw new TypeError(`noul prob 必须在 0~1: ${prob}`);
    }
    return { kind: 'noul', question: String(raw.question), prob, evidence };
  }
  if (raw.kind === 'choice') {
    const choice = raw as Choice;
    if (!Array.isArray(choice.options) || choice.options.length < 2) {
      throw new TypeError('choice options 至少两项（应含"其他"）');
    }
    if (!choice.options.includes(choice.value)) {
      throw new TypeError(`choice value「${choice.value}」不在 options 内`);
    }
    const probs = choice.probabilities ? normalize(choice.probabilities) : undefined;
    if (probs && probs.length !== choice.options.length) {
      throw new TypeError('choice probabilities 长度必须等于 options');
    }
    return {
      kind: 'choice',
      question: choice.question,
      options: [...choice.options],
      value: choice.value,
      ...(probs ? { probabilities: probs } : {}),
      evidence,
    };
  }
  if (raw.kind === 'score') {
    const score = raw as Score;
    if (!Array.isArray(score.legend) || score.legend.length < 2) {
      throw new TypeError('score legend 至少两档');
    }
    const max = score.legend.length - 1;
    const value = Number(score.value);
    if (!Number.isFinite(value) || value < 0 || value > max) {
      throw new TypeError(`score value 必须在 0~${max}`);
    }
    const probs = score.probabilities ? normalize(score.probabilities) : undefined;
    return {
      kind: 'score',
      question: score.question,
      legend: [...score.legend],
      value,
      ...(probs ? { probabilities: probs } : {}),
      evidence,
    };
  }
  throw new TypeError(`不认识的判断类型「${raw.kind}」，可用 kind: noul | choice | score`);
}

export interface Aggregate {
  /** 已归一到 0~1（Choice = 多数派占比；Noul/Score = 值的均值） */
  mean: number;
  /** 归一跨度 0~1 */
  range: number;
  /** mean × 离散惩罚后的分数（门控输入） */
  penalized: number;
  divergent: boolean;
  divergentWhy: string;
}

/**
 * 聚合 N 份同型采样。Choice 的发散 = 非唯一多数派或多数占比 < 0.5。
 */
export function aggregate(samples: readonly Judgement[], limits: GateLimits = GATE_DEFAULTS): Aggregate {
  if (!samples.length) throw new TypeError('aggregate: 至少需要一份采样');
  if (new Set(samples.map((sample) => sample.kind)).size > 1) {
    throw new TypeError('aggregate: 所有采样必须是同一种判断类型');
  }
  const first = samples[0]!;
  if (first.kind === 'choice') return aggregateChoice(samples as readonly Choice[], limits);
  if (first.kind === 'noul') return aggregateLinear(samples as readonly Noul[], limits, 1);
  return aggregateLinear(samples as readonly Score[], limits, maxOf(first.legend.length - 1, 1));
}

function maxOf(a: number, b: number): number {
  return a >= b ? a : b;
}

/** Noul/Score：均值 → 离散惩罚；range = (max−min)/归一化跨度 */
function aggregateLinear(samples: readonly (Noul | Score)[], limits: GateLimits, span: number): Aggregate {
  const values = samples.map((sample) => (sample.kind === 'noul' ? sample.prob : sample.value));
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const range = Math.max(...values) - Math.min(...values);
  return finish(mean / span, range / span, range > limits.divergentRange, `采样跨度 ${(range / span).toFixed(2)} > ${limits.divergentRange}`);
}

/** Choice：多数派占比即 mean；非唯一多数派 / 占比 < 0.5 → divergent */
function aggregateChoice(samples: readonly Choice[], _limits: GateLimits): Aggregate {
  const counts = new Map<string, number>();
  for (const sample of samples) counts.set(sample.value, (counts.get(sample.value) ?? 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const topShare = (sorted[0]?.[1] ?? 0) / samples.length;
  const tied = (sorted.length > 1 && sorted[0]![1] === sorted[1]![1]);
  const divergent = tied || topShare < 0.5;
  const why = tied ? '多数派并列' : `多数派占比 ${topShare.toFixed(2)} < 0.5`;
  return finish(topShare, 1 - topShare, divergent, why);
}

function finish(mean: number, range: number, divergent: boolean, why: string): Aggregate {
  const penalized = round(Math.max(0, mean * (1 - Math.max(0, range) / 2)));
  return { mean: round(mean), range: round(range), penalized, divergent, divergentWhy: divergent ? why : '' };
}

/** 风险分层门控；divergent 一律降一档 */
export function gate(score: number, limits: GateLimits = GATE_DEFAULTS, divergent = false): { verdict: Verdict; note: string } {
  let verdict: Verdict = score >= limits.autoGate ? 'auto' : score >= limits.reviewGate ? 'review' : 'human';
  if (divergent && verdict !== 'human') {
    verdict = verdict === 'auto' ? 'review' : 'human';
  }
  const note = verdict === 'auto' ? '风险满足，可自动执行'
    : verdict === 'review' ? '继续执行，但需标记复核' : '转人工裁决或回滚（低置信）';
  return { verdict, note };
}

export interface GateResult extends Aggregate {
  verdict: Verdict;
  note: string;
  confirmed: number;
  intuitive: string;
  override: boolean;
  overrideIs: 'none' | 'override' | 'confirms';
}

/** 完整决策：聚合 → 门控 → 与直觉预设比对 */
export function judge(inputs: readonly JudgementInput[], preset: 'yes' | 'no' | undefined, limits: GateLimits = GATE_DEFAULTS): GateResult {
  const samples = inputs.map(validateJudgement);
  const agg = aggregate(samples, limits);
  const { verdict, note } = gate(agg.penalized, limits, agg.divergent);
  return {
    ...agg,
    verdict,
    note,
    confirmed: round(samples.reduce((sum, sample) => sum + judgeConfidence(sample), 0) / samples.length),
    intuitive: preset ?? '',
    override: Boolean(preset) && (agg.mean >= 0.5) !== (preset === 'yes'),
    overrideIs: !preset ? 'none' : (agg.mean >= 0.5) !== (preset === 'yes') ? 'override' : 'confirms',
  };
}
