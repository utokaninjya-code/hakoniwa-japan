/**
 * tax.stat.js
 * 税率・控除額・社会保険料率に関する法令値
 *
 * @note ここに記載する値はすべて「法令・政令で定められた数値」であり、
 *       統計推計ではない。改正があった場合は @year を更新すること。
 *       プレイヤーが変更できる政策レバーの「初期値」としても使用する。
 */

// ─────────────────────────────────────────────────────────────
// 所得税 税率ブラケット（超過累進税率）
// @source 所得税法 第89条 別表第二
// @year   2023年（令和5年）現在
// @url    https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2260.htm
// ─────────────────────────────────────────────────────────────
export const STAT_INCOME_TAX_BRACKETS = [
  { upTo:  1_950_000, rate: 0.05, deduction:         0 },
  { upTo:  3_300_000, rate: 0.10, deduction:    97_500 },
  { upTo:  6_950_000, rate: 0.20, deduction:   427_500 },
  { upTo:  9_000_000, rate: 0.23, deduction:   636_000 },
  { upTo: 18_000_000, rate: 0.33, deduction: 1_536_000 },
  { upTo: 40_000_000, rate: 0.40, deduction: 2_796_000 },
  { upTo:   Infinity, rate: 0.45, deduction: 4_796_000 },
  // 税額 = 課税所得 × rate - deduction で計算可能
];

// ─────────────────────────────────────────────────────────────
// 給与所得控除額 ブラケット
// @source 所得税法 第28条第3項
// @year   2023年（2020年改正後・現行）
// @url    https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1410.htm
// ─────────────────────────────────────────────────────────────
export const STAT_EMPLOYMENT_INCOME_DEDUCTION_BRACKETS = [
  // income: 給与収入金額（年額）
  // formula: 'fixed'=固定額, 'rate'=収入×rate-offset
  { incomeUpTo:  1_625_000, formula: 'fixed',  amount: 550_000 },
  { incomeUpTo:  1_800_000, formula: 'rate',   rate: 0.40, offset:    0, min: 550_000 },
  { incomeUpTo:  3_600_000, formula: 'rate',   rate: 0.30, offset: -80_000 },
  // ※ 収入×0.30 + 80,000 = rate: 0.30, offset: -80000（引くとプラスになる）
  // 実装時は income * 0.30 + 80_000 として計算すること
  { incomeUpTo:  6_600_000, formula: 'rate',   rate: 0.20, offset: -440_000 },
  { incomeUpTo:  8_500_000, formula: 'rate',   rate: 0.10, offset: -1_100_000 },
  { incomeUpTo:   Infinity, formula: 'fixed',  amount: 1_950_000 }, // 上限
];
// @implementation_note
//   ブラケットの計算式（実装参考）:
//   162.5万以下       → 55万円
//   162.5万超〜180万  → 収入×40% - 10万（最低55万）
//   180万超〜360万    → 収入×30% + 8万
//   360万超〜660万    → 収入×20% + 44万
//   660万超〜850万    → 収入×10% + 110万
//   850万超           → 195万円（上限）

// ─────────────────────────────────────────────────────────────
// 所得控除額（人的控除）
// @source 所得税法 第83条〜第87条
// @year   2023年
// @url    https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/shoto320.htm
// ─────────────────────────────────────────────────────────────
export const STAT_PERSONAL_DEDUCTIONS = {
  // 基礎控除（合計所得2,400万円以下）
  basicDeduction: 480_000,

  // 配偶者控除（配偶者の合計所得48万円以下 ＝ 給与収入103万円以下）
  spouseDeduction: 380_000,
  // 老人控除対象配偶者（70歳以上）
  spouseDeductionElderly: 480_000,
  // 配偶者特別控除の段階的逓減（所得48〜133万円）は実装時に別途計算
  spouseSpecialDeductionIncomeLimit: 1_330_000, // 133万円まで段階的適用

  // 103万円の壁（配偶者控除が適用される給与収入上限）
  spouseIncomeLimit: 1_030_000,

  // 扶養控除（一般）16〜18歳・23〜69歳の扶養親族
  dependentDeduction: 380_000,
  // 特定扶養控除（19〜22歳）大学生等
  dependentDeductionSpecific: 630_000,
  // 老人扶養控除（70歳以上）別居
  dependentDeductionElderly: 480_000,
  // 老人扶養控除（70歳以上）同居
  dependentDeductionElderlyCohabitation: 580_000,
};

// ─────────────────────────────────────────────────────────────
// 住民税 税率・均等割
// @source 地方税法 第313条・第314条
// @year   2023年
// ─────────────────────────────────────────────────────────────
export const STAT_MUNICIPAL_TAX = {
  incomeRate:  0.10,    // 所得割 10%（都道府県4%＋市区町村6%）
  flatFee:     5_000,   // 均等割（都道府県1,500円＋市区町村3,500円）
  // @note 2024年から森林環境税1,000円が加算されるが2023年基準で記載
  nonTaxableIncomeThreshold: 1_000_000, // 均等割非課税の所得上限（目安）
};

// ─────────────────────────────────────────────────────────────
// 消費税率
// @source 消費税法 第29条
// @year   2019年10月以降（現行）
// ─────────────────────────────────────────────────────────────
export const STAT_CONSUMPTION_TAX = {
  standardRate: 0.10,  // 標準税率
  reducedRate:  0.08,  // 軽減税率（食料品・定期購読新聞）
  // 軽減税率対象：酒類・外食を除く食料品、週2回以上発行の定期購読新聞
};

// ─────────────────────────────────────────────────────────────
// 健康保険料率（協会けんぽ）
// @source 全国健康保険協会「令和5年度保険料率」
// @url    https://www.kyoukaikenpo.or.jp/g7/cat330/sb3150/r5/r5ryougakuhyou3gatukara/
// @year   2023年3月〜
// @note   東京都の料率を使用。都道府県で若干異なる。
//         介護保険料率は全国一律（2号被保険者：40〜64歳）
// ─────────────────────────────────────────────────────────────
export const STAT_HEALTH_INSURANCE_RATE = {
  // 従業員負担分（事業主と折半）
  employee:           0.0500,  // 健康保険（東京都）：10.00%の折半
  employerMatch:      0.0500,  // 事業主負担分（同額）
  careInsurance:      0.00916, // 介護保険（40〜64歳・従業員負担）1.82%の折半
  careInsuranceTotal: 0.01820, // 介護保険 合計料率

  // 国民健康保険（自営業・非正規等）
  // @note 市町村により異なるため全国平均で近似
  selfEmployedRate:       0.0983, // 所得割（全国平均）
  selfEmployedFlatFeeAnnual: 29_000, // 均等割（年額・全国平均）

  // 後期高齢者医療保険（75歳以上）
  elderlyRate:        0.0931, // 全国平均 所得割（2023〜2024年度）
  elderlyFlatFeeAnnual: 47_000, // 均等割（年額・全国平均）
};

// ─────────────────────────────────────────────────────────────
// 厚生年金保険料率
// @source 厚生年金保険法 第81条
// @year   2017年9月以降（固定）
// ─────────────────────────────────────────────────────────────
export const STAT_PENSION_INSURANCE_RATE = {
  // 厚生年金（正規雇用・会社員）
  employee:      0.0915, // 従業員負担 9.15%（18.30%の折半）
  employerMatch: 0.0915, // 事業主負担分

  // 標準報酬月額の上下限（2023年）
  monthlyWageFloor:   88_000, // 下限（1等級）
  monthlyWageCeiling: 650_000, // 上限（32等級）

  // 国民年金（自営業・非正規・学生等）
  nationalPensionMonthly: 16_520, // 月額定額（2023年度）
  // 免除申請可能な所得上限
  nationalPensionExemptIncome: 780_000,
};

// ─────────────────────────────────────────────────────────────
// 雇用保険料率
// @source 雇用保険法 第68条・厚生労働省「令和5年度雇用保険料率」
// @year   2023年4月〜（令和5年度）
// ─────────────────────────────────────────────────────────────
export const STAT_EMPLOYMENT_INSURANCE_RATE = {
  // 一般事業（従業員負担）
  general:      0.0060, // 6/1000
  // 農林水産・清酒製造・建設業（従業員負担）
  construction: 0.0070, // 7/1000
  // @note 非正規労働者も週20時間以上・31日以上の雇用見込みで加入対象
};
