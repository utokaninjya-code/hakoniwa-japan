/**
 * src/engine/macroAggregator.js
 * エージェント集計 → マクロ指標
 */

// 1000人エージェントの消費 → 実GDP換算スケールファクター
// 日本のGDP約550兆円 / 人口1.25億人 × 1000人 = 約4.4兆円
const SCALE_FACTOR = 4_400_000_000_000 / 1_000_000_000; // 単位：10億円

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

function calcTaxRevenue(agents) {
  return agents.reduce((s, a) => {
    return s
      + (a.incomeTaxAfterCredit ?? 0)
      + (a.municipalTax ?? 0)
      + (a.healthInsurancePremium ?? 0)
      + (a.pensionPremium ?? 0)
      + (a.employmentInsurancePremium ?? 0)
      + (a.careInsurancePremium ?? 0)
      + (a.consumptionTaxBurdenAnnual ?? 0);
  }, 0);
}

function calcGovSpend(govPolicy, agents) {
  // 生活保護・年金給付の概算
  // 単位：円（エージェント規模）
  const welfareSpend = agents.reduce((s, a) => {
    // 受給世帯の生活保護費は agentFactory の welfareThreshold の半分と仮定
    return s; // 世帯レベルの集計は households で行う
  }, 0);

  // govPolicy がある場合はその値を使う
  const baseGovSpendPerAgent = 1_500_000; // 社会保障費等の政府支出の概算（1人あたり）
  return baseGovSpendPerAgent * agents.length;
}

function calcNonReceiptBreakdown(households) {
  const result = { stigma: 0, kinship_inquiry: 0, info_gap: 0, application_barrier: 0 };
  let total = 0;
  for (const hh of households) {
    if (hh.welfareEligible && !hh.receivingWelfare && hh.welfareNonReceiptReason) {
      result[hh.welfareNonReceiptReason] = (result[hh.welfareNonReceiptReason] ?? 0) + 1;
      total++;
    }
  }
  if (total === 0) return result;
  return Object.fromEntries(Object.entries(result).map(([k, v]) => [k, v / total]));
}

export function aggregateMacro(agents, households, govPolicy, prevMacro) {
  const employed = agents.filter(a => a.employmentStatus === 'employed');
  const unemployed = agents.filter(a => a.employmentStatus === 'unemployed');
  const laborForce = [...employed, ...unemployed];

  // GDP（消費 + 政府支出）
  const totalConsumption = agents.reduce((s, a) => s + (a.semiannualConsumption ?? 0), 0) * 2; // 半期→年次
  const govSpend = calcGovSpend(govPolicy, agents);
  const nominalGDP = (totalConsumption + govSpend) * SCALE_FACTOR;

  // 失業率
  const unemploymentRate = laborForce.length > 0
    ? unemployed.length / laborForce.length
    : 0;

  // ジニ係数（可処分所得）
  const disposableIncomes = agents.map(a => Math.max(0, a.disposableIncome ?? 0));
  const giniCoefficient = calcGini(disposableIncomes);

  // 財政
  const taxRevenue = calcTaxRevenue(agents) * SCALE_FACTOR;
  const fiscalBalance = taxRevenue - govSpend * SCALE_FACTOR;

  // 生活保護捕捉率
  const eligibleHouseholds = households.filter(h => h.welfareEligible);
  const receivingHouseholds = households.filter(h => h.receivingWelfare);
  const welfareCoverageRate = eligibleHouseholds.length > 0
    ? receivingHouseholds.length / eligibleHouseholds.length
    : 0;

  const welfareNonReceiptBreakdown = calcNonReceiptBreakdown(households);

  // 雇用形態別人数
  const regularEmployed = employed.filter(a => a.employmentType === 'regular');
  const nonregularEmployed = employed.filter(a => a.employmentType === 'nonregular');

  return {
    turn: (prevMacro?.turn ?? 0) + 1,
    nominalGDP,
    gdpGrowthRate: prevMacro && prevMacro.nominalGDP > 0
      ? (nominalGDP - prevMacro.nominalGDP) / prevMacro.nominalGDP
      : 0,
    unemploymentRate,
    giniCoefficient,
    taxRevenue,
    govSpend: govSpend * SCALE_FACTOR,
    fiscalBalance,
    welfareCoverageRate,
    welfareNonReceiptBreakdown,
    meanDisposableIncome: mean(disposableIncomes),
    meanHappiness: mean(agents.map(a => a.happiness ?? 0)),
    meanGovTrust: mean(agents.map(a => a.govTrust ?? 0)),
    meanHealth: mean(agents.map(a => a.health ?? 0)),
    totalAgents: agents.length,
    employedCount: employed.length,
    unemployedCount: unemployed.length,
    regularEmployedCount: regularEmployed.length,
    nonregularEmployedCount: nonregularEmployed.length,
    eligibleWelfareHouseholds: eligibleHouseholds.length,
    receivingWelfareHouseholds: receivingHouseholds.length,
  };
}
