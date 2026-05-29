/**
 * src/engine/agentFactory.js
 * 世帯・エージェントの生成
 */

import {
  STAT_HOUSEHOLD_TYPE_DIST,
  STAT_HOUSEHOLD_MEAN_SIZE,
  STAT_REGION_DISTRIBUTION,
  STAT_HOME_OWNERSHIP_RATE_BY_REGION,
  STAT_MONTHLY_RENT_BY_REGION,
  STAT_MORTGAGE_BALANCE_MEDIAN,
  STAT_MORTGAGE_HOLDER_RATIO,
  STAT_CHILDREN_PER_FAMILY,
  STAT_SINGLE_PARENT_MOTHER_RATIO,
  STAT_AGE_5YEAR_DISTRIBUTION,
  STAT_SEX_RATIO,
  STAT_LIFE_EXPECTANCY,
  STAT_LABOR_FORCE_RATE,
  STAT_UNEMPLOYMENT_RATE,
  STAT_REGULAR_EMPLOYMENT_RATE,
  STAT_INDUSTRY_DISTRIBUTION,
  STAT_EDUCATION_DISTRIBUTION_ADULT,
  STAT_UNIVERSITY_ENROLLMENT_RATE_BY_BIRTH_DECADE,
  STAT_INCOME_BY_EMPLOYMENT_TYPE,
  STAT_GENDER_WAGE_RATIO,
  STAT_SAVINGS_BALANCE_BY_AGE,
  STAT_WELFARE_TAKEUP_RATE,
  EST_HOUSEHOLD_AGE_PARAMS,
  EST_AGE_INCOME_INDEX,
  EST_EDUCATION_INCOME_FACTOR,
  EST_INDUSTRY_INCOME_FACTOR,
  EST_NONREGULAR_INCOME_FACTOR,
  EST_BASE_ANNUAL_INCOME,
  EST_INCOME_LOGNORMAL_SIGMA,
  EST_SAVINGS_LOGNORMAL_SIGMA,
  EST_MPC_PARAMS,
  EST_ENGEL_COEFFICIENT_PARAMS,
  EST_RISK_TOLERANCE_DIST,
  EST_PUBLIC_SERVICE_RELIANCE_PARAMS,
  EST_HAPPINESS_PARAMS,
  EST_GOV_TRUST_PARAMS,
  EST_HEALTH_PARAMS,
} from '../data/index.js';

import {
  gaussianRandom,
  weightedSample,
  sampleFromDistribution,
  clamp,
  randomInt,
  lognormalSample,
} from '../utils/random.js';

// ─── ヘルパー ───────────────────────────────────────────────

function nextId(prefix, counter) {
  return `${prefix}-${String(counter).padStart(4, '0')}`;
}

// 年齢5歳刻みテーブルから最も近いキーを返す
function floorKey(table, age) {
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  let result = keys[0];
  for (const k of keys) {
    if (k <= age) result = k;
    else break;
  }
  return result;
}

// 5歳刻みテーブルから補間値を取得
function lookupByAge(table, age) {
  return table[floorKey(table, age)];
}

// 年齢区分から労働力率を取得（性別別）
function getLaborForceRate(gender, age) {
  const table = STAT_LABOR_FORCE_RATE[gender === 'M' ? 'male' : 'female'];
  return lookupByAge(table, age) ?? 0;
}

// 年齢区分から正規雇用率を取得
function getRegularRate(gender, age) {
  const table = STAT_REGULAR_EMPLOYMENT_RATE[gender === 'M' ? 'male' : 'female'];
  return lookupByAge(table, age) ?? 0.5;
}

// 年齢区分から失業率を取得
function getUnemploymentRate(age) {
  return lookupByAge(STAT_UNEMPLOYMENT_RATE.by_age, age) ?? STAT_UNEMPLOYMENT_RATE.overall;
}

