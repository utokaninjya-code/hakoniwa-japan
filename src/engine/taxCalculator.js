/**
 * src/engine/taxCalculator.js
 * 税・社会保険・EITC の計算（CLAUDE.md 記載の8ステップ）
 */

import {
  STAT_EMPLOYMENT_INCOME_DEDUCTION_BRACKETS,
  STAT_INCOME_TAX_BRACKETS,
  STAT_PERSONAL_DEDUCTIONS,
  STAT_MUNICIPAL_TAX,
  STAT_HEALTH_INSURANCE_RATE,
  STAT_PENSION_INSURANCE_RATE,
  STAT_EMPLOYMENT_INSURANCE_RATE,
  STAT_CONSUMPTION_TAX,
  EST_EITC_PARAMS,
} from '../data/index.js';

const CURRENT_YEAR = 2024;

// ─── Step 1: 給与所得控除 ────────────────────────────────────

export function calcEmploymentIncomeDeduction(annualIncome, brackets = STAT_EMPLOYMENT_INCOME_DEDUCTION_BRACKETS) {
  for (const b of brackets) {
    if (annualIncome <= b.incomeUpTo) {
      if (b.formula === 'fixed') {
        return b.amount;
      } else {
        // rate方式: income * rate + |offset|
        // offset が負の場合は加算（コメント参照）
        const computed = annualIncome * b.rate + Math.abs(b.offset ?? 0) * Math.sign(-(b.offset ?? 0) || 1);
        if (b.min !== undefined) return Math.max(computed, b.min);
        return computed;
      }
    }
  }
  // 上限ブラケット
  const last = brackets[brackets.length - 1];
  return last.formula === 'fixed' ? last.amount : annualIncome * last.rate;
}

// 給与所得控除の正しい計算（コメント仕様を実装）
function calcEmpDeduction(income) {
  if (income <= 1_625_000) return 550_000;
  if (income <= 1_800_000) return Math.max(income * 0.40 - 100_000, 550_000);
  if (income <= 3_600_000) return income * 0.30 + 80_000;
  if (income <= 6_600_000) return income * 0.20 + 440_000;
  if (income <= 8_500_000) return income * 0.10 + 1_100_000;
  return 1_950_000;
}

// ─── Step 2: 社会保険料 ──────────────────────────────────────

function calcSocialInsurance(agent) {
  const age = CURRENT_YEAR - agent.birthYear;
  const income = agent.annualIncome;
  const monthlyWage = income / 12;

  let healthInsurancePremium = 0;
  let pensionPremium = 0;
  let employmentInsurancePremium = 0;
  let careInsurancePremium = 0;

  if (agent.employmentStatus !== 'employed') {
    // 国民健康保険 + 国民年金（就業者以外・概算）
    if (age < 75) {
      healthInsurancePremium = income * STAT_HEALTH_INSURANCE_RATE.selfEmployedRate
        + STAT_HEALTH_INSURANCE_RATE.selfEmployedFlatFeeAnnual;
    } else {
      // 後期高齢者
      healthInsurancePremium = income * STAT_HEALTH_INSURANCE_RATE.elderlyRate
        + STAT_HEALTH_INSURANCE_RATE.elderlyFlatFeeAnnual;
    }
    if (age >= 20 && age < 60 && income > 0) {
      pensionPremium = STAT_PENSION_INSURANCE_RATE.nationalPensionMonthly * 12;
    }
    return {
      total: Math.round(healthInsurancePremium + pensionPremium),
      breakdown: { healthInsurancePremium, pensionPremium, employmentInsurancePremium, careInsurancePremium },
    };
  }

  // 正規・非正規就業者
  if (agent.employmentType === 'regular') {
    // 協会けんぽ
    if (age < 40) {
      healthInsurancePremium = income * STAT_HEALTH_INSURANCE_RATE.employee;
    } else if (age < 75) {
      healthInsurancePremium = income * STAT_HEALTH_INSURANCE_RATE.employee;
      careInsurancePremium = income * STAT_HEALTH_INSURANCE_RATE.careInsurance;
    }

    // 厚生年金（標準報酬月額の上下限）
    if (age < 70) {
      const stdMonthly = Math.min(
        Math.max(monthlyWage, STAT_PENSION_INSURANCE_RATE.monthlyWageFloor),
        STAT_PENSION_INSURANCE_RATE.monthlyWageCeiling,
      );
      pensionPremium = stdMonthly * 12 * STAT_PENSION_INSURANCE_RATE.employee;
    }

    // 雇用保険
    const insRate = agent.industry === 'construction'
      ? STAT_EMPLOYMENT_INSURANCE_RATE.construction
      : STAT_EMPLOYMENT_INSURANCE_RATE.general;
    employmentInsurancePremium = income * insRate;
  } else {
    // 非正規（国保・国民年金）
    healthInsurancePremium = income * STAT_HEALTH_INSURANCE_RATE.selfEmployedRate
      + STAT_HEALTH_INSURANCE_RATE.selfEmployedFlatFeeAnnual;
    if (age >= 20 && age < 60) {
      pensionPremium = STAT_PENSION_INSURANCE_RATE.nationalPensionMonthly * 12;
    }
    // 週20時間以上なら雇用保険加入（簡略化：全非正規の50%が加入とみなす）
    if (Math.random() < 0.5) {
      employmentInsurancePremium = income * STAT_EMPLOYMENT_INSURANCE_RATE.general;
    }
  }

  const total = Math.round(healthInsurancePremium + pensionPremium + employmentInsurancePremium + careInsurancePremium);
  return {
    total,
    breakdown: {
      healthInsurancePremium: Math.round(healthInsurancePremium),
      pensionPremium: Math.round(pensionPremium),
      employmentInsurancePremium: Math.round(employmentInsurancePremium),
      careInsurancePremium: Math.round(careInsurancePremium),
    },
  };
}

