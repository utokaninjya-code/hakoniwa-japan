/**
 * eitc.est.js
 * 給付付き税額控除（EITC）のモデルパラメータ
 *
 * @note 日本には現時点でEITCは存在しない（2024年現在）。
 *       これらのパラメータは「導入した場合の試算」であり、
 *       米国EITC・英国WTC・各種研究の推計値を参考に設定した推定値。
 *       政策カードで enabled: true になった場合に使用する。
 *
 * @derivation_basis
 *   - 米国EITC 2023年パラメータ（IRS Publication 596）
 *   - 内閣府「給付付き税額控除に関する研究会報告書」
 *   - 森信茂樹「給付付き税額控除」（2008年）の日本向け試算
 *   これらを日本の所得水準・税制に合わせてスケール調整。
 */

// ─────────────────────────────────────────────────────────────
// EITC 有効フラグ（デフォルト無効 = 現実の日本を反映）
// ─────────────────────────────────────────────────────────────
export const EST_EITC_DEFAULT_ENABLED = false;

// ─────────────────────────────────────────────────────────────
// 世帯タイプ別 EITC パラメータ
// @derivation
//   日本の平均賃金・所得分布（STAT_INCOME_BRACKET_DIST）に
//   合わせて米国EITCのパラメータを比例スケール調整。
//   米国の所得水準（中央値約5万ドル）と日本（約370万円）の比率を適用。
// @status  推計値。政策効果の大まかな試算に適する。
//          実際の制度設計には精緻な試算が必要。
// ─────────────────────────────────────────────────────────────
export const EST_EITC_PARAMS = {
  // 子なし単身・子なし夫婦
  noChild: {
    phaseInRate:       0.075,    // 逓増率（所得 × この率 = クレジット）
    maxCredit:        68_000,    // 最大クレジット額（年額・円）
    plateauIncomeEnd: 900_000,   // 最大値維持の上限所得
    phaseOutStart:    900_000,   // 逓減開始所得
    phaseOutRate:      0.075,    // 逓減率
    phaseOutEnd:    1_800_000,   // クレジット消失所得
  },
  // 子1人世帯
  oneChild: {
    phaseInRate:       0.340,
    maxCredit:       330_000,
    plateauIncomeEnd:1_000_000,
    phaseOutStart:   1_800_000,
    phaseOutRate:      0.160,
    phaseOutEnd:     3_860_000,
  },
  // 子2人以上世帯
  multipleChildren: {
    phaseInRate:       0.400,
    maxCredit:       374_000,
    plateauIncomeEnd:1_000_000,
    phaseOutStart:   1_800_000,
    phaseOutRate:      0.211,
    phaseOutEnd:     3_770_000,
  },
};
// @implementation_note
//   クレジット計算式:
//   if income <= phaseOutStart:
//     credit = min(income * phaseInRate, maxCredit)
//   else:
//     credit = max(0, maxCredit - (income - phaseOutStart) * phaseOutRate)
//   
//   所得税からの控除：
//   if incomeTax >= credit:
//     incomeTaxAfterCredit = incomeTax - credit
//     eitcCashBenefit = 0
//   else:
//     incomeTaxAfterCredit = 0
//     eitcCashBenefit = credit - incomeTax  ← 現金給付部分