// 出生年から大学進学率コーホートを取得
function getUniversityRateByCohort(birthYear) {
  const decade = Math.floor(birthYear / 10) * 10;
  const keys = Object.keys(STAT_UNIVERSITY_ENROLLMENT_RATE_BY_BIRTH_DECADE).map(Number).sort((a, b) => a - b);
  const clampedDecade = clamp(decade, keys[0], keys[keys.length - 1]);
  return STAT_UNIVERSITY_ENROLLMENT_RATE_BY_BIRTH_DECADE[clampedDecade] ?? 0.537;
}

// 単独世帯の世帯主年齢をサンプリング（三峰性）
function sampleSingleAge(region) {
  const params = EST_HOUSEHOLD_AGE_PARAMS.headAgeDistribution.single;
  // 都市部は若年ピーク大きめ、農村は高齢ピーク大きめ
  const weights = region === 'urban'
    ? [0.40, 0.30, 0.30]
    : region === 'suburban'
    ? [0.30, 0.35, 0.35]
    : [0.20, 0.30, 0.50];

  const peak = weightedSample([
    { value: 'young',   weight: weights[0] },
    { value: 'middle',  weight: weights[1] },
    { value: 'elderly', weight: weights[2] },
  ]);
  const p = params[`${peak}Peak`];
  return clamp(Math.round(gaussianRandom(p.mean, p.stdDev)), p.ageMin, p.ageMax);
}

// ─── 世帯生成 ────────────────────────────────────────────────

export function generateHouseholds(targetAgentCount = 1000) {
  const households = [];
  let totalMembers = 0;
  let hhCounter = 1;

  while (totalMembers < targetAgentCount) {
    const hhType = sampleFromDistribution(STAT_HOUSEHOLD_TYPE_DIST).type;
    const region = sampleFromDistribution(STAT_REGION_DISTRIBUTION).region;

    // 世帯人数を決定
    const meanSize = STAT_HOUSEHOLD_MEAN_SIZE[hhType];
    let memberCount;
    if (hhType === 'single') {
      memberCount = 1;
    } else if (hhType === 'couple') {
      memberCount = 2;
    } else if (hhType === 'couple_with_child') {
      const childDist = STAT_CHILDREN_PER_FAMILY.dist;
      const childCount = sampleFromDistribution(childDist).count;
      memberCount = 2 + childCount;
    } else if (hhType === 'single_parent') {
      const childCount = Math.max(1, Math.round(gaussianRandom(meanSize - 1, 0.5)));
      memberCount = 1 + clamp(childCount, 1, 4);
    } else if (hhType === 'three_generation') {
      memberCount = Math.max(3, Math.round(gaussianRandom(meanSize, 0.8)));
    } else {
      memberCount = Math.max(2, Math.round(gaussianRandom(meanSize, 0.7)));
    }

    // 目標人数を超えないよう打ち切り
    if (totalMembers + memberCount > targetAgentCount) {
      memberCount = targetAgentCount - totalMembers;
      if (memberCount <= 0) break;
    }

    // 住居タイプ
    const ownershipRate = STAT_HOME_OWNERSHIP_RATE_BY_REGION[region];
    const isOwner = Math.random() < ownershipRate;
    let housingType, housingCostMonthly, mortgageRemaining;

    if (isOwner) {
      housingType = 'own';
      housingCostMonthly = 0; // ローン返済は別途
      const hasMortgage = Math.random() < STAT_MORTGAGE_HOLDER_RATIO;
      mortgageRemaining = hasMortgage
        ? lognormalSample(STAT_MORTGAGE_BALANCE_MEDIAN, 0.4)
        : 0;
    } else {
      const r = Math.random();
      if (r < 0.040 / (1 - ownershipRate)) {
        housingType = 'public';
        housingCostMonthly = STAT_MONTHLY_RENT_BY_REGION[region] * 0.45;
      } else if (r < (0.040 + 0.086) / (1 - ownershipRate)) {
        housingType = 'family';
        housingCostMonthly = STAT_MONTHLY_RENT_BY_REGION[region] * 0.30;
      } else {
        housingType = 'rent';
        housingCostMonthly = lognormalSample(STAT_MONTHLY_RENT_BY_REGION[region], 0.25);
      }
      mortgageRemaining = 0;
    }

    const id = nextId('hh', hhCounter++);
    households.push({
      id,
      type: hhType,
      memberIds: [],           // agentFactory で埋める
      region,
      housingType,
      housingCostMonthly,
      mortgageRemaining,
      combinedIncome: 0,
      combinedSavings: 0,
      dependentCount: 0,
      welfareEligible: false,
      childBenefitEligible: false,
      carerAllowanceEligible: false,
      receivingWelfare: false,
      receivingChildBenefit: false,
      receivingCarerAllowance: false,
      welfareNonReceiptReason: null,
      _targetMemberCount: memberCount,
    });

    totalMembers += memberCount;
  }

  return households;
}

