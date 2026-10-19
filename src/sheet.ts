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

export const POINTS: readonly GamedevPoint[] = [
  { id: 'P1', kind: 'noul', title: '核概念成立', ask: '用一句话说出这个游戏的核心概念后，一个没玩过的玩家能不能复述出"我想试试它"的理由？' },
  { id: 'P2', kind: 'score', title: '玩法手感成立',
    ask: '当前的玩法原型（哪怕只是纸面跑动或灰盒）给玩家 5 分钟，他会发生什么？',
    legend: [
      '5 分钟内没有主动操作反馈，玩家放下手柄去找别的',
      '玩家会熟练完成基础操作，但停下来问"然后呢"',
      '玩家在时间到时仍想再操作一局，并自发尝试别的做法',
      '玩家把手机/手柄递给别人说"你也试试这个"',
    ] },
  { id: 'P3', kind: 'choice', title: '首关难度曲线',
    ask: '新手第一次完整打完首关的最可能结局是：',
    options: ['一次通过且几乎没停顿', '失败 1~2 次后通过', '反复失败后通过', '没打完就退出', '其他'] },
  { id: 'P4', kind: 'noul', title: '15 秒爽点', ask: '进游戏最初 15 秒内，玩家是否会遇到至少一个可感知的正反馈（掉落/技能/大场面）？' },
  { id: 'P5', kind: 'score', title: '美术成本可控',
    ask: '为实现美术需求所需的资源（人力/资产/外包）现状是：',
    legend: [
      '需要 3 人月以上的专职美术制作',
      '现有素材改一改就能用，缺 1~2 个关键资产',
      '程序生成/占位也说得过去，成品前需少量补做',
      '现有素材已覆盖全部需求',
    ] },
  { id: 'P6', kind: 'noul', title: '删 20% 还成立', ask: '把玩法/内容范围砍掉 20% 后，这个游戏的核心乐趣是否依然完整成立？' },
  { id: 'P7', kind: 'score', title: 'demo 验收',
    ask: '把当前版本给一位从未听过的玩家玩 10 分钟，他的反应是：',
    legend: [
      '2 分钟内退出或明显分心',
      '玩完但问"后面有更多吗"且语气平淡',
      '玩完主动问还剩多少内容、什么时候出',
      '主动要求再来一局或拿走传播',
    ] },
  { id: 'P8', kind: 'choice', title: '继续做的理由',
    ask: '如果明天所有外部压力消失（投稿截止/点赞数据都不存在），你仍会继续做它的原因是：',
    options: ['还有一两个机制我自己想玩', '它是我表达的唯一出口', '仅因沉没成本', '其他'] },
];

export function pointById(id: string): GamedevPoint | undefined {
  return POINTS.find((point) => point.id === id);
}

/** 渲染答题表：Score 档位不带编号，Choice 保持原序，Noul 直接问。 */
export function buildSheet(point: GamedevPoint): string {
  if (point.kind === 'noul') {
    return `[${point.id} ${point.title}] 是/否（0~1 概率）：${point.ask}`;
  }
  if (point.kind === 'choice') {
    const options = point.options.map((option, index) => `${String.fromCharCode(65 + index)}. ${option}`).join('\n  ');
    return `[${point.id} ${point.title}] 单选（附选项概率和 1 的分布）：\n  ${options}`;
  }
  const legend = point.legend.map((line) => `  · ${line}`).join('\n');
  return `[${point.id} ${point.title}] 位置打分 0..${point.legend.length - 1}（每档独立判断，档位已隐藏对应情形）：\n${legend}`;
}

/** 把决策点转换成第一份采样的模板（question 带上 point 上下文） */
export function blankJudge(point: GamedevPoint): Noul | Choice | Score {
  const base = { evidence: '' };
  if (point.kind === 'noul') return { ...base, kind: 'noul', question: point.ask, prob: 0.5 };
  if (point.kind === 'choice') return { ...base, kind: 'choice', question: point.ask, options: [...point.options], value: '其他' };
  return { ...base, kind: 'score', question: point.ask, legend: [...point.legend], value: 0 };
}
