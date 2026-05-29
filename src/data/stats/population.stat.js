/**
 * population.stat.js
 * 人口・年齢・性別・地域分布に関する統計値
 *
 * ルール：このファイルには統計調査からの直接引用値のみ記載する。
 *         加工・推定が入る値は estimated/ に置くこと。
 *         値を変更する場合は @source の調査を確認すること。
 */

// ─────────────────────────────────────────────────────────────
// 年齢3区分 人口構成比
// @source 総務省統計局「人口推計」2023年10月1日現在
// @url    https://www.stat.go.jp/data/jinsui/2023np/index.html
// ─────────────────────────────────────────────────────────────
export const STAT_AGE_GROUP_DISTRIBUTION = [
  { group: 'young',   ageMin:  0, ageMax: 14, ratio: 0.114 }, // 年少人口
  { group: 'working', ageMin: 15, ageMax: 64, ratio: 0.595 }, // 生産年齢人口
  { group: 'elderly', ageMin: 65, ageMax: 99, ratio: 0.291 }, // 老年人口
];

// ─────────────────────────────────────────────────────────────
// 5歳階級別 人口構成比（生産年齢の内訳に使用）
// @source 同上
// ─────────────────────────────────────────────────────────────
export const STAT_AGE_5YEAR_DISTRIBUTION = [
  { ageMin:  0, ageMax:  4, ratio: 0.038 },
  { ageMin:  5, ageMax:  9, ratio: 0.040 },
  { ageMin: 10, ageMax: 14, ratio: 0.041 },
  { ageMin: 15, ageMax: 19, ratio: 0.044 },
  { ageMin: 20, ageMax: 24, ratio: 0.051 },
  { ageMin: 25, ageMax: 29, ratio: 0.053 },
  { ageMin: 30, ageMax: 34, ratio: 0.055 },
  { ageMin: 35, ageMax: 39, ratio: 0.060 },
  { ageMin: 40, ageMax: 44, ratio: 0.073 },
  { ageMin: 45, ageMax: 49, ratio: 0.078 },
  { ageMin: 50, ageMax: 54, ratio: 0.074 },
  { ageMin: 55, ageMax: 59, ratio: 0.063 },
  { ageMin: 60, ageMax: 64, ratio: 0.064 },
  { ageMin: 65, ageMax: 69, ratio: 0.067 },
  { ageMin: 70, ageMax: 74, ratio: 0.073 },
  { ageMin: 75, ageMax: 79, ratio: 0.059 },
  { ageMin: 80, ageMax: 84, ratio: 0.044 },
  { ageMin: 85, ageMax: 99, ratio: 0.042 },
];

// ─────────────────────────────────────────────────────────────
// 性別構成比
// @source 同上（2023年10月1日現在）
// ─────────────────────────────────────────────────────────────
export const STAT_SEX_RATIO = {
  male:   0.486,
  female: 0.514,
};

// ─────────────────────────────────────────────────────────────
// 地域別人口構成比（都市雇用圏分類）
// @source 総務省「国勢調査」2020年
// @url    https://www.stat.go.jp/data/kokusei/2020/index.html
// @note   三大都市圏 = 東京圏(35%)+大阪圏(11%)+名古屋圏(6%)
// ─────────────────────────────────────────────────────────────
export const STAT_REGION_DISTRIBUTION = [
  { region: 'urban',    label: '三大都市圏',       ratio: 0.520 },
  { region: 'suburban', label: '地方都市（政令市・中核市）', ratio: 0.280 },
  { region: 'rural',    label: '農村・過疎地域',    ratio: 0.200 },
];

// ─────────────────────────────────────────────────────────────
// 平均寿命（0歳時平均余命）
// @source 厚生労働省「令和4年簡易生命表」2022年
// @url    https://www.mhlw.go.jp/toukei/saikin/hw/life/life22/index.html
// ─────────────────────────────────────────────────────────────
export const STAT_LIFE_EXPECTANCY = {
  male:   81.05,
  female: 87.09,
};

// ─────────────────────────────────────────────────────────────
// 合計特殊出生率
// @source 厚生労働省「令和4年人口動態統計」2022年
// @url    https://www.mhlw.go.jp/toukei/saikin/hw/jinkou/kakutei22/index.html
// ─────────────────────────────────────────────────────────────
export const STAT_TOTAL_FERTILITY_RATE = 1.26; // 2022年確定値