// ─── エージェント生成 ────────────────────────────────────────

export function generateAgents(households) {
  const agents = [];
  let agCounter = 1;
  const CURRENT_YEAR = 2024;

  for (const hh of households) {
    const memberCount = hh._targetMemberCount;
    const hhAgents = [];

    for (let i = 0; i < memberCount; i++) {
      const isHead = i === 0;
      const age = sampleAge(hh, i, hhAgents, CURRENT_YEAR);
      const birthYear = CURRENT_YEAR - age;
      const gender = sampleGender(hh, i);

      // 学歴
      const education = sampleEducation(birthYear, age);

      // 就業状態
      const { employmentStatus, employmentType, industry } = sampleEmployment(gender, age, education);

      // 年収
      const annualIncome = sampleAnnualIncome(gender, age, education, industry, employmentType, employmentStatus);

      // 貯蓄
      const savings = sampleSavings(age, annualIncome);

      // 気質
      const baseMPC = sampleMPC(annualIncome);
      const consumptionBasketFoodRatio = sampleFoodRatio(annualIncome);
      const riskTolerance = weightedSample(
        EST_RISK_TOLERANCE_DIST.map(d => ({ value: d.level, weight: d.weight }))
      );
      const publicServiceReliance = clamp(
        gaussianRandom(EST_PUBLIC_SERVICE_RELIANCE_PARAMS.mean, EST_PUBLIC_SERVICE_RELIANCE_PARAMS.stdDev),
        EST_PUBLIC_SERVICE_RELIANCE_PARAMS.min,
        EST_PUBLIC_SERVICE_RELIANCE_PARAMS.max,
      );

      // 平均余命
      const baseLifeExpectancy = gender === 'M'
        ? STAT_LIFE_EXPECTANCY.male
        : STAT_LIFE_EXPECTANCY.female;

      // 健康・幸福・政府信頼
      const health = sampleHealth(age, annualIncome, employmentStatus);
      const happiness = sampleHappiness(annualIncome, employmentStatus, hh.region);
      const govTrust = sampleGovTrust(annualIncome, employmentStatus);

      // 職業レベル
      const occupationLevel = sampleOccupationLevel(age, education, employmentType);

      const agent = {
        // 不変
        id: nextId('ag', agCounter++),
        householdId: hh.id,
        birthYear,
        gender,
        region: hh.region,
        education,
        baseLifeExpectancy,

        // 気質
        baseMPC,
        riskTolerance,
        publicServiceReliance,

        // 就業
        employmentStatus,
        employmentType,
        industry,
        occupationLevel,
        turnsInCurrentJob: randomInt(0, 20),

        // 所得・資産
        annualIncome,
        savings,
        debtBalance: 0,

        // 税計算結果（TaxCalculator が毎ターン更新）
        employmentIncomeDeduction: 0,
        totalDeductions: 0,
        taxableIncome: 0,
        incomeTaxAnnual: 0,
        incomeTaxAfterCredit: 0,
        municipalTax: 0,
        healthInsurancePremium: 0,
        pensionPremium: 0,
        employmentInsurancePremium: 0,
        careInsurancePremium: 0,
        eitcTaxCreditAmount: 0,
        eitcCashBenefitAmount: 0,
        effectiveConsumptionTaxRate: 0,
        consumptionTaxBurdenAnnual: 0,
        disposableIncome: annualIncome, // 税計算前の仮値
        totalTaxBurden: 0,
        effectiveTotalBurdenRate: 0,
        netBenefitFromGov: 0,

        // 消費
        semiannualConsumption: 0,
        consumptionBasketFoodRatio,

        // 社会
        health,
        happiness,
        govTrust,

        // ライフイベント
        isJobSeeking: employmentStatus === 'unemployed',
        isOnParentalLeave: false,

        // エンジン内部
        policyEffectQueue: [],
      };

      hhAgents.push(agent);
      agents.push(agent);
      hh.memberIds.push(agent.id);
    }

    // 世帯集計値を初期化
    updateHouseholdAggregates(hh, hhAgents);
  }

  return agents;
}

