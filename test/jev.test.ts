/** 纯函数测试：三原语校验、归一、置信度、聚合、门控、档位隐藏。 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  aggregate,
  confidenceOf,
  gate,
  judge,
  judgeConfidence,
  normalize,
  validateJudgement,
  GATE_DEFAULTS,
  type Choice,
  type Noul,
  type Score,
} from '../src/jev.ts';

import { POINTS, blankJudge, buildSheet, pointById } from '../src/sheet.ts';

const noul = (prob: number, topic: string): Noul => ({ kind: 'noul', question: topic, prob, evidence: '' });
const choice = (value: string, topic: string, probs?: number[]): Choice =>
  ({ kind: 'choice', question: topic, options: ['甲', '乙', '其他'], value, probabilities: probs, evidence: '' });
const score = (value: number, topic: string): Score =>
  ({ kind: 'score', question: topic, legend: ['一档', '二档', '三档', '四档'], value, evidence: '' });

test('normalize 归一并兜底全零', () => {
  assert.deepEqual(normalize([1, 3]), [0.25, 0.75]);
  assert.deepEqual(normalize([0, 0, 0]), [1 / 3, 1 / 3, 1 / 3]);
});

test('confidenceOf：尖峰高、平坦低、带边际锐化', () => {
  assert.ok(confidenceOf([0.98, 0.01, 0.01]) > confidenceOf([0.5, 0.25, 0.25]));
  assert.equal(confidenceOf([0.9, 0.1]), 1);
  assert.equal(confidenceOf([]), 0);
});

test('validateJudgement：概率域/选项归属/档位域逐一拦截', () => {
  assert.throws(() => validateJudgement({ kind: 'noul', question: '?', prob: 1.4, evidence: '' }), /0~1/);
  assert.throws(() => validateJudgement({ kind: 'choice', question: '?', options: ['甲'], value: '甲', evidence: '' }), /至少两项/);
  assert.throws(() => validateJudgement(choice('丙', '不在选项')), /不在 options/);
  assert.throws(() => validateJudgement({ kind: 'score', question: '?', legend: ['a'], value: 0, evidence: '' }), /至少两档/);
  assert.throws(() => validateJudgement(score(4, '越界')), /0~3/);
  assert.throws(() => validateJudgement({ kind: 'wrong', evidence: '' } as never), /不认识/);

  const ok = validateJudgement({ ...choice('乙', 'Vet'), probabilities: [2, 2, 4], evidence: 'x' });
  assert.equal(ok.kind, 'choice');
  if (ok.kind === 'choice') assert.deepEqual([...ok.probabilities!], [0.25, 0.25, 0.5]);
});

test('judgeConfidence：Noul 贴边高、中心低；Choice 用分布', () => {
  assert.ok(judgeConfidence(noul(0.97, 'a')) > judgeConfidence(noul(0.55, 'b')));
  const withDist = choice('甲', 'c', [0.8, 0.1, 0.1]);
  assert.ok(judgeConfidence(withDist) > 0.75);
});

test('aggregate(choice)：多数占比=mean，并列/弱多数 → divergent', () => {
  const solid = aggregate([choice('甲', 'x'), choice('甲', 'x'), choice('甲', 'x'), choice('乙', 'x'), choice('甲', 'x')]);
  assert.equal(solid.divergent, false);
  assert.equal(solid.mean, 0.8);

  const tied = aggregate([choice('甲', 'x'), choice('甲', 'x'), choice('乙', 'x'), choice('乙', 'x'), choice('其他', 'x')]);
  assert.equal(tied.divergent, true);
  assert.match(tied.divergentWhy, /并列/);

  const weak = aggregate([choice('甲', 'x'), choice('乙', 'x'), choice('乙', 'x'), choice('其他', 'x'), choice('甲', 'x')]);
  assert.equal(weak.divergent, true);
});

test('aggregate(noul/score)：均值×离散惩罚，跨度超限判分歧', () => {
  const tight = aggregate([noul(0.9, 'x'), noul(0.9, 'x'), noul(0.9, 'x'), noul(0.9, 'x'), noul(0.9, 'x')]);
  assert.equal(tight.mean, 0.9);
  assert.equal(tight.range, 0);
  assert.equal(tight.penalized, 0.9);
  assert.equal(tight.divergent, false);

  const spread = aggregate([noul(0, 'x'), noul(1, 'x'), noul(0, 'x'), noul(1, 'x'), noul(0, 'x')]);
  assert.equal(spread.range, 1);
  assert.equal(spread.divergent, true);
  assert.ok(spread.penalized < spread.mean);

  const scores = aggregate([score(0.5, 'y'), score(0.5, 'y'), score(3, 'y'), score(3, 'y'), score(1.5, 'y')]);
  assert.ok(scores.range > 0.5);
  assert.equal(scores.divergent, true);
  assert.ok(scores.mean > 0.4 && scores.mean < 0.7);
});

test('aggregate：采样为空/混型直接抛', () => {
  assert.throws(() => aggregate([]), /至少需要一份/);
  assert.throws(() => aggregate([noul(0.5, 'x'), score(0.5, 'y')]), /同一/);
});

test('gate：三档阈值 + divergent 降一档', () => {
  assert.deepEqual(gate(0.9).verdict, 'auto');
  assert.deepEqual(gate(0.7).verdict, 'review');
  assert.deepEqual(gate(0.3).verdict, 'human');
  assert.deepEqual(gate(0.9, GATE_DEFAULTS, true).verdict, 'review');
  assert.deepEqual(gate(0.7, GATE_DEFAULTS, true).verdict, 'human');
  const human = gate(0.3, GATE_DEFAULTS, true);
  assert.deepEqual(human.verdict, 'human');
});

test('judge 全链路：override 与 confirms 都能命中', () => {
  const agreeYes = judge([noul(0.9, 'x'), noul(0.9, 'x'), noul(0.9, 'x'), noul(0.9, 'x'), noul(0.9, 'x')], 'yes');
  assert.equal(agreeYes.verdict, 'auto');
  assert.equal(agreeYes.overrideIs, 'confirms');

  const againstPreset = judge([noul(0.9, 'x'), noul(0.9, 'x'), noul(0.9, 'x'), noul(0.9, 'x'), noul(0.9, 'x')], 'no');
  assert.equal(againstPreset.overrideIs, 'override');
  assert.equal(againstPreset.override, true);
});

test('P1..P8 覆盖三种原语，blankJudge 可作为模板', () => {
  assert.equal(POINTS.length, 8);
  assert.ok(POINTS.some((point) => point.kind === 'noul'));
  assert.ok(POINTS.some((point) => point.kind === 'choice'));
  assert.ok(POINTS.some((point) => point.kind === 'score'));
  assert.ok(POINTS.filter((point) => point.kind === 'choice').every((point) => point.options.includes('其他')));
  assert.equal(pointById('P2')!.kind, 'score');
  assert.equal(pointById('NOPE'), undefined);
  const blank = blankJudge(pointById('P5')!);
  assert.equal(blank.kind, 'score');
});

test('buildSheet：Score 档位隐藏编号、Choice 带字母选项', () => {
  const sheet = buildSheet(pointById('P7')!);
  assert.ok(!/[0-3]?\s*档/.test(sheet) || sheet.includes('·'));
  assert.ok(!/第1档|第2档/.test(sheet), '档位编号不得出现');
  const choiceSheet = buildSheet(pointById('P8')!);
  assert.match(choiceSheet, /A\. /);
  assert.match(choiceSheet, /其他/);
});
