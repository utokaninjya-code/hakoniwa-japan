/**
 * src/engine/calibration.js
 * 生成後の統計との整合性検証
 */

import {
  STAT_EMPLOYMENT_TYPE_RATIO,
  STAT_INCOME_BY_EMPLOYMENT_TYPE,
  STAT_UNEMPLOYMENT_RATE,
  STAT_AGE_GROUP_DISTRIBUTION,
  STAT_GINI_COEFFICIENT,
  STAT_WELFARE_TAKEUP_RATE,
} from '../data/index.js';

function mean(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function calcGini(incomes) {
  const sorted = [...incomes].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((s, v) => s + v, 0);
  if (sum === 0 || n === 0) return 0;
  const weightedSum = sorted.reduce((s, v, i) => s + v * (i + 1), 0);
  return (2 * weightedSum) / (n * sum) - (n + 1) / n;
}

const CURRENT_YEAR = 2024;

export function validateAgents(agents, households) {
  const employed = agents.filter(a => a.employmentStatus === 'employed');
  const laborForce = agents.filter(a =>
    a.employmentStatus === 'employed' || a.employmentStatus === 'unemployed'
  );
  const eligibleHouseholds = households.filter(h => h.welfareEligible);
  const receivingHouseholds = households.filter(h => h.receivingWelfare);
  const elderlyTarget = STAT_AGE_GROUP_DISTRIBUTION.find(g => g.group === 'elderly');

  const checks = [
    {
      metric: '非正規雇用率',
      simulate: () => employed.length > 0
        ? employed.filter(a => a.employmentType === 'nonregular').length / employed.length
        : 0,
      target: STAT_EMPLOYMENT_TYPE_RATIO.nonregular,
      tolerance: 0.03,
    },
    {
      metric: '正規平均年収',
      simulate: () => {
        const regularIncomes = agents
          .filter(a => a.employmentType === 'regular')
          .map(a => a.annualIncome);
        return mean(regularIncomes);
      },
      target: STAT_INCOME_BY_EMPLOYMENT_TYPE.regular,
      tolerance: 0.10, // 金額は大きいので10%許容
    },
    {
      metric: '失業率',
      simulate: () => laborForce.length > 0
        ? agents.filter(a => a.employmentStatus === 'unemployed').length / laborForce.length
        : 0,
      target: STAT_UNEMPLOYMENT_RATE.overall,
      tolerance: 0.01,
    },
    {
      metric: '高齢者率（65歳以上）',
      simulate: () => agents.filter(a => (CURRENT_YEAR - a.birthYear) >= 65).length / agents.length,
      target: elderlyTarget?.ratio ?? 0.291,
      tolerance: 0.02,
    },
    {
      metric: '生活保護捕捉率',
      simulate: () => eligibleHouseholds.length > 0
        ? receivingHouseholds.length / eligibleHouseholds.length
        : 0,
      target: STAT_WELFARE_TAKEUP_RATE.overall,
      tolerance: 0.05,
    },
    {
      metric: 'ジニ係数（可処分所得）',
      simulate: () => calcGini(agents.map(a => Math.max(0, a.disposableIncome ?? 0))),
      target: STAT_GINI_COEFFICIENT.after_redistribution,
      tolerance: 0.05,
    },
  ];

  let allPassed = true;
  const results = [];

  for (const { metric, simulate, target, tolerance } of checks) {
    const value = simulate();
    const deviation = target !== 0 ? Math.abs(value - target) / target : Math.abs(value - target);
    const passed = deviation <= tolerance;
    if (!passed) allPassed = false;

    const result = {
      metric,
      value,
      target,
      deviation,
      passed,
      message: `${passed ? '✅' : '⚠️'} ${metric}: 実測=${value.toFixed(4)}, 目標=${target}, 乖離=${(deviation * 100).toFixed(1)}%`,
    };
    results.push(result);
    console[passed ? 'log' : 'warn'](`[Calibration] ${result.message}`);
  }

  return { allPassed, results };
}
