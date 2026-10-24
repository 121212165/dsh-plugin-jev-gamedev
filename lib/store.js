/**
 * verdict 落盘：~\.dsh\jev-gamedev\decisions-YYYY-MM.jsonl（追加只读统计）。
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
export class JevStore {
    dataDir;
    constructor(dataDir) {
        this.dataDir = dataDir?.startsWith('~') ? join(homedir(), dataDir.slice(1))
            : dataDir ?? join(homedir(), '.dsh', 'jev-gamedev');
    }
    fileFor(at) {
        return join(this.dataDir, `decisions-${at.slice(0, 7)}.jsonl`);
    }
    append(record) {
        mkdirSync(this.dataDir, { recursive: true });
        appendFileSync(this.fileFor(record.at), `${JSON.stringify(record)}\n`, 'utf8');
    }
    readAll() {
        const records = [];
        let skipped = 0;
        if (!existsSync(this.dataDir))
            return { records, skipped };
        for (const name of readdirSync(this.dataDir).filter((name) => /^decisions-\d{4}-\d{2}\.jsonl$/.test(name)).sort()) {
            for (const line of readFileSync(join(this.dataDir, name), 'utf8').split(/\r?\n/)) {
                if (!line.trim())
                    continue;
                try {
                    records.push(JSON.parse(line));
                }
                catch {
                    skipped++;
                }
            }
        }
        return { records, skipped };
    }
}
export function summarize(records) {
    const byPoint = new Map();
    const byVerdict = new Map();
    for (const record of records) {
        byPoint.set(record.pointId, (byPoint.get(record.pointId) ?? 0) + 1);
        byVerdict.set(record.verdict, (byVerdict.get(record.verdict) ?? 0) + 1);
    }
    return {
        count: records.length,
        divergent: records.filter((record) => record.divergent).length,
        override: records.filter((record) => record.override).length,
        byPoint,
        byVerdict,
    };
}
export function renderStats(stats) {
    if (!stats.count)
        return '还没有 Jev 决策记录。/jev gate <P1..P8> 走第一个决策点。';
    const byPoint = [...stats.byPoint.entries()].map(([id, count]) => `${id}×${count}`).join(' ');
    const byVerdict = [...stats.byVerdict.entries()].map(([verdict, count]) => `${verdict}×${count}`).join(' ');
    return [
        `决策 ${stats.count} 次 · 分歧 ${stats.divergent} 次 (${pct(stats.divergent, stats.count)}) · 违背直觉 ${stats.override} 次 (${pct(stats.override, stats.count)})`,
        `按决策点：${byPoint}`,
        `按结论：${byVerdict}`,
    ].join('\n');
}
function pct(part, total) {
    return total ? `${Math.round((part / total) * 100)}%` : '0%';
}
//# sourceMappingURL=store.js.map