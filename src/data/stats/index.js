/**
 * src/data/stats/index.js
 * 統計値（STAT_*）の一括エクスポート
 *
 * 外部からは import { STAT_XXX } from '../data/stats' でアクセスする。
 * このファイルは re-export のみ。計算・加工を書かないこと。
 */

export * from './population.stat.js';
export * from './household.stat.js';
export * from './employment.stat.js';
export * from './income.stat.js';
export * from './behavior.stat.js';
export * from './tax.stat.js';

// ─────────────────────────────────────────────────────────────
// データビンテージ一覧
// 各統計ファイルのデータ年次・出典・更新優先度を管理する。
// 統計値を更新したときは必ずここも更新すること。
//
// priority:
//   'high' … 毎年更新推奨（賃金・所得・行動系。年次差が結果に影響しやすい）
//   'low'  … 5年ごと更新（国勢調査系。構造変化が緩やか）
//   'fixed'… 法令値。制度改正があった場合のみ更新。
// ─────────────────────────────────────────────────────────────
export const DATA_VINTAGE = {
  population: {
    year:     2023,
    source:   '総務省統計局 人口推計',
    url:      'https://www.stat.go.jp/data/jinsui/',
    priority: 'low',
    note:     '人口推計は毎月公表。年次確定値（10月1日現在）を使用。',
  },
  household: {
    year:     2020,
    source:   '総務省 国勢調査',
    url:      'https://www.stat.go.jp/data/kokusei/2020/',
    priority: 'low',
    note:     '次回更新は2025年国勢調査の確定値公表後（2026〜2027年予定）。'
            + '住宅・土地統計調査（2018年）も含むため実質的にはやや古い。',
  },
  employment: {
    year:     2023,
    source:   '総務省 労働力調査（年平均）',
    url:      'https://www.stat.go.jp/data/roudou/sokuhou/nen/ft/',
    priority: 'high',
    note:     '毎年1月頃に前年の年平均値が確定公表される。',
  },
  income: {
    year:     2022,
    source:   '国税庁 民間給与実態統計調査',
    url:      'https://www.nta.go.jp/publication/statistics/kokuzeicho/minkan2022/minkan.htm',
    priority: 'high',
    note:     '2023年分（令和5年分）は2024年秋公表済み。更新を検討すること。',
  },
  wages: {
    year:     2023,
    source:   '厚生労働省 賃金構造基本統計調査',
    url:      'https://www.mhlw.go.jp/toukei/itiran/roudou/chingin/kouzou/z2023/',
    priority: 'high',
    note:     '2024年分・2025年分が順次公表済み。産業別月収・男女格差は更新推奨。',
  },
  behavior: {
    year:     2022,
    source:   '総務省 家計調査年報',
    url:      'https://www.stat.go.jp/data/kakei/2022np/',
    priority: 'high',
    note:     '貯蓄率・消費性向・エンゲル係数を含む。毎年5月頃に前年値が公表。',
  },
  tax: {
    year:     2023,
    source:   '所得税法・地方税法・各社会保険法および政令',
    url:      'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/shoto320.htm',
    priority: 'fixed',
    note:     '2024年の定額減税（所得税3万円・住民税1万円）は一時的措置のため未反映。'
            + '恒久的制度改正（基礎控除引き上げ議論等）があれば要更新。',
  },
};
