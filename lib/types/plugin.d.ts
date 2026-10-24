/**
 * dsh wiring for jev-gamedev：把 Jev 原子决策纪律装进游戏开发会话。
 * systemPrompt 注入纪律四条；tools 让模型自主出题/聚合；commands 提供
 * /jev gate 的 5 次独立采样问答流程与统计。
 */
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
export declare const name = "jev-gamedev";
export declare const inject: string[];
export interface Config {
    enabled: boolean;
    dataDir?: string;
    samples: number;
    autoGate: number;
    reviewGate: number;
    divergentRange: number;
    order: number;
}
export declare const Config: Schema<Schemastery.ObjectS<{
    enabled: Schema<boolean, boolean>;
    dataDir: Schema<string, string>;
    samples: Schema<number, number>;
    autoGate: Schema<number, number>;
    reviewGate: Schema<number, number>;
    divergentRange: Schema<number, number>;
    order: Schema<number, number>;
}>, Schemastery.ObjectT<{
    enabled: Schema<boolean, boolean>;
    dataDir: Schema<string, string>;
    samples: Schema<number, number>;
    autoGate: Schema<number, number>;
    reviewGate: Schema<number, number>;
    divergentRange: Schema<number, number>;
    order: Schema<number, number>;
}>>;
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=plugin.d.ts.map