// ─── 年齢サンプリング ────────────────────────────────────────

function sampleAge(hh, memberIndex, existingAgents, currentYear) {
  const p = EST_HOUSEHOLD_AGE_PARAMS.headAgeDistribution;
  const type = hh.type;

  if (memberIndex === 0) {
    // 世帯主
    switch (type) {
      case 'single':
        return sampleSingleAge(hh.region);
      case 'couple':
      case 'couple_with_child': {
        const headP = p[type].head;
        return clamp(Math.round(gaussianRandom(headP.mean, headP.stdDev)), headP.ageMin, headP.ageMax);
      }
      case 'single_parent': {
        const headP = p.single_parent.head;
        return clamp(Math.round(gaussianRandom(headP.mean, headP.stdDev)), headP.ageMin, headP.ageMax);
      }
      case 'three_generation': {
        const headP = p.three_generation.grandparent;
        return clamp(Math.round(gaussianRandom(headP.mean, headP.stdDev)), headP.ageMin, headP.ageMax);
      }
      default: {
        // other
        const age = clamp(Math.round(gaussianRandom(45, 15)), 20, 85);
        return age;
      }
    }
  }

  // 2人目以降
  const headAge = existingAgents[0] ? currentYear - existingAgents[0].birthYear : 45;

  if (type === 'couple' || type === 'couple_with_child') {
    if (memberIndex === 1) {
      // 配偶者
      const diff = Math.round(gaussianRandom(p[type].spouseAgeDiff.mean, p[type].spouseAgeDiff.stdDev));
      return clamp(headAge + diff, 20, 95);
    } else {
      // 子ども
      const offset = EST_HOUSEHOLD_AGE_PARAMS.childAgeOffset;
      const childAge = headAge - Math.round(gaussianRandom(offset.mean, offset.stdDev))
        - (memberIndex - 2) * randomInt(1, 4);
      return Math.max(0, childAge);
    }
  }

  if (type === 'single_parent') {
    const offset = EST_HOUSEHOLD_AGE_PARAMS.childAgeOffset;
    const childAge = headAge - Math.round(gaussianRandom(offset.mean, offset.stdDev))
      - (memberIndex - 1) * randomInt(1, 4);
    return Math.max(0, childAge);
  }

  if (type === 'three_generation') {
    if (memberIndex === 1) {
      // 2世代目（親世代）
      const parentP = p.three_generation.parent;
      return clamp(Math.round(gaussianRandom(parentP.mean, parentP.stdDev)), parentP.ageMin, parentP.ageMax);
    } else if (memberIndex === 2) {
      // 3世代目の配偶者
      const parentAge = currentYear - existingAgents[1].birthYear;
      return clamp(parentAge + Math.round(gaussianRandom(-2, 3)), 30, 65);
    } else {
      // 孫
      const parentAge = existingAgents[1] ? currentYear - existingAgents[1].birthYear : 46;
      const offset = EST_HOUSEHOLD_AGE_PARAMS.childAgeOffset;
      return Math.max(0, parentAge - Math.round(gaussianRandom(offset.mean, offset.stdDev)) - (memberIndex - 3) * 2);
    }
  }

  // other
  return clamp(Math.round(gaussianRandom(45, 15)), 15, 85);
}

// ─── 性別サンプリング ────────────────────────────────────────

