/** 装配测试：脚本化 mock dsh context，watchCommands/tools/section 走真实 apply()。 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after } from 'node:test';

import { apply } from '../src/plugin.ts';

interface Command { name: string; handler: (args: { rawInput?: string }) => { kind: string; text: string } }
interface Tool { name: string; execute: (args: Record<string, unknown>) => Promise<string> }
interface Section { name: string; order: number; text: () => string }

const dataDir = join(mkdtempSync(join(tmpdir(), 'jev-wire-')), 'data');
after(() => rmSync(join(dataDir, '..'), { recursive: true, force: true }));

const commands: Command[] = [];
const tools: Tool[] = [];
const sections: Section[] = [];
const ctx = {
  logger: () => ({ info() {}, warn() {} }),
  commands: { register(definition: Command) { commands.push(definition); } },
  tools: { register(definition: Tool) { tools.push(definition); } },
  systemPrompt: { section(section: Section) { sections.push(section); } },
} as never;
apply(ctx, { enabled: true, dataDir, samples: 5, autoGate: 0.85, reviewGate: 0.6, divergentRange: 0.5, order: 740 });

const command = (name: string): Command => commands.find((entry) => entry.name === name)!;
const tool = (name: string): Tool => tools.find((entry) => entry.name === name)!;

test('装配：/jev 命令 + 2 工具 + 1 prompt 段', () => {
  assert.ok(command('jev'));
  assert.ok(tool('jev_ask'));
  assert.ok(tool('jev_sheet'));
  const section = sections.find((entry) => entry.name === 'jev-gamedev');
  assert.ok(section);
  assert.match(section!.text(), /原子判断纪律/);
});

test('/jev list 与 sheet', () => {
  const list = command('jev').handler({ rawInput: 'list' });
  assert.equal(list.kind, 'success');
  assert.match(list.text, /P1/);
  assert.match(list.text, /P8/);

  const sheet = command('jev').handler({ rawInput: 'sheet P6' });
  assert.equal(sheet.kind, 'success');
  assert.match(sheet.text, /删 20%/);

  assert.equal(command('jev').handler({ rawInput: 'sheet NOPE' }).kind, 'error');
  assert.equal(command('jev').handler({ rawInput: 'bogus' }).kind, 'error');
});

test('jev_ask：5 采样聚合出裁决并落盘', async () => {
  const samples = Array.from({ length: 5 }, () => ({ kind: 'noul', question: '?', prob: 0.9, evidence: 'x' }));
  const out = await tool('jev_ask').execute({ pointId: 'P1', samples, preset: 'yes' });
  assert.match(out, /AUTO/);
  assert.doesNotMatch(out, /违背直觉/);
  const stats = command('jev').handler({ rawInput: 'stats' });
  assert.match(stats.text, /决策 1 次/);
});

test('jev_ask：直觉相反触发 override 标记', async () => {
  const samples = Array.from({ length: 5 }, () => ({ kind: 'noul', question: '?', prob: 0.9, evidence: 'x' }));
  const out = await tool('jev_ask').execute({ pointId: 'P4', samples, preset: 'no' });
  assert.match(out, /「否」相反/);
});

test('jev_ask：坏采样原样报错不崩', async () => {
  const out = await tool('jev_ask').execute({ pointId: 'P1', samples: [{ kind: 'noul', question: '?', prob: 7, evidence: '' }] });
  assert.match(out, /采样无效/);
  const empty = await tool('jev_ask').execute({ pointId: 'P1', samples: [] });
  assert.match(empty, /为空/);
  const unknown = await tool('jev_ask').execute({ pointId: 'P99', samples: [{ kind: 'noul', question: '?', prob: 0.5, evidence: '' }] });
  assert.match(unknown, /没有这个决策点/);
});