// ─── Step 3: 配偶者控除・扶養控除 ───────────────────────────

function calcSpouseDeduction(spouseIncome, taxPolicy) {
  if (spouseIncome === null) return 0; // 配偶者なし
  if (spouseIncome <= (taxPolicy.spouseIncomeLimit ?? STAT_PERSONAL_DEDUCTIONS.spouseIncomeLimit)) {
    return taxPolicy.spouseDeduction ?? STAT_PERSONAL_DEDUCTIONS.spouseDeduction;
  }
  return 0;
}

function calcDependentDeduction(household, agentMap, taxPolicy) {
  const CURRENT_YEAR = 2024;
  let deduction = 0;
  const memberIds = household.memberIds ?? [];
  const deductionBase = taxPolicy.dependentDeduction ?? STAT_PERSONAL_DEDUCTIONS.dependentDeduction;
  const deductionSpecific = STAT_PERSONAL_DEDUCTIONS.dependentDeductionSpecific;
  const deductionElderly = STAT_PERSONAL_DEDUCTIONS.dependentDeductionElderly;

  for (const memberId of memberIds) {
    const dep = agentMap[memberId];
    if (!dep) continue;
    const age = CURRENT_YEAR - dep.birthYear;
    if (dep.employmentStatus === 'student' || dep.annualIncome < 480_000) {
      if (age >= 16 && age <= 18) deduction += deductionBase;
      else if (age >= 19 && age <= 22) deduction += deductionSpecific;
      else if (age >= 23 && age <= 69) deduction += deductionBase;
      else if (age >= 70) deduction += deductionElderly;
    }
  }
  return deduction;
}

function getSpouseIncome(agent, household, agentMap) {
  const type = household.type;
  if (type !== 'couple' && type !== 'couple_with_child' && type !== 'three_generation') return null;

  // 配偶者 = memberIds のうち自分でない最初の成人
  const CURRENT_YEAR = 2024;
  for (const memberId of household.memberIds) {
    if (memberId === agent.id) continue;
    const other = agentMap[memberId];
    if (!other) continue;
    const age = CURRENT_YEAR - other.birthYear;
    if (age >= 18) return other.annualIncome;
  }
  return null;
}

// ─── Step 4: 所得税（速算表） ────────────────────────────────

export function calcIncomeTaxBracket(taxableIncome, brackets = STAT_INCOME_TAX_BRACKETS) {
  for (const b of brackets) {
    if (taxableIncome <= b.upTo) {
      return Math.max(0, taxableIncome * b.rate - b.deduction);
    }
  }
  const last = brackets[brackets.length - 1];
  return Math.max(0, taxableIncome * last.rate - last.deduction);
}

// ─── Step 5: EITC ────────────────────────────────────────────

export function calcEITC(annualIncome, dependentCount, eitcPolicy = {}) {
  const params = eitcPolicy;
  const childCount = dependentCount;

  const bracket = childCount === 0
    ? (params.noChild ?? EST_EITC_PARAMS.noChild)
    : childCount === 1
    ? (params.oneChild ?? EST_EITC_PARAMS.oneChild)
    : (params.multipleChildren ?? EST_EITC_PARAMS.multipleChildren);

  let credit;
  if (annualIncome <= bracket.plateauIncomeEnd) {
    credit = Math.min(annualIncome * bracket.phaseInRate, bracket.maxCredit);
  } else if (annualIncome <= bracket.phaseOutStart) {
    credit = bracket.maxCredit;
  } else {
    credit = Math.max(0, bracket.maxCredit - (annualIncome - bracket.phaseOutStart) * bracket.phaseOutRate);
  }

  return { taxCredit: Math.round(credit), cashBenefit: 0 }; // cashBenefit は calculateTax で確定
}