function sampleGender(hh, memberIndex) {
  if (hh.type === 'single_parent') {
    if (memberIndex === 0) {
      return Math.random() < STAT_SINGLE_PARENT_MOTHER_RATIO ? 'F' : 'M';
    }
  }
  if (hh.type === 'couple' || hh.type === 'couple_with_child' || hh.type === 'three_generation') {
    // 世帯主 M、配偶者 F（簡略化）
    if (memberIndex === 0) return 'M';
    if (memberIndex === 1) return 'F';
    if (memberIndex === 2 && hh.type === 'three_generation') return 'F'; // 嫁
  }
  return Math.random() < STAT_SEX_RATIO.male ? 'M' : 'F';
}

// ─── 学歴サンプリング ────────────────────────────────────────

function sampleEducation(birthYear, age) {
  if (age < 15) return 'middle_school'; // 義務教育中
  if (age < 18) return 'high_school';   // 高校在学中相当
  if (age < 22) {
    // 在学中の可能性
    const uniRate = getUniversityRateByCohort(birthYear);
    return Math.random() < uniRate ? 'university' : 'high_school';
  }

  // 25歳以上：コーホート補正あり学歴分布
  const uniRate = getUniversityRateByCohort(birthYear);
  const scaleFactor = uniRate / 0.537; // 基準年（1990年代生）との比率

  // 大卒＋大学院率を調整
  const adjDist = STAT_EDUCATION_DISTRIBUTION_ADULT.map(d => {
    if (d.level === 'university' || d.level === 'graduate') {
      return { ...d, ratio: d.ratio * scaleFactor };
    }
    return d;
  });
  // 合計を1に正規化
  const total = adjDist.reduce((s, d) => s + d.ratio, 0);
  const normDist = adjDist.map(d => ({ ...d, ratio: d.ratio / total }));

  return sampleFromDistribution(normDist).level;
}

// ─── 就業状態サンプリング ────────────────────────────────────

function sampleEmployment(gender, age, education) {
  if (age < 15) {
    return { employmentStatus: 'student', employmentType: null, industry: null };
  }
  if (age < 18) {
    return Math.random() < 0.85
      ? { employmentStatus: 'student', employmentType: null, industry: null }
      : { employmentStatus: 'employed', employmentType: 'nonregular', industry: sampleIndustry() };
  }
  if (age < 22 && education === 'university') {
    return Math.random() < 0.80
      ? { employmentStatus: 'student', employmentType: null, industry: null }
      : { employmentStatus: 'employed', employmentType: 'nonregular', industry: sampleIndustry() };
  }

  if (age >= 75) {
    const lfRate = getLaborForceRate(gender, age);
    if (Math.random() > lfRate) {
      return { employmentStatus: 'retired', employmentType: null, industry: null };
    }
  }

  const lfRate = getLaborForceRate(gender, age);
  if (Math.random() > lfRate) {
    // 非労働力
    const status = age >= 65 ? 'retired' : 'inactive';
    return { employmentStatus: status, employmentType: null, industry: null };
  }

  // 労働力人口内：失業 or 就業
  const unempRate = getUnemploymentRate(age);
  if (Math.random() < unempRate) {
    return { employmentStatus: 'unemployed', employmentType: null, industry: null };
  }

  // 就業：雇用形態
  const regularRate = getRegularRate(gender, age);
  const employmentType = Math.random() < regularRate ? 'regular' : 'nonregular';
  const industry = sampleIndustry();

  return { employmentStatus: 'employed', employmentType, industry };
}

function sampleIndustry() {
  return sampleFromDistribution(STAT_INDUSTRY_DISTRIBUTION).industry;
}

// ─── 職業レベルサンプリング ──────────────────────────────────

function sampleOccupationLevel(age, education, employmentType) {
  if (employmentType !== 'regular') return 'entry';
  if (age < 28) return 'entry';
  if (age < 35) return Math.random() < 0.7 ? 'entry' : 'mid';
  if (age < 45) return Math.random() < 0.5 ? 'mid' : (Math.random() < 0.3 ? 'senior' : 'entry');
  if (age < 55) {
    const r = Math.random();
    if (education === 'graduate' || education === 'university') {
      return r < 0.15 ? 'executive' : r < 0.50 ? 'senior' : 'mid';
    }
    return r < 0.05 ? 'executive' : r < 0.35 ? 'senior' : 'mid';
  }
  return Math.random() < 0.10 ? 'executive' : Math.random() < 0.45 ? 'senior' : 'mid';
}

