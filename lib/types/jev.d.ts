/**
 * Jev 三原语（Noul / Choice / Score）+ 五采样聚合 + 风险分层门控。
 * 移植自 novel-ai-writing-system/src/jev-judge/primitives.py 与
 * obsidian-plugins/jev-decision-log 的聚合口径：
 *   - 聚合 = 均值 × 离散惩罚（k = 1 − range/2）
 *   - 分歧 = range > 阈值，或 Choice 非唯一 argmax → 降一档风险
 *   - 门控：≥autoGate 自动执行 / ≥reviewGate 执行+复核 / 否则转人工
 */
export declare const GATE_DEFAULTS: GateLimits;
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
export type JudgementInput = (Omit<Noul, 'kind'> & {
    kind: string;
}) | (Omit<Choice, 'kind'> & {
    kind: string;
}) | (Omit<Score, 'kind'> & {
    kind: string;
});
export declare function normalize(probs: readonly number[]): number[];
/** 置信度 = top1 概率 + 边际钝化（对齐 primitives.py） */
export declare function confidenceOf(probs: readonly number[]): number;
/** 单个判断的置信度：Noul 用与 0.5 的距离；Choice/Score 用分布形状 */
export declare function judgeConfidence(judge: Judgement): number;
export declare function validateJudgement(raw: JudgementInput): Judgement;
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
export declare function aggregate(samples: readonly Judgement[], limits?: GateLimits): Aggregate;
/** 风险分层门控；divergent 一律降一档 */
export declare function gate(score: number, limits?: GateLimits, divergent?: boolean): {
    verdict: Verdict;
    note: string;
};
export interface GateResult extends Aggregate {
    verdict: Verdict;
    note: string;
    confirmed: number;
    intuitive: string;
    override: boolean;
    overrideIs: 'none' | 'override' | 'confirms';
}
/** 完整决策：聚合 → 门控 → 与直觉预设比对 */
export declare function judge(inputs: readonly JudgementInput[], preset: 'yes' | 'no' | undefined, limits?: GateLimits): GateResult;
//# sourceMappingURL=jev.d.ts.map