// ─── メイン計算関数 ──────────────────────────────────────────

export function calculateTax(agent, household, taxPolicy, agentMap) {
  const income = agent.annualIncome;

  // Step 1: 給与所得控除
  const empDeduction = income > 0 ? calcEmpDeduction(income) : 0;

  // Step 2: 社会保険料
  const socialInsurance = calcSocialInsurance(agent);

  // Step 3: 課税所得
  const spouseIncome = getSpouseIncome(agent, household, agentMap);
  const spouseDeduction = calcSpouseDeduction(spouseIncome, taxPolicy);
  const dependentDeduction = calcDependentDeduction(household, agentMap, taxPolicy);
  const basicDeduction = taxPolicy.basicDeduction ?? STAT_PERSONAL_DEDUCTIONS.basicDeduction;

  const taxableIncome = Math.max(0,
    income
    - empDeduction
    - basicDeduction
    - spouseDeduction
    - dependentDeduction
    - socialInsurance.total,
  );

  // Step 4: 所得税
  const brackets = taxPolicy.incomeTaxBrackets ?? STAT_INCOME_TAX_BRACKETS;
  const incomeTax = calcIncomeTaxBracket(taxableIncome, brackets);

  // Step 5: EITC
  let eitcCredit = 0;
  let eitcCash = 0;
  if (taxPolicy.eitc?.enabled) {
    const eitc = calcEITC(income, household.dependentCount, taxPolicy.eitc);
    if (incomeTax >= eitc.taxCredit) {
      eitcCredit = eitc.taxCredit;
      eitcCash = 0;
    } else {
      eitcCredit = incomeTax;
      eitcCash = eitc.taxCredit - incomeTax;
    }
  }

  // Step 6: 住民税
  const municipalTax = taxableIncome >= STAT_MUNICIPAL_TAX.nonTaxableIncomeThreshold
    ? Math.max(0, taxableIncome * STAT_MUNICIPAL_TAX.incomeRate + STAT_MUNICIPAL_TAX.flatFee)
    : 0;

  // Step 7: 可処分所得
  const incomeTaxAfterCredit = Math.max(0, incomeTax - eitcCredit);
  const disposableIncome = income
    - incomeTaxAfterCredit
    - municipalTax
    - socialInsurance.total
    + eitcCash;

  // Step 8: 消費税実効税率
  const effectiveConsumptionTaxRate =
    agent.consumptionBasketFoodRatio * (taxPolicy.consumptionTaxReducedRate ?? STAT_CONSUMPTION_TAX.reducedRate)
    + (1 - agent.consumptionBasketFoodRatio) * (taxPolicy.consumptionTaxStandardRate ?? STAT_CONSUMPTION_TAX.standardRate);

  const totalTaxBurden = incomeTaxAfterCredit + municipalTax + socialInsurance.total;
  const effectiveTotalBurdenRate = income > 0 ? totalTaxBurden / income : 0;

  // 消費税負担（可処分所得を消費に使うと仮定）
  const estimatedConsumption = Math.max(0, disposableIncome) * agent.baseMPC;
  const consumptionTaxBurdenAnnual = estimatedConsumption * effectiveConsumptionTaxRate;

  const totalDeductions = empDeduction + basicDeduction + spouseDeduction + dependentDeduction + socialInsurance.total;

  Object.assign(agent, {
    employmentIncomeDeduction: Math.round(empDeduction),
    totalDeductions: Math.round(totalDeductions),
    taxableIncome: Math.round(taxableIncome),
    incomeTaxAnnual: Math.round(incomeTax),
    incomeTaxAfterCredit: Math.round(incomeTaxAfterCredit),
    municipalTax: Math.round(municipalTax),
    ...socialInsurance.breakdown,
    eitcTaxCreditAmount: Math.round(eitcCredit),
    eitcCashBenefitAmount: Math.round(eitcCash),
    effectiveConsumptionTaxRate,
    consumptionTaxBurdenAnnual: Math.round(consumptionTaxBurdenAnnual),
    disposableIncome: Math.round(disposableIncome),
    totalTaxBurden: Math.round(totalTaxBurden),
    effectiveTotalBurdenRate,
    netBenefitFromGov: Math.round(eitcCash),
  });
}
