/**
 * dsh wiring for jev-gamedev：把 Jev 原子决策纪律装进游戏开发会话。
 * systemPrompt 注入纪律四条；tools 让模型自主出题/聚合；commands 提供
 * /jev gate 的 5 次独立采样问答流程与统计。
 */
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import { defineTool } from '@deepseek-ai/dsh-tools';
import type {} from '@deepseek-ai/dsh-commands';
import type {} from '@deepseek-ai/dsh-system-prompt';

import { judge, type GateLimits, type GateResult, type JudgementInput } from './jev.ts';
import { POINTS, buildSheet, pointById } from './sheet.ts';
import { JevStore, renderStats, summarize, type DecisionRecord } from './store.ts';

export const name = 'jev-gamedev';
export const inject = ['commands', 'tools', 'systemPrompt'];

export interface Config {
  enabled: boolean;
  dataDir?: string;
  samples: number;
  autoGate: number;
  reviewGate: number;
  divergentRange: number;
  order: number;
}

export const Config = Schema.object({
  enabled: Schema.boolean().default(true),
  dataDir: Schema.string(),
  samples: Schema.natural().default(5),
  autoGate: Schema.percent().default(0.85),
  reviewGate: Schema.percent().default(0.6),
  divergentRange: Schema.percent().default(0.5),
  order: Schema.number().default(740),
});

const DISCIPLINE = [
  '**Jev 原子判断纪律（游戏开发）**',
  '1. 每个决策只用一个"看一眼就能答"的原子判断；多因素拆开在代码里加权。',
  '2. 档位判断按情形答，不要依据档位编号取中间值。',
  '3. Choice 每次附上选项概率分布（和为 1），分布越尖越自信。',
  '4. /jev gate 走的 5 次采样必须各自独立取证，禁止参考前几轮答案。',
].join('\n');

function limitsOf(config: Config): GateLimits {
  return {
    autoGate: config.autoGate,
    reviewGate: config.reviewGate,
    divergentRange: config.divergentRange,
  };
}

function renderVerdict(pointId: string, result: GateResult): string {
  const flag = result.divergent ? ` ⚠ 分歧（${result.divergentWhy}）→ 已降档` : '';
  const override = result.override
    ? `\n⚠ 结果与你预设的直觉「${result.intuitive === 'yes' ? '是' : '否'}」相反——分歧就是信息，先复核再动手。`
    : '';
  return [
    `[${pointId}] mean=${result.mean} · 惩罚后=${result.penalized} · 置信=${result.confirmed}`,
    `结论：${result.verdict.toUpperCase()} —— ${result.note}${flag}${override}`,
  ].join('\n');
}