// ─── 年収サンプリング ────────────────────────────────────────

function sampleAnnualIncome(gender, age, education, industry, employmentType, employmentStatus) {
  if (employmentStatus !== 'employed') return 0;
  if (employmentType === null) return 0;

  const ageKey = floorKey(EST_AGE_INCOME_INDEX, age);
  const ageIndex = EST_AGE_INCOME_INDEX[ageKey] ?? 0.51;
  const eduFactor = EST_EDUCATION_INCOME_FACTOR[education] ?? 1.0;
  const indFactor = industry ? (EST_INDUSTRY_INCOME_FACTOR[industry] ?? 1.0) : 1.0;
  const genderFactor = gender === 'F' ? STAT_GENDER_WAGE_RATIO : 1.0;
  const typeFactor = employmentType === 'nonregular' ? EST_NONREGULAR_INCOME_FACTOR : 1.0;

  const median = EST_BASE_ANNUAL_INCOME * ageIndex * eduFactor * indFactor * genderFactor * typeFactor;
  const income = lognormalSample(median, EST_INCOME_LOGNORMAL_SIGMA);
  return Math.max(0, Math.round(income));
}

// ─── 貯蓄サンプリング ────────────────────────────────────────

function sampleSavings(age, annualIncome) {
  const ageFloor = floorKey(STAT_SAVINGS_BALANCE_BY_AGE, Math.max(30, age));
  const medianManyen = STAT_SAVINGS_BALANCE_BY_AGE[ageFloor] ?? STAT_SAVINGS_BALANCE_BY_AGE.overall;
  const median = medianManyen * 10_000;
  const raw = lognormalSample(median, EST_SAVINGS_LOGNORMAL_SIGMA);
  return Math.max(0, Math.round(raw));
}

// ─── MPC サンプリング ────────────────────────────────────────

function sampleMPC(annualIncome) {
  const p = EST_MPC_PARAMS;
  const income = Math.max(annualIncome, 100_000); // ゼロ除算ガード
  const base = p.intercept + p.incomeElasticity * Math.log10(income / p.referenceIncome);
  const noise = gaussianRandom(0, p.noiseStdDev);
  return clamp(base + noise, p.min, p.max);
}

// ─── エンゲル係数サンプリング ────────────────────────────────

function sampleFoodRatio(annualIncome) {
  const p = EST_ENGEL_COEFFICIENT_PARAMS;
  const income = Math.max(annualIncome, 100_000);
  const ratio = p.intercept + p.incomeElasticity * Math.log10(income / p.referenceIncome);
  return clamp(ratio, p.min, p.max);
}

// ─── 健康度サンプリング ──────────────────────────────────────

function sampleHealth(age, annualIncome, employmentStatus) {
  const p = EST_HEALTH_PARAMS;
  const ageKey = floorKey(p.baseByAge, age);
  const base = p.baseByAge[ageKey] ?? 50;

  const incomeAdj = annualIncome < 2_000_000 ? p.incomeAdjustment.under2m
    : annualIncome < 4_000_000 ? p.incomeAdjustment['2m_4m']
    : annualIncome < 6_000_000 ? p.incomeAdjustment['4m_6m']
    : p.incomeAdjustment.over6m;

  const empAdj = p.employmentAdjustment[employmentStatus] ?? 0;
  const noise = gaussianRandom(0, p.noiseStdDev);
  return clamp(base + incomeAdj + empAdj + noise, p.min, p.max);
}

// ─── 幸福度サンプリング ──────────────────────────────────────

function sampleHappiness(annualIncome, employmentStatus, region) {
  const p = EST_HAPPINESS_PARAMS;
  const income = Math.max(annualIncome, 100_000);
  const incomeScore = clamp(
    p.incomeScore.coefficient * Math.log10(income / p.incomeScore.referenceIncome),
    0, p.incomeScore.max,
  );
  const empScore = p.employmentScore[employmentStatus] ?? 0;
  const regionScore = p.regionScore[region] ?? 0;
  const noise = gaussianRandom(0, p.noiseStdDev);
  return clamp(p.baseScore + incomeScore + empScore + regionScore + noise, p.min, p.max);
}

