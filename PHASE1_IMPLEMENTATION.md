# Phase 1 実装指示書 — エンジンコア

`CLAUDE.md` を読んだうえでこのファイルを参照すること。

---

## このフェーズのゴール

ブラウザのコンソールで以下が動作する状態にする：

```javascript
import { generateSimulation } from './engine/agentFactory';
import { runTurn } from './engine/simulationEngine';

const { agents, households } = generateSimulation(1000);
const macro = runTurn(agents, households, initialTaxPolicy);

console.log(macro.gdpGrowthRate);      // 例: 0.012
console.log(macro.unemploymentRate);   // 例: 0.026
console.log(macro.giniCoefficient);    // 例: 0.37
console.log(macro.welfareCoverageRate); // 例: 0.25（捕捉率）
```

UI はまだ不要。ロジックの正確さを優先する。

---

## Task 1: `src/utils/random.js`

最初に作る。全エンジンが依存するユーティリティ。

```javascript
// 実装すべき関数

// 正規分布サンプリング（Box-Muller法）
export function gaussianRandom(mean = 0, stdDev = 1)

// 配列から重み付きサンプリング
// dist: [{ value, weight }, ...]
export function weightedSample(dist)

// 分布配列から値をサンプリング
// dist: [{ ratio, ...その他 }, ...]  ratio の合計が 1.0
export function sampleFromDistribution(dist)

// 範囲クランプ
export function clamp(value, min, max)

// min〜maxの整数ランダム（両端含む）
export function randomInt(min, max)

// ログ正規サンプリング（median × exp(gauss(0, sigma))）
export function lognormalSample(median, sigma)
```

---

## Task 2: `src/engine/agentFactory.js`

### 2-1. 世帯生成

```javascript
export function generateHouseholds(targetAgentCount = 1000, rng = Math.random) {
  // STAT_HOUSEHOLD_TYPE_DIST から世帯タイプをサンプリング
  // STAT_HOUSEHOLD_MEAN_SIZE でメンバー数を決定
  // 合計メンバー数が targetAgentCount に達したら打ち切る
  // 各世帯に region を割り当て（STAT_REGION_DISTRIBUTION）
  // 住居タイプを割り当て（STAT_HOME_OWNERSHIP_RATE_BY_REGION）
  // 住居コストを設定
}
```

### 2-2. 個人エージェント生成

```javascript
export function generateAgents(households) {
  // 世帯ごとに EST_HOUSEHOLD_AGE_PARAMS で年齢・性別を決定
  // 以下を順番に決定：
  //   education（STAT_UNIVERSITY_ENROLLMENT_RATE_BY_BIRTH_DECADE で世代補正）
  //   employmentStatus（STAT_LABOR_FORCE_RATE・STAT_UNEMPLOYMENT_RATE）
  //   employmentType（STAT_REGULAR_EMPLOYMENT_RATE）
  //   industry（STAT_INDUSTRY_DISTRIBUTION + EST 補正）
  //   annualIncome（EST_BASE_ANNUAL_INCOME × 各補正係数 × lognormalSample）
  //   savings（STAT_SAVINGS_BALANCE_BY_AGE × lognormalSample）
  //   baseMPC（EST_MPC_PARAMS）
  //   consumptionBasketFoodRatio（EST_ENGEL_COEFFICIENT_PARAMS）
  //   health / happiness / govTrust（EST_HEALTH_PARAMS / EST_HAPPINESS_PARAMS 等）
}
```

### 2-3. 捕捉率ロジック