export function apply(ctx: Context, config: Config): void {
  const log = ctx.logger(name);
  if (!config.enabled) return void log.info('disabled by config');
  if (config.samples < 1) throw new TypeError('jev-gamedev: samples 必须 ≥ 1');
  if (!(config.reviewGate < config.autoGate)) throw new TypeError('jev-gamedev: reviewGate 必须小于 autoGate');
  const limits = limitsOf(config);
  const store = new JevStore(config.dataDir);

  ctx.systemPrompt.section({ name, order: config.order, text: () => DISCIPLINE });

  const recordAndRender = (pointId: string, result: GateResult, samples: number): string => {
    const point = pointById(pointId);
    const record: DecisionRecord = {
      pointId,
      pointTitle: point?.title ?? '',
      samples,
      mean: result.mean,
      confidence: result.confirmed,
      verdict: result.verdict,
      divergent: result.divergent,
      override: result.override,
      at: new Date().toISOString(),
    };
    store.append(record);
    return renderVerdict(pointId, result);
  };

  ctx.commands.register({
    name: 'jev',
    description: 'Jev 决策门控：/jev list | gate <P1..P8> [直觉:是|否] | stats | sheet <id>',
    input: { hint: '<list|gate|stats|sheet> …' },
    handler: ({ rawInput }) => {
      const raw = String(rawInput ?? '').trim();
      const [verb = '', ...rest] = raw.split(/\s+/);
      if (!verb || verb === 'list') {
        const lines = POINTS.map((point) => `  ${point.id} ${point.title}（${point.kind}）`);
        return { kind: 'success', text: [`游戏开发决策点 ${POINTS.length} 个（/jev gate <id> 走 5 采样流程）：`, ...lines].join('\n') };
      }
      if (verb === 'sheet') {
        const point = pointById(rest[0] ?? '');
        if (!point) return { kind: 'error', text: `/jev sheet <id>（id 见 /jev list）` };
        return { kind: 'success', text: buildSheet(point) };
      }
      if (verb === 'stats') {
        return { kind: 'success', text: renderStats(summarize(store.readAll().records)) };
      }
      if (verb === 'gate') {
        const id = rest.find((token) => /^p\d+$/i.test(token))?.toUpperCase() ?? '';
        const point = pointById(id);
        if (!point) return { kind: 'error', text: '/jev gate <P1..P8> [直觉:是|否] —— id 见 /jev list' };
        const intuition = /直觉[:：]\s*是/.test(raw) ? '是' : /直觉[:：]\s*否/.test(raw) ? '否' : undefined;
        const text = [
          `决策点 ${point.id}「${point.title}」：请按下面的问题表回答 ${config.samples} 次，每次独立取证。${intuition ? `（已记录直觉相悖倾向：${intuition}）` : ''}`,
          buildSheet(point),
          '/jev gate 收满采样后自动聚合。直接回复答案时请标明第几轮。',
        ].join('\n');
        return { kind: 'success', text };
      }
      return { kind: 'error', text: `不认识的动作「${verb}」。可用：list / gate / sheet / stats` };
    },
  });

  ctx.tools.register(
    defineTool({
      name: 'jev_sheet',
      description: '取出某个游戏开发决策点的 Jev 答题表（Score 档位已隐藏编号）。决定立项/内容范围/demo 判定前先用它出题。',
      parameters: {
        pointId: { type: 'string', required: true, description: 'P1..P8，见 /jev list' },
      },
      output: {
        schema: { type: 'string' } as const,
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      presentCall: () => ({ card: 'generic' as const, title: 'Jev 出题', kind: 'search' as const }),
      presentResult: (_args, value) => ({ card: 'generic' as const, title: String(value).split('\n')[0]!.slice(0, 60), kind: 'search' as const, rawInput: value }),
      async execute(args) {
        const point = pointById(String(args.pointId ?? '').toUpperCase());
        if (!point) return `没有这个决策点。可用：${POINTS.map((entry) => entry.id).join(' ')}`;
        return buildSheet(point);
      },
    }),
  );

  ctx.tools.register(
    defineTool({
      name: 'jev_ask',
      description: '把一组 Jev 采样聚合成裁决：5 次独立采样 → 均值×离散惩罚 → 风险分层（≥autoGate 自动 / ≥reviewGate 复核 / 低置信转人工），分歧或直觉相悖都会标记。',
      parameters: {
        pointId: { type: 'string', required: true, description: 'P1..P8' },
        samples: { type: 'array', required: true, description: `同型判断数组，每份 {kind, prob|value|probabilities, evidence}；≥${config.samples} 份更稳` },
        preset: { type: 'string', description: '直觉预设 yes|no，用于 override 标记' },
      },
      output: {
        schema: { type: 'string' } as const,
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      presentCall: () => ({ card: 'generic' as const, title: 'Jev 聚合', kind: 'edit' as const }),
      presentResult: (_args, value) => ({ card: 'generic' as const, title: String(value).split('\n')[0]!.slice(0, 60), kind: 'edit' as const, rawInput: value }),
      async execute(args) {
        const id = String(args.pointId ?? '').toUpperCase();
        const point = pointById(id);
        if (!point) return `没有这个决策点。可用：${POINTS.map((entry) => entry.id).join(' ')}`;
        const list = Array.isArray(args.samples) ? (args.samples as JudgementInput[]) : [];
        if (!list.length) return 'samples 为空：至少带回一份判断（建议 5 份独立采样）。';
        let result: GateResult;
        try {
          result = judge(list, args.preset === 'yes' || args.preset === 'no' ? args.preset : undefined, limits);
        } catch (error) {
          return `采样无效：${String(error instanceof Error ? error.message : error)}`;
        }
        return recordAndRender(id, result, list.length);
      },
    }),
  );

  log.info(`mounted · ${store.dataDir} · samples=${config.samples} gates=${config.reviewGate}/${config.autoGate} order=${config.order}`);
}
