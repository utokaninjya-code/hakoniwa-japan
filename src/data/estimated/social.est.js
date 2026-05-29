/**
 * social.est.js
 * 幸福度・健康度・政府信頼度の初期値モデルパラメータ（推定値）
 */

// ─────────────────────────────────────────────────────────────
// 幸福度（happiness: 0〜100）初期値モデル
// @derivation
//   内閣府「満足度・生活の質に関する調査」2023年の
//   各要因（所得・雇用・健康・地域）と生活満足度（0〜10点）の
//   重回帰分析結果を参考に係数を設定。
//   シミュレーターの変数構造（0〜100点）に合わせてスケール変換（×10）。
//   STAT_LIFE_SATISFACTION の値との整合を確認済み。
// @status  統計を参考にした推計。係数は調整値。
// ─────────────────────────────────────────────────────────────
export const EST_HAPPINESS_PARAMS = {
  // 全エージェント共通の基底スコア
  baseScore: 45.0,

  // 所得スコア（対数スケール）
  // 年収200万円を基準(0)として、所得増加による幸福度上昇を表現
  incomeScore: {
    coefficient:    15.0,       // log10(income/reference) に乗じる係数
    referenceIncome: 2_000_000, // 基準年収
    max:            40.0,       // 所得由来スコアの上限
  },

  // 就業状態スコア
  employmentScore: {
    employed:   20.0,
    retired:    10.0,
    student:     5.0,
    inactive:    0.0,
    unemployed: -15.0,
  },

  // 地域スコア
  // @derivation 都市・農村間の満足度差は調査で約0.3〜0.5点（0〜10スケール）
  regionScore: {
    urban:     2.0,
    suburban:  0.0,
    rural:    -3.0,
  },

  // 個人差ノイズ
  noiseStdDev: 8.0, // 調整値

  // クランプ範囲
  min: 10.0,
  max: 95.0,
};

// ─────────────────────────────────────────────────────────────
// 政府信頼度（govTrust: 0〜100）初期値モデル
// @derivation
//   STAT_GOVERNMENT_TRUST.mean_score（44.2点）を基準に、
//   所得・就業状態による補正を加える。
//   高所得者は現状維持志向でやや高め、
//   失業者・低所得者は政府不信が強い傾向をモデル化。
// @status  推計値。感度は低く設定（政府信頼は変化が緩やか）。
// ─────────────────────────────────────────────────────────────
export const EST_GOV_TRUST_PARAMS = {
  // 全体基準スコア（STAT_GOVERNMENT_TRUST.mean_score より）
  baseMean:   44.2,
  baseStdDev: 15.0, // 個人差

  // 所得補正（小さく設定：信頼度は所得との相関が弱い）
  incomeAdjustment: {
    under2m:    -5.0,
    '2m_4m':    -2.0,
    '4m_6m':     0.0, // 基準
    over6m:      3.0,
  },

  // 就業状態補正
  employmentAdjustment: {
    employed:    0.0,
    unemployed: -8.0,
    inactive:   -2.0,
    student:     2.0,
    retired:    -3.0,
  },

  min:  5.0,
  max: 95.0,
};

// ─────────────────────────────────────────────────────────────
// 健康度（health: 0〜100）初期値モデル
// @derivation
//   厚生労働省「国民生活基礎調査」の年齢別健康状態（自己評価）および
//   QOL研究の年齢-健康スコア曲線を参考に設定。
//   若年で高く、加齢とともに低下する曲線。
//   所得・就業状態による補正あり（健康格差）。
// @status  推計値。実際の年齢-健康曲線の近似。
// ─────────────────────────────────────────────────────────────
export const EST_HEALTH_PARAMS = {
  // 年齢別 基準健康スコア（ピーク=25歳の95点から逓減）
  baseByAge: {
     0: 92.0,
    10: 95.0, // ピーク
    20: 93.0,
    30: 89.0,
    40: 83.0,
    50: 75.0,
    60: 65.0,
    70: 53.0,
    80: 42.0,
    90: 30.0,
  },

  // 所得補正（健康格差：低所得者ほど健康状態が悪い）
  // @derivation 健康格差に関する研究（近藤・2022年等）を参考
  incomeAdjustment: {
    under2m:    -8.0,
    '2m_4m':    -3.0,
    '4m_6m':     0.0, // 基準
    over6m:      3.0,
  },

  // 就業状態補正
  employmentAdjustment: {
    employed:    2.0,
    unemployed: -6.0,
    inactive:   -2.0,
    student:     3.0,
    retired:    -1.0,
  },

  noiseStdDev: 6.0,
  min:  5.0,
  max: 100.0,
};

// ─────────────────────────────────────────────────────────────
// 世帯タイプ別 年齢分布の設計パラメータ（エージェント生成用）
// @derivation
//   国勢調査の世帯タイプ別の世帯主年齢分布から推計。
//   正規分布で近似。
//   ひとり親世帯の母子比率は STAT_SINGLE_PARENT_MOTHER_RATIO を参照。
// @status  推計値。生成アルゴリズムの核心部分。要検証。
// ─────────────────────────────────────────────────────────────
export const EST_HOUSEHOLD_AGE_PARAMS = {
  // 世帯主（または筆頭成人）の年齢分布
  headAgeDistribution: {
    single: {
      // 単独世帯は若年と高齢の二峰性を持つ
      // urban/ruralで重みが異なる（estimated/household.est.jsへの依存）
      youngPeak:  { mean: 30, stdDev: 8, ageMin: 20, ageMax: 44 },
      middlePeak: { mean: 52, stdDev: 7, ageMin: 45, ageMax: 64 },
      elderlyPeak:{ mean: 74, stdDev: 7, ageMin: 65, ageMax: 95 },
    },
    couple: {
      // 夫婦のみ世帯は中高年が中心（子育て後）
      head: { mean: 63, stdDev: 11, ageMin: 35, ageMax: 90 },
      spouseAgeDiff: { mean: -2, stdDev: 4 }, // 妻は夫より平均2歳若い
    },
    couple_with_child: {
      // 子育て世帯の親年齢
      head: { mean: 42, stdDev:  7, ageMin: 25, ageMax: 58 },
      spouseAgeDiff: { mean: -2, stdDev: 3 },
    },
    single_parent: {
      head: { mean: 41, stdDev:  8, ageMin: 25, ageMax: 58 },
    },
    three_generation: {
      grandparent: { mean: 72, stdDev:  6, ageMin: 60, ageMax: 90 },
      parent:      { mean: 46, stdDev:  5, ageMin: 35, ageMax: 60 },
    },
  },

  // 子どもの年齢: 親年齢 - 出産年齢オフセット
  childAgeOffset: {
    mean:   27, // 親より27歳下（平均初産年齢 30.9歳から概算）
    stdDev:  4,
    // @source 厚生労働省「人口動態統計」2022年 母の平均出産年齢 30.9歳
  },
};
