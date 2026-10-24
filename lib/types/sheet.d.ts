/**
 * 游戏开发决策点表 P1..P8。遵守 Jev 纪律：
 *   1. 一题只问一个"看一眼就能答"的原子判断；
 *   2. 档位写情形不写程度；
 *   3. Choice 选项留"其他"；
 *   4. 渲染给答题者时隐藏档位编号。
 */
import type { Choice, Noul, Score } from './jev.ts';
export interface PointBase {
    id: string;
    title: string;
    /** 建议答题者的视角（隐藏档位编号的渲染由 buildSheet 负责） */
    ask: string;
}
export interface NoulPoint extends PointBase {
    kind: 'noul';
}
export interface ChoicePoint extends PointBase {
    kind: 'choice';
    options: readonly string[];
}
export interface ScorePoint extends PointBase {
    kind: 'score';
    legend: readonly string[];
}
export type GamedevPoint = NoulPoint | ChoicePoint | ScorePoint;
export declare const POINTS: readonly GamedevPoint[];
export declare function pointById(id: string): GamedevPoint | undefined;
/** 渲染答题表：Score 档位不带编号，Choice 保持原序，Noul 直接问。 */
export declare function buildSheet(point: GamedevPoint): string;
/** 把决策点转换成第一份采样的模板（question 带上 point 上下文） */
export declare function blankJudge(point: GamedevPoint): Noul | Choice | Score;
//# sourceMappingURL=sheet.d.ts.map