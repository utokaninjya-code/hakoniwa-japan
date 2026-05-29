/**
 * income.stat.js
 * 所得分布・平均年収・賃金格差に関する統計値
 */

// ─────────────────────────────────────────────────────────────
// 所得階層別構成比
// @source 国税庁「民間給与実態統計調査」2022年（令和4年分）
// @url    https://www.nta.go.jp/publication/statistics/kokuzeicho/minkan2022/minkan.htm
// @note   給与所得者のみ（自営業者・無収入者は含まない）
// ─────────────────────────────────────────────────────────────
export const STAT_INCOME_BRACKET_DIST = [
  { incomeMin:         0, incomeMax:  1_000_000, ratio: 0.097 },
  { incomeMin: 1_000_000, incomeMax:  2_000_000, ratio: 0.133 },
  { incomeMin: 2_000_000, incomeMax:  3_000_000, ratio: 0.157 },
  { incomeMin: 3_000_000, incomeMax:  4_000_000, ratio: 0.170 },
  { incomeMin: 4_000_000, incomeMax:  5_000_000, ratio: 0.132 },
  { incomeMin: 5_000_000, incomeMax:  6_000_000, ratio: 0.090 },
  { incomeMin: 6_000_000, incomeMax:  7_000_000, ratio: 0.062 },
  { incomeMin: 7_000_000, incomeMax:  8_000_000, ratio: 0.043 },
  { incomeMin: 8_000_000, incomeMax: 10_000_000, ratio: 0.052 },
  { incomeMin:10_000_000, incomeMax:  Infinity,  ratio: 0.064 },
];

// ─────────────────────────────────────────────────────────────
// 雇用形態別 平均年収
// @source 同上（2022年）
// ─────────────────────────────────────────────────────────────
export const STAT_INCOME_BY_EMPLOYMENT_TYPE = {
  regular:    4_580_000, // 正規雇用者 平均年収
  nonregular: 1_980_000, // 非正規雇用者 平均年収
  overall:    4_580_000, // 給与所得者全体 平均年収（役員含まず）
};

// ─────────────────────────────────────────────────────────────
// 男女間賃金格差（女性の平均年収 ÷ 男性の平均年収）
// @source 厚生労働省「賃金構造基本統計調査」2023年
// @url    https://www.mhlw.go.jp/toukei/itiran/roudou/chingin/kouzou/z2023/index.html
// ─────────────────────────────────────────────────────────────
export const STAT_GENDER_WAGE_RATIO = 0.726; // 女性は男性の72.6%

// ─────────────────────────────────────────────────────────────
// 産業別 月間現金給与額（所定内給与）
// @source 厚生労働省「賃金構造基本統計調査」2023年（産業別・規模計・男女計）
// @url    https://www.mhlw.go.jp/toukei/itiran/roudou/chingin/kouzou/z2023/index.html
// @note   月額×12で年収換算。賞与は別途加算（産業平均の賞与月数で換算）
//         シミュレーターでは年収として扱うため×15.0ヶ月相当として格納
//         （所定内12ヶ月 + 賞与平均3.0ヶ月）
// ─────────────────────────────────────────────────────────────
export const STAT_MONTHLY_WAGE_BY_INDUSTRY = {
  // 単位：円/月（所定内給与額）
  agriculture:   213_500,
  manufacturing: 316_700,
  construction:  333_400,
  retail:        259_300,
  healthcare:    295_900,
  it:            407_200,
  finance:       400_100,
  education:     312_400,
  hospitality:   231_800,
  publicservice: 352_800,
  other:         286_500,
};

// 産業別 賞与月数（年間）の目安
// @source 厚生労働省「毎月勤労統計調査」2022年（特別給与÷月間現金給与）
export const STAT_BONUS_MONTHS_BY_INDUSTRY = {
  agriculture:    0.5,
  manufacturing:  3.2,
  construction:   2.8,
  retail:         1.8,
  healthcare:     2.0,
  it:             3.5,
  finance:        4.0,
  education:      2.5,
  hospitality:    1.2,
  publicservice:  3.2,
  other:          2.0,
};

// ─────────────────────────────────────────────────────────────
// 年齢階級別 平均年収（男性正規・全産業）
// @source 厚生労働省「賃金構造基本統計調査」2023年（年齢階級別）
// @note   40-44歳を基準(1.0)とした相対値は estimated/income.est.js に格納
// ─────────────────────────────────────────────────────────────
export const STAT_ANNUAL_INCOME_BY_AGE_MALE_REGULAR = {
  // 単位：万円/年（所定内給与×12 + 賞与）
  20: 264,
  25: 321,
  30: 393,
  35: 454,
  40: 514,
  45: 544,
  50: 564,
  55: 567,
  60: 482, // 再雇用・定年後の低下
  65: 368,
  70: 307,
};

// ─────────────────────────────────────────────────────────────
// 所得ジニ係数（当初所得・再分配後）
// @source 厚生労働省「所得再分配調査」2020年（令和2年）
// @url    https://www.mhlw.go.jp/toukei/list/96-1.html
// ─────────────────────────────────────────────────────────────
export const STAT_GINI_COEFFICIENT = {
  before_redistribution: 0.570, // 当初所得ジニ係数
  after_redistribution:  0.381, // 再分配後所得ジニ係数
};