// ─── 政府信頼度サンプリング ──────────────────────────────────

function sampleGovTrust(annualIncome, employmentStatus) {
  const p = EST_GOV_TRUST_PARAMS;
  const incomeAdj = annualIncome < 2_000_000 ? p.incomeAdjustment.under2m
    : annualIncome < 4_000_000 ? p.incomeAdjustment['2m_4m']
    : annualIncome < 6_000_000 ? p.incomeAdjustment['4m_6m']
    : p.incomeAdjustment.over6m;
  const empAdj = p.employmentAdjustment[employmentStatus] ?? 0;
  const score = gaussianRandom(p.baseMean + incomeAdj + empAdj, p.baseStdDev);
  return clamp(score, p.min, p.max);
}

// ─── 世帯集計値の更新 ────────────────────────────────────────

export function updateHouseholdAggregates(household, agents) {
  const members = agents.filter(a => a.householdId === household.id);
  const CURRENT_YEAR = 2024;

  household.combinedIncome = members.reduce((s, a) => s + a.annualIncome, 0);
  household.combinedSavings = members.reduce((s, a) => s + a.savings, 0);

  // 扶養人数：15歳未満 または 扶養控除適用年齢
  household.dependentCount = members.filter(a => {
    const age = CURRENT_YEAR - a.birthYear;
    return age < 16 || (age >= 16 && a.employmentStatus === 'student' && age < 23);
  }).length;
}

// ─── 捕捉率ロジック ──────────────────────────────────────────

export function applyWelfareTakeup(household, policy) {
  const welfareThreshold = calcWelfareThreshold(household.region, household.dependentCount);
  household.welfareEligible = household.combinedIncome < welfareThreshold;

  if (!household.welfareEligible) {
    household.receivingWelfare = false;
    household.welfareNonReceiptReason = null;
    return;
  }

  const barrierReduction = policy?.welfareBarrierReduction ?? {};
  const adjustedReasons = STAT_WELFARE_TAKEUP_RATE.nonReceiptReasons.map(r => ({
    ...r,
    ratio: r.ratio * (1 - (barrierReduction[r.reason] ?? 0)),
  }));
  const totalBarrier = adjustedReasons.reduce((s, r) => s + r.ratio, 0);
  const effectiveTakeupRate = 1 - totalBarrier * (1 - STAT_WELFARE_TAKEUP_RATE.overall);

  if (Math.random() < effectiveTakeupRate) {
    household.receivingWelfare = true;
    household.welfareNonReceiptReason = null;
  } else {
    household.receivingWelfare = false;
    household.welfareNonReceiptReason = weightedSample(
      adjustedReasons.map(r => ({ value: r.reason, weight: r.ratio }))
    );
  }
}

// 生活保護の最低生活費基準（簡略モデル）
// @note 実際の基準額は地域・世帯構成によって複雑に変わる。
//       ここでは第1類（個人費）+第2類（世帯費）の概算を使用。
function calcWelfareThreshold(region, dependentCount) {
  const BASE = {
    urban:    1_560_000, // 1級地-1（東京23区等）の単身基準×12ヶ月
    suburban: 1_440_000, // 2級地
    rural:    1_320_000, // 3級地
  };
  const base = BASE[region] ?? BASE.suburban;
  const perDependent = 300_000; // 扶養1人あたり加算（概算）
  return base + perDependent * dependentCount;
}

// ─── エントリポイント ────────────────────────────────────────

export function generateSimulation(targetAgentCount = 1000, taxPolicy = null) {
  const households = generateHouseholds(targetAgentCount);
  const agents = generateAgents(households);

  // 捕捉率ロジック適用
  for (const hh of households) {
    applyWelfareTakeup(hh, taxPolicy ?? {});
  }

  // _targetMemberCount は内部用なので削除
  for (const hh of households) {
    delete hh._targetMemberCount;
  }

  return { agents, households };
}
