/**
 * verdict 落盘：~\.dsh\jev-gamedev\decisions-YYYY-MM.jsonl（追加只读统计）。
 */
import type { GateResult } from './jev.ts';
export interface DecisionRecord {
    pointId: string;
    pointTitle: string;
    samples: number;
    mean: number;
    confidence: number;
    verdict: GateResult['verdict'];
    divergent: boolean;
    override: boolean;
    at: string;
}
export declare class JevStore {
    readonly dataDir: string;
    constructor(dataDir: string | undefined);
    fileFor(at: string): string;
    append(record: DecisionRecord): void;
    readAll(): {
        records: DecisionRecord[];
        skipped: number;
    };
}
export interface JevStats {
    count: number;
    divergent: number;
    override: number;
    byPoint: Map<string, number>;
    byVerdict: Map<string, number>;
}
export declare function summarize(records: readonly DecisionRecord[]): JevStats;
export declare function renderStats(stats: JevStats): string;
//# sourceMappingURL=store.d.ts.map