```javascript
export function applyWelfareTakeup(household, agents, policy) {
  // Step1: 収入テスト → welfareEligible
  const welfareThreshold = calcWelfareThreshold(household.region, household.dependentCount);
  household.welfareEligible = household.combinedIncome < welfareThreshold;

  // Step2: 捕捉率適用 → receivingWelfare + nonReceiptReason
  if (!household.welfareEligible) {
    household.receivingWelfare = false;
    household.welfareNonReceiptReason = null;
    return;
  }

  // policy.welfareBarrierReduction で各理由の重みを減衰させる
  const adjustedReasons = STAT_WELFARE_TAKEUP_RATE.nonReceiptReasons.map(r => ({
    ...r,
    ratio: r.ratio * (1 - (policy.welfareBarrierReduction[r.reason] ?? 0)),
  }));
  const totalBarrier = adjustedReasons.reduce((s, r) => s + r.ratio, 0);
  const effectiveTakeupRate = 1 - totalBarrier * (1 - STAT_WELFARE_TAKEUP_RATE.overall);

  if (Math.random() < effectiveTakeupRate) {
    household.receivingWelfare = true;
    household.welfareNonReceiptReason = null;
  } else {
    household.receivingWelfare = false;
    household.welfareNonReceiptReason = weightedSample(adjustedReasons.map(r =>
      ({ value: r.reason, weight: r.ratio })
    ));
  }
}
```

---

## Task 3: `src/engine/taxCalculator.js`

8ステップの計算を忠実に実装する。

```javascript
export function calculateTax(agent, household, taxPolicy) {
  // Step 1: 給与所得控除
  const empDeduction = calcEmploymentIncomeDeduction(
    agent.annualIncome,
    STAT_EMPLOYMENT_INCOME_DEDUCTION_BRACKETS
  );

  // Step 2: 社会保険料（先に計算して Step2 の控除に使う）
  const socialInsurance = calcSocialInsurance(agent, taxPolicy);

  // Step 3: 課税所得
  const spouseIncome = getSpouseIncome(agent, household, agents); // 配偶者収入を取得
  const spouseDeduction = calcSpouseDeduction(spouseIncome, taxPolicy);
  const dependentDeduction = calcDependentDeduction(household, agents, taxPolicy);
  const taxableIncome = Math.max(0,
    agent.annualIncome
    - empDeduction
    - taxPolicy.basicDeduction
    - spouseDeduction
    - dependentDeduction
    - socialInsurance.total
  );

  // Step 4: 所得税（速算表）
  const incomeTax = calcIncomeTaxBracket(taxableIncome, taxPolicy.incomeTaxBrackets);

  // Step 5: EITC
  const eitc = taxPolicy.eitc.enabled
    ? calcEITC(agent.annualIncome, household.dependentCount, taxPolicy.eitc)
    : { taxCredit: 0, cashBenefit: 0 };

  // Step 6: 住民税
  const municipalTax = Math.max(0,
    taxableIncome * STAT_MUNICIPAL_TAX.incomeRate + STAT_MUNICIPAL_TAX.flatFee
  );

  // Step 7: 可処分所得
  const disposableIncome = agent.annualIncome
    - Math.max(0, incomeTax - eitc.taxCredit)
    - municipalTax
    - socialInsurance.total
    + eitc.cashBenefit;

  // Step 8: 消費税負担（消費後に計算するが、foodRatioから実効税率を先算出）
  const effectiveTaxRate =
    agent.consumptionBasketFoodRatio * taxPolicy.consumptionTaxReducedRate
    + (1 - agent.consumptionBasketFoodRatio) * taxPolicy.consumptionTaxStandardRate;

  // エージェントに結果を書き戻す
  Object.assign(agent, {
    employmentIncomeDeduction: empDeduction,
    taxableIncome,
    incomeTaxAnnual: incomeTax,
    incomeTaxAfterCredit: Math.max(0, incomeTax - eitc.taxCredit),
    municipalTax,
    ...socialInsurance.breakdown,
    eitcTaxCreditAmount: eitc.taxCredit,
    eitcCashBenefitAmount: eitc.cashBenefit,
    effectiveConsumptionTaxRate: effectiveTaxRate,
    disposableIncome,
    totalTaxBurden: (incomeTax - eitc.taxCredit) + municipalTax + socialInsurance.total,
    effectiveTotalBurdenRate: agent.annualIncome > 0
      ? ((incomeTax - eitc.taxCredit) + municipalTax + socialInsurance.total) / agent.annualIncome
      : 0,
  });
}
```

---

## Task 4: `src/engine/macroAggregator.js`

```javascript
export function aggregateMacro(agents, households, govPolicy, prevMacro) {
  const employed = agents.filter(a => a.employmentStatus === 'employed');
  const laborForce = agents.filter(a =>
    a.employmentStatus === 'employed' || a.employmentStatus === 'unemployed'
  );

  // GDP（消費 + 政府支出、投資は簡略化）
  const totalConsumption = agents.reduce((s, a) => s + a.semiannualConsumption, 0);
  const govSpend = calcGovSpend(govPolicy, agents);
  const nominalGDP = (totalConsumption + govSpend) * SCALE_FACTOR;

  // 失業率
  const unemploymentRate = laborForce.length > 0
    ? agents.filter(a => a.employmentStatus === 'unemployed').length / laborForce.length
    : 0;

  // ジニ係数（可処分所得）
  const giniCoefficient = calcGini(agents.map(a => a.disposableIncome));

  // 財政収支
  const taxRevenue = calcTaxRevenue(agents);
  const fiscalBalance = taxRevenue - govSpend * SCALE_FACTOR;

  // 生活保護捕捉率
  const eligibleHouseholds = households.filter(h => h.welfareEligible);
  const receivingHouseholds = households.filter(h => h.receivingWelfare);
  const welfareCoverageRate = eligibleHouseholds.length > 0
    ? receivingHouseholds.length / eligibleHouseholds.length
    : 0;

  // 非受給理由の内訳（UI可視化用）
  const welfareNonReceiptBreakdown = calcNonReceiptBreakdown(households);

  return {
    turn: (prevMacro?.turn ?? 0) + 1,
    nominalGDP,
    gdpGrowthRate: prevMacro ? (nominalGDP - prevMacro.nominalGDP) / prevMacro.nominalGDP : 0,
    unemploymentRate,
    giniCoefficient,
    taxRevenue,
    govSpend: govSpend * SCALE_FACTOR,
    fiscalBalance,
    welfareCoverageRate,
    welfareNonReceiptBreakdown,
    // 集計値（UI表示用）
    meanDisposableIncome: mean(agents.map(a => a.disposableIncome)),
    meanHappiness: mean(agents.map(a => a.happiness)),
    meanGovTrust: mean(agents.map(a => a.govTrust)),
  };
}

// ジニ係数の計算（標準的なアルゴリズム）
function calcGini(incomes) {
  const sorted = [...incomes].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((s, v) => s + v, 0);
  if (sum === 0) return 0;
  const weightedSum = sorted.reduce((s, v, i) => s + v * (i + 1), 0);
  return (2 * weightedSum) / (n * sum) - (n + 1) / n;
}
```

---

## Task 5: `src/store/simulationStore.js`

```javascript
import { create } from 'zustand';
import { STAT_INCOME_TAX_BRACKETS, STAT_PERSONAL_DEDUCTIONS,
         STAT_CONSUMPTION_TAX, EST_EITC_PARAMS } from '../data';

export const useSimulationStore = create((set, get) => ({
  // シミュレーション状態
  agents: [],
  households: [],
  macroHistory: [],   // 過去ターンのマクロ指標（最大40ターン = 20年分）

  // 政策レバー（初期値は法令値）
  taxPolicy: {
    incomeTaxBrackets:          [...STAT_INCOME_TAX_BRACKETS],
    basicDeduction:             STAT_PERSONAL_DEDUCTIONS.basicDeduction,
    spouseIncomeLimit:          STAT_PERSONAL_DEDUCTIONS.spouseIncomeLimit,
    consumptionTaxStandardRate: STAT_CONSUMPTION_TAX.standardRate,
    consumptionTaxReducedRate:  STAT_CONSUMPTION_TAX.reducedRate,
    welfareBarrierReduction: {
      kinship_inquiry: 0, info_gap: 0, application_barrier: 0, stigma: 0,
    },
    eitc: { enabled: false, ...EST_EITC_PARAMS },
  },

  // アクション
  initSimulation:  (count = 1000) => { ... },
  advanceTurn:     () => { ... },
  updateTaxPolicy: (patch) => set(s => ({ taxPolicy: { ...s.taxPolicy, ...patch } })),
}));
```

---

## Task 6: `src/engine/calibration.js`

```javascript
import {
  STAT_EMPLOYMENT_TYPE_RATIO,
  STAT_INCOME_BY_EMPLOYMENT_TYPE,
  STAT_UNEMPLOYMENT_RATE,
  STAT_AGE_GROUP_DISTRIBUTION,
  STAT_GINI_COEFFICIENT,
  STAT_WELFARE_TAKEUP_RATE,
} from '../data';

export function validateAgents(agents, households) {
  const checks = [
    {
      metric: '非正規雇用率',
      simulate: () => {
        const emp = agents.filter(a => a.employmentStatus === 'employed');
        return emp.filter(a => a.employmentType === 'nonregular').length / emp.length;
      },
      target: STAT_EMPLOYMENT_TYPE_RATIO.nonregular,
      tolerance: 0.03,
    },
    {
      metric: '正規平均年収',
      simulate: () => mean(
        agents.filter(a => a.employmentType === 'regular').map(a => a.annualIncome)
      ),
      target: STAT_INCOME_BY_EMPLOYMENT_TYPE.regular,
      tolerance: 0.05,
    },
    {
      metric: '失業率',
      simulate: () => {
        const lf = agents.filter(a =>
          a.employmentStatus === 'employed' || a.employmentStatus === 'unemployed'
        );
        return agents.filter(a => a.employmentStatus === 'unemployed').length / lf.length;
      },
      target: STAT_UNEMPLOYMENT_RATE.overall,
      tolerance: 0.01,
    },
    {
      metric: '高齢者率（65歳以上）',
      simulate: () => agents.filter(a => (2024 - a.birthYear) >= 65).length / agents.length,
      target: STAT_AGE_GROUP_DISTRIBUTION.find(g => g.group === 'elderly').ratio,
      tolerance: 0.02,
    },
    {
      metric: '生活保護捕捉率',
      simulate: () => {
        const eligible = households.filter(h => h.welfareEligible);
        const receiving = households.filter(h => h.receivingWelfare);
        return eligible.length > 0 ? receiving.length / eligible.length : 0;
      },
      target: STAT_WELFARE_TAKEUP_RATE.overall,
      tolerance: 0.05,
    },
  ];

  let allPassed = true;
  checks.forEach(({ metric, simulate, target, tolerance }) => {
    const value = simulate();
    const deviation = Math.abs(value - target) / target;
    const passed = deviation <= tolerance;
    if (!passed) allPassed = false;
    console[passed ? 'log' : 'warn'](
      `[Calibration] ${passed ? '✅' : '⚠️'} ${metric}: `
      + `実測=${value.toFixed(4)}, 目標=${target}, 乖離=${(deviation * 100).toFixed(1)}%`
    );
  });
  return allPassed;
}
```

---

## 実装の進め方

```
1. random.js から始める（他の全ファイルが依存する）
2. agentFactory.js で generateSimulation(1000) が動くようにする
3. calibration.js で統計との整合を確認する（⚠️が出たらパラメータを調整）
4. taxCalculator.js を実装して disposableIncome が計算できるようにする
5. macroAggregator.js でマクロ指標を集計できるようにする
6. simulationStore.js に組み込んで initSimulation / advanceTurn を動かす
```

キャリブレーションで⚠️が出た場合は、`src/data/estimated/` の
`EST_*` パラメータを調整する（`STAT_*` は変えない）。
