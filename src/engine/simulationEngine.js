/**
 * src/engine/simulationEngine.js
 * 1ターン進行ロジック（CLAUDE.md 記載の6フェーズ）
 */

import { calculateTax } from './taxCalculator.js';
import { aggregateMacro } from './macroAggregator.js';
import { updateHouseholdAggregates, applyWelfareTakeup } from './agentFactory.js';
import { clamp, gaussianRandom } from '../utils/random.js';

const CURRENT_BASE_YEAR = 2024;

// エージェントマップを生成（O(1) ルックアップ用）
function buildAgentMap(agents) {
  const map = {};
  for (const a of agents) {
    map[a.id] = a;
  }
  return map;
}

// 世帯マップを生成
function buildHouseholdMap(households) {
  const map = {};
  for (const h of households) {
    map[h.id] = h;
  }
  return map;
}

// ─── フェーズ①: 税・社会保険計算 ────────────────────────────

function runTaxPhase(agents, households, taxPolicy) {
  const agentMap = buildAgentMap(agents);
  const householdMap = buildHouseholdMap(households);

  for (const agent of agents) {
    const household = householdMap[agent.householdId];
    if (!household) continue;
    calculateTax(agent, household, taxPolicy, agentMap);
  }

  // 世帯集計値を更新してから捕捉率を再計算
  for (const household of households) {
    const members = household.memberIds.map(id => agentMap[id]).filter(Boolean);
    updateHouseholdAggregates(household, members);
    applyWelfareTakeup(household, taxPolicy);
  }
}

// ─── フェーズ②: エージェント行動 ────────────────────────────

function runAgentBehaviorPhase(agents, households, taxPolicy) {
  const householdMap = buildHouseholdMap(households);

  for (const agent of agents) {
    const household = householdMap[agent.householdId];
    if (!household) continue;

    // 消費・貯蓄の決定
    const disposable = Math.max(0, agent.disposableIncome);
    agent.semiannualConsumption = Math.round(disposable / 2 * agent.baseMPC);
    const saving = disposable / 2 - agent.semiannualConsumption;
    agent.savings = Math.max(0, agent.savings + saving);

    // 健康・幸福・政府信頼の微変動（±小幅）
    agent.health    = clamp(agent.health    + gaussianRandom(0, 0.5), 5, 100);
    agent.happiness = clamp(agent.happiness + gaussianRandom(0, 0.8), 5, 100);
    agent.govTrust  = clamp(agent.govTrust  + gaussianRandom(0, 0.3), 5, 95);

    // 加齢（1ターン=0.5歳）
    // birthYearは不変なのでageは計算時に導出するだけでOK

    agent.turnsInCurrentJob++;
  }
}

// ─── フェーズ⑤マクロ集計のラッパー ─────────────────────────

export function runTurn(agents, households, taxPolicy, prevMacro = null) {
  // ① 税計算
  runTaxPhase(agents, households, taxPolicy);

  // ② エージェント行動
  runAgentBehaviorPhase(agents, households, taxPolicy);

  // ③④ 企業・政府フェーズ（Phase 1 では簡略化）

  // ⑤ マクロ集計
  const macro = aggregateMacro(agents, households, taxPolicy, prevMacro);

  return macro;
}
