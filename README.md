# dsh-plugin-jev-gamedev

> **dsh 插件家族**：22 个插件同一目录 **[dsh-plugin-family](https://github.com/121212165/dsh-plugin-family)** · 决策门控的人话文档见 Obsidian《Jev 怎么用：三种提问原语与分层阈值》。

**EN** — Jev-style atomic decision gates ported from a fiction-pipeline Python judge to game development in TypeScript: 5 independent samples per decision point, mean × dispersion penalty, risk-tier verdicts (≥0.85 auto-execute / ≥0.60 execute+review / else human), divergent & intuition-override flags. `jev_ask` / `jev_sheet` tools + `/jev list|gate|sheet|stats`.

**中文** —— 把 novel-ai-writing-system 的 **Jev 方法论**移植成 TS，用于游戏开发决策：立项核概念（P1）、玩法手感（P2/P4）、难度曲线（P3）、成本可控（P5/P6）、demo 验收（P7）、继续做的理由（P8）。每次决策收集 **5 次独立采样**，聚合口径与 Obsidian 版完全一致：

- 均值 × **离散惩罚**（k = 1 − range/2）
- 分歧就是信息：range > 0.5 或 Choice 多数派并列/占比不足 → `divergent` **降一档**
- 与直觉预设冲突 → `override` 标记（决策层是否有用，靠这个数说话）
- 门控：≥0.85 自动执行 / ≥0.60 执行+复核 / <0.60 转人工或回滚

## 用法

- **`/jev list`** —— 8 个决策点清单（`/jev sheet P2` 预览答题表）。
- **`/jev gate P2 [直觉:是|否]`** —— 发起一次决策：模型按答题表独立回答 5 轮，回复 `jev_ask` 聚合即出裁决并存档。
- **`/jev stats`** —— 决策总数、分歧率、违背直觉率、分布。
- **`jev_sheet` 工具** —— Agent 自主取题；**`jev_ask` 工具** —— Agent 有了采样后自主聚合。
- 答题纪律（注入 systemPrompt）：一题一原子判断、按情形不按档位编号、Choice 附概率分布、5 轮独立取证。

## 配置

| 字段 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | |
| `dataDir` | `~/.dsh/jev-gamedev` | 决策存档 `decisions-YYYY-MM.jsonl` |
| `samples` | `5` | 每点建议采样份数 |
| `autoGate` / `reviewGate` | `0.85` / `0.60` | 风险分层阈值 |
| `divergentRange` | `0.5` | 跨度超过即 divergent 降档 |
| `order` | `740` | prompt section 顺序（工具段 ≥1000） |

数据与阈值思想来自 Obsidian 插件 jev-decision-log 与 jev-judge/primitives.py；本插件只是把同一套打法装进dsh。
