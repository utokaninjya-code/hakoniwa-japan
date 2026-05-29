/**
 * src/engine/agentFactory.js
 * 世帯・エージェントの生成（年齢分布ファースト方式）
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

function floorKey(table, age) {
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  let result = keys[0];
  for (const k of keys) {
    if (k <= age) result = k;
    else break;
  }
  return result;
}

function lookupByAge(table, age) {
  return table[floorKey(table, age)];
}

function getLaborForceRate(gender, age) {
  const table = STAT_LABOR_FORCE_RATE[gender === 'M' ? 'male' : 'female'];
  return lookupByAge(table, age) ?? 0;
}

function getRegularRate(gender, age) {
  const table = STAT_REGULAR_EMPLOYMENT_RATE[gender === 'M' ? 'male' : 'female'];
  return lookupByAge(table, age) ?? 0.5;
}

function getUnemploymentRate(age) {
  return lookupByAge(STAT_UNEMPLOYMENT_RATE.by_age, age) ?? STAT_UNEMPLOYMENT_RATE.overall;
}

function getUniversityRateByCohort(birthYear) {
  const decade = Math.floor(birthYear / 10) * 10;
  const keys = Object.keys(STAT_UNIVERSITY_ENROLLMENT_RATE_BY_BIRTH_DECADE).map(Number).sort((a, b) => a - b);
  const clampedDecade = clamp(decade, keys[0], keys[keys.length - 1]);
  return STAT_UNIVERSITY_ENROLLMENT_RATE_BY_BIRTH_DECADE[clampedDecade] ?? 0.537;
}

// ─── Step 1: 全エージェントの年齢・性別・地域をサンプリング ──

function sampleAgeDemographics(count) {
  return Array.from({ length: count }, (_, i) => {
    const ageBucket = sampleFromDistribution(STAT_AGE_5YEAR_DISTRIBUTION);
    const age = randomInt(ageBucket.ageMin, ageBucket.ageMax);
    const gender = Math.random() < STAT_SEX_RATIO.male ? 'M' : 'F';
    const region = sampleFromDistribution(STAT_REGION_DISTRIBUTION).region;
    return { index: i, age, gender, region };
  });
}

// ─── Step 2: 年齢から世帯タイプを決定 ────────────────────────

function determineHouseholdType(age, gender) {
  if (age < 18)  return 'single';
  if (age >= 75) return Math.random() < 0.70 ? 'single' : 'couple';
  if (age >= 65) {
    const r = Math.random();
    return r < 0.50 ? 'single' : r < 0.85 ? 'couple' : 'three_generation';
  }
  return sampleFromDistribution(STAT_HOUSEHOLD_TYPE_DIST).type;
}

// ─── Step 3: 年齢の近いエージェントを世帯にグループ化 ────────

function buildHouseholdsFromDemographics(agentSeeds) {
  const sorted = [...agentSeeds].sort((a, b) => b.age - a.age);
  const assigned = new Set();
  const households = [];
  const agentHouseholdMap = {};
  let hhCounter = 1;

  for (const seed of sorted) {
    if (assigned.has(seed.index)) continue;

    const hhType = determineHouseholdType(seed.age, seed.gender);
    const hhId = nextId('hh', hhCounter++);
    const region = seed.region;
    const memberSeeds = [seed];
    assigned.add(seed.index);

    if (hhType === 'couple' || hhType === 'couple_with_child') {
      // 配偶者候補：同世代の異性・未割当
      const spouse = sorted.find(s =>
        !assigned.has(s.index) &&
        s.gender !== seed.gender &&
        Math.abs(s.age - seed.age) <= 8 &&
        s.age >= 20
      );
      if (spouse) {
        memberSeeds.push(spouse);
        assigned.add(spouse.index);
      }

      if (hhType === 'couple_with_child') {
        const targetChildCount = sampleFromDistribution(STAT_CHILDREN_PER_FAMILY.dist).count;
        let childCount = 0;
        for (const s of sorted) {
          if (childCount >= targetChildCount) break;
          if (assigned.has(s.index)) continue;
          const ageDiff = seed.age - s.age;
          if (ageDiff >= 18 && ageDiff <= 40 && s.age <= 22) {
            memberSeeds.push(s);
            assigned.add(s.index);
            childCount++;
          }
        }
      }
    }

    if (hhType === 'single_parent') {
      const targetChildCount = sampleFromDistribution(STAT_CHILDREN_PER_FAMILY.dist).count;
      let childCount = 0;
      for (const s of sorted) {
        if (childCount >= targetChildCount) break;
        if (assigned.has(s.index)) continue;
        const ageDiff = seed.age - s.age;
        if (ageDiff >= 18 && ageDiff <= 35 && s.age < 18) {
          memberSeeds.push(s);
          assigned.add(s.index);
          childCount++;
        }
      }
    }

    if (hhType === 'three_generation') {
      // 親世代（seed より20〜35歳下）
      const parent = sorted.find(s =>
        !assigned.has(s.index) &&
        seed.age - s.age >= 20 && seed.age - s.age <= 40 &&
        s.age >= 30
      );
      if (parent) {
        memberSeeds.push(parent);
        assigned.add(parent.index);
        // 孫（親より15〜30歳下）
        const grandchild = sorted.find(s =>
          !assigned.has(s.index) &&
          parent.age - s.age >= 15 && parent.age - s.age <= 30
        );
        if (grandchild) {
          memberSeeds.push(grandchild);
          assigned.add(grandchild.index);
        }
      }
    }

    // 住居情報
    const ownershipRate = STAT_HOME_OWNERSHIP_RATE_BY_REGION[region];
    const isOwner = Math.random() < ownershipRate;
    const housingType = isOwner ? 'own' : (Math.random() < 0.15 ? 'public' : 'rent');
    const housingCostMonthly = isOwner ? 0
      : lognormalSample(STAT_MONTHLY_RENT_BY_REGION[region], 0.25);
    const mortgageRemaining = isOwner && Math.random() < STAT_MORTGAGE_HOLDER_RATIO
      ? lognormalSample(STAT_MORTGAGE_BALANCE_MEDIAN, 0.4)
      : 0;

    const hh = {
      id: hhId,
      type: hhType,
      memberIds: [],
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
      _memberSeeds: memberSeeds,
    };

    for (const s of memberSeeds) {
      agentHouseholdMap[s.index] = hhId;
    }
    households.push(hh);
  }

  // 未割当エージェントを単独世帯として処理
  for (const seed of agentSeeds) {
    if (assigned.has(seed.index)) continue;
    const hhId = nextId('hh', hhCounter++);
    const region = seed.region;
    const ownershipRate = STAT_HOME_OWNERSHIP_RATE_BY_REGION[region];
    const isOwner = Math.random() < ownershipRate;
    const hh = {
      id: hhId,
      type: 'single',
      memberIds: [],
      region,
      housingType: isOwner ? 'own' : 'rent',
      housingCostMonthly: isOwner ? 0 : lognormalSample(STAT_MONTHLY_RENT_BY_REGION[region], 0.25),
      mortgageRemaining: 0,
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
      _memberSeeds: [seed],
    };
    agentHouseholdMap[seed.index] = hhId;
    households.push(hh);
  }

  return { households, agentHouseholdMap };
}

// ─── Step 4: エージェント生成（年齢・性別は確定済み） ─────────

function buildAgents(agentSeeds, households, agentHouseholdMap) {
  const agents = [];
  const hhMap = Object.fromEntries(households.map(h => [h.id, h]));
  const CURRENT_YEAR = 2024;
  let agCounter = 1;

  for (const seed of agentSeeds) {
    const { age, gender, region } = seed;
    const birthYear = CURRENT_YEAR - age;
    const hhId = agentHouseholdMap[seed.index];
    const hh = hhMap[hhId];
    if (!hh) continue;

    const education  = sampleEducation(birthYear, age);
    const { employmentStatus, employmentType, industry } = sampleEmployment(gender, age, education);
    const annualIncome = sampleAnnualIncome(gender, age, education, industry, employmentType, employmentStatus);
    const savings = sampleSavings(age, annualIncome);
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
    const baseLifeExpectancy = gender === 'M'
      ? STAT_LIFE_EXPECTANCY.male
      : STAT_LIFE_EXPECTANCY.female;
    const health    = sampleHealth(age, annualIncome, employmentStatus);
    const happiness = sampleHappiness(annualIncome, employmentStatus, region);
    const govTrust  = sampleGovTrust(annualIncome, employmentStatus);
    const occupationLevel = sampleOccupationLevel(age, education, employmentType);

    const agent = {
      id: nextId('ag', agCounter++),
      householdId: hhId,
      birthYear,
      gender,
      region,
      education,
      baseLifeExpectancy,
      baseMPC,
      riskTolerance,
      publicServiceReliance,
      employmentStatus,
      employmentType,
      industry,
      occupationLevel,
      turnsInCurrentJob: randomInt(0, 20),
      annualIncome,
      savings,
      debtBalance: 0,
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
      disposableIncome: annualIncome,
      totalTaxBurden: 0,
      effectiveTotalBurdenRate: 0,
      netBenefitFromGov: 0,
      semiannualConsumption: 0,
      consumptionBasketFoodRatio,
      health,
      happiness,
      govTrust,
      isJobSeeking: employmentStatus === 'unemployed',
      isOnParentalLeave: false,
      policyEffectQueue: [],
    };

    agents.push(agent);
    hh.memberIds.push(agent.id);
  }

  return agents;
}

// ─── 属性サンプリング関数群 ──────────────────────────────────

function sampleEducation(birthYear, age) {
  if (age < 15) return 'middle_school';
  if (age < 18) return 'high_school';
  if (age < 22) {
    const uniRate = getUniversityRateByCohort(birthYear);
    return Math.random() < uniRate ? 'university' : 'high_school';
  }
  const uniRate = getUniversityRateByCohort(birthYear);
  const scaleFactor = uniRate / 0.537;
  const adjDist = STAT_EDUCATION_DISTRIBUTION_ADULT.map(d => {
    if (d.level === 'university' || d.level === 'graduate') {
      return { ...d, ratio: d.ratio * scaleFactor };
    }
    return d;
  });
  const total = adjDist.reduce((s, d) => s + d.ratio, 0);
  const normDist = adjDist.map(d => ({ ...d, ratio: d.ratio / total }));
  return sampleFromDistribution(normDist).level;
}

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

  const lfRate = getLaborForceRate(gender, age);
  if (Math.random() > lfRate) {
    const status = age >= 65 ? 'retired' : 'inactive';
    return { employmentStatus: status, employmentType: null, industry: null };
  }

  const unempRate = getUnemploymentRate(age);
  if (Math.random() < unempRate) {
    return { employmentStatus: 'unemployed', employmentType: null, industry: null };
  }

  const regularRate = getRegularRate(gender, age);
  const employmentType = Math.random() < regularRate ? 'regular' : 'nonregular';
  return { employmentStatus: 'employed', employmentType, industry: sampleIndustry() };
}

function sampleIndustry() {
  return sampleFromDistribution(STAT_INDUSTRY_DISTRIBUTION).industry;
}

function sampleOccupationLevel(age, education, employmentType) {
  if (employmentType !== 'regular') return 'entry';
  if (age < 28) return 'entry';
  if (age < 35) return Math.random() < 0.7 ? 'entry' : 'mid';
  if (age < 45) {
    const r = Math.random();
    return r < 0.50 ? 'mid' : r < 0.80 ? 'senior' : 'entry';
  }
  if (age < 55) {
    const r = Math.random();
    if (education === 'graduate' || education === 'university') {
      return r < 0.15 ? 'executive' : r < 0.50 ? 'senior' : 'mid';
    }
    return r < 0.05 ? 'executive' : r < 0.35 ? 'senior' : 'mid';
  }
  return Math.random() < 0.10 ? 'executive' : Math.random() < 0.45 ? 'senior' : 'mid';
}

function sampleAnnualIncome(gender, age, education, industry, employmentType, employmentStatus) {
  if (employmentStatus !== 'employed' || employmentType === null) return 0;

  const ageKey = floorKey(EST_AGE_INCOME_INDEX, age);
  const ageIndex = EST_AGE_INCOME_INDEX[ageKey] ?? 0.51;
  const eduFactor = EST_EDUCATION_INCOME_FACTOR[education] ?? 1.0;
  const indFactor = industry ? (EST_INDUSTRY_INCOME_FACTOR[industry] ?? 1.0) : 1.0;
  const genderFactor = gender === 'F' ? STAT_GENDER_WAGE_RATIO : 1.0;
  const typeFactor = employmentType === 'nonregular' ? EST_NONREGULAR_INCOME_FACTOR : 1.0;

  const median = EST_BASE_ANNUAL_INCOME * ageIndex * eduFactor * indFactor * genderFactor * typeFactor;
  return Math.max(0, Math.round(lognormalSample(median, EST_INCOME_LOGNORMAL_SIGMA)));
}

function sampleSavings(age, annualIncome) {
  // 'overall' など非数値キーを除外してから参照する
  const numericTable = Object.fromEntries(
    Object.entries(STAT_SAVINGS_BALANCE_BY_AGE)
      .filter(([k]) => !isNaN(Number(k)))
      .map(([k, v]) => [Number(k), v])
  );
  const ageFloor = floorKey(numericTable, Math.max(30, age));
  const medianManyen = numericTable[ageFloor] ?? 660;
  const median = medianManyen * 10_000;
  return Math.max(0, Math.round(lognormalSample(median, EST_SAVINGS_LOGNORMAL_SIGMA)));
}

function sampleMPC(annualIncome) {
  const p = EST_MPC_PARAMS;
  const income = Math.max(annualIncome, 100_000);
  const base = p.intercept + p.incomeElasticity * Math.log10(income / p.referenceIncome);
  return clamp(base + gaussianRandom(0, p.noiseStdDev), p.min, p.max);
}

function sampleFoodRatio(annualIncome) {
  const p = EST_ENGEL_COEFFICIENT_PARAMS;
  const income = Math.max(annualIncome, 100_000);
  return clamp(
    p.intercept + p.incomeElasticity * Math.log10(income / p.referenceIncome),
    p.min, p.max,
  );
}

function sampleHealth(age, annualIncome, employmentStatus) {
  const p = EST_HEALTH_PARAMS;
  const ageKey = floorKey(p.baseByAge, age);
  const base = p.baseByAge[ageKey] ?? 50;
  const incomeAdj = annualIncome < 2_000_000 ? p.incomeAdjustment.under2m
    : annualIncome < 4_000_000 ? p.incomeAdjustment['2m_4m']
    : annualIncome < 6_000_000 ? p.incomeAdjustment['4m_6m']
    : p.incomeAdjustment.over6m;
  const empAdj = p.employmentAdjustment[employmentStatus] ?? 0;
  return clamp(base + incomeAdj + empAdj + gaussianRandom(0, p.noiseStdDev), p.min, p.max);
}

function sampleHappiness(annualIncome, employmentStatus, region) {
  const p = EST_HAPPINESS_PARAMS;
  const income = Math.max(annualIncome, 100_000);
  const incomeScore = clamp(
    p.incomeScore.coefficient * Math.log10(income / p.incomeScore.referenceIncome),
    0, p.incomeScore.max,
  );
  const empScore = p.employmentScore[employmentStatus] ?? 0;
  const regionScore = p.regionScore[region] ?? 0;
  return clamp(p.baseScore + incomeScore + empScore + regionScore + gaussianRandom(0, p.noiseStdDev), p.min, p.max);
}

function sampleGovTrust(annualIncome, employmentStatus) {
  const p = EST_GOV_TRUST_PARAMS;
  const incomeAdj = annualIncome < 2_000_000 ? p.incomeAdjustment.under2m
    : annualIncome < 4_000_000 ? p.incomeAdjustment['2m_4m']
    : annualIncome < 6_000_000 ? p.incomeAdjustment['4m_6m']
    : p.incomeAdjustment.over6m;
  const empAdj = p.employmentAdjustment[employmentStatus] ?? 0;
  return clamp(
    gaussianRandom(p.baseMean + incomeAdj + empAdj, p.baseStdDev),
    p.min, p.max,
  );
}

// ─── 世帯集計値の更新 ────────────────────────────────────────

export function updateHouseholdAggregates(household, agents) {
  const members = agents.filter(a => a.householdId === household.id);
  const CURRENT_YEAR = 2024;

  household.combinedIncome = members.reduce((s, a) => s + a.annualIncome, 0);
  household.combinedSavings = members.reduce((s, a) => s + a.savings, 0);
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

// @adjustment 捕捉率が低すぎたため閾値を引き上げ（Fix 4）
function calcWelfareThreshold(region, dependentCount) {
  const BASE = {
    urban:    1_800_000,
    suburban: 1_650_000,
    rural:    1_500_000,
  };
  const base = BASE[region] ?? BASE.suburban;
  const perDependent = 380_000;
  return base + perDependent * dependentCount;
}

// ─── エントリポイント ────────────────────────────────────────

export function generateSimulation(targetAgentCount = 1000, taxPolicy = null) {
  // Step 1: 全エージェントの年齢・性別・地域を先にサンプリング
  const agentSeeds = sampleAgeDemographics(targetAgentCount);

  // Step 2: 年齢が近いエージェントを世帯にグループ化
  const { households, agentHouseholdMap } = buildHouseholdsFromDemographics(agentSeeds);

  // Step 3: 各エージェントを生成
  const agents = buildAgents(agentSeeds, households, agentHouseholdMap);

  // Step 4: 世帯集計値を更新
  for (const hh of households) {
    const members = agents.filter(a => a.householdId === hh.id);
    updateHouseholdAggregates(hh, members);
  }

  // Step 5: 捕捉率ロジック
  for (const hh of households) {
    applyWelfareTakeup(hh, taxPolicy ?? {});
  }

  for (const hh of households) {
    delete hh._targetMemberCount;
    delete hh._memberSeeds;
  }

  return { agents, households };
}
