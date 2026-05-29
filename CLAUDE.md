# 箱庭ニッポン — Claude Code コンテキストドキュメント

このファイルはプロジェクト全体のコンテキストを記載する。
実装を始める前に必ずこのファイルを読むこと。

---

## プロジェクト概要

**箱庭ニッポン** は、実際の日本統計を初期値とする1000人の仮想エージェントが
生活する「日本の箱庭」で、プレイヤーが経済・産業政策を操作し、
GDP・失業率・格差・幸福度などのマクロ指標の変化を観察する
政策実験シミュレーター。

参考：Democracy 4（ゲーム）に近いコンセプト。

---

## 技術スタック

```
Vite + React 18
├── 状態管理：Zustand
├── グラフ：Recharts
├── スタイル：Tailwind CSS
└── デプロイ：GitHub Actions → GitHub Pages（静的サイト・バックエンドなし）
```

GitHub Pages 対応のため、**すべての処理はブラウザ内で完結させる**こと。
外部APIへの直接 fetch は行わない。

---

## ディレクトリ構成

```
src/
├── data/                        # ✅ 作成済み
│   ├── stats/                   # STAT_*：統計調査からの直接引用値
│   │   ├── population.stat.js
│   │   ├── household.stat.js
│   │   ├── employment.stat.js
│   │   ├── income.stat.js
│   │   ├── behavior.stat.js     # 捕捉率統計（STAT_WELFARE_TAKEUP_RATE等）含む
│   │   ├── tax.stat.js          # 法令値（税率・控除額・社保料率）
│   │   └── index.js             # DATA_VINTAGE 含む
│   ├── estimated/               # EST_*：推計・モデルパラメータ
│   │   ├── income.est.js
│   │   ├── behavior.est.js
│   │   ├── social.est.js
│   │   ├── eitc.est.js
│   │   └── index.js
│   └── index.js                 # 全データの一括 re-export
│
├── engine/                      # 🔧 実装対象
│   ├── agentFactory.js          # 世帯・エージェントの生成
│   ├── taxCalculator.js         # 税・社保・EITC の計算
│   ├── simulationEngine.js      # ターン進行ロジック
│   ├── policyEffects.js         # 政策 → エージェント属性への波及
│   ├── macroAggregator.js       # エージェント集計 → マクロ指標
│   └── calibration.js           # 生成後の検証
│
├── store/
│   └── simulationStore.js       # Zustand store
│
└── components/
    ├── Dashboard/
    ├── PolicyPanel/
    ├── AgentView/
    └── TurnControl/
```

---

## 最重要コーディング規約

### 1. 定数の直書き禁止

エンジン・コンポーネントに数値を直書きしないこと。
必ず `src/data/` からインポートする。

```javascript
// ❌ 禁止
const genderFactor = gender === 'F' ? 0.73 : 1.0;

// ✅ 正しい
import { STAT_GENDER_WAGE_RATIO } from '../data';
const genderFactor = gender === 'F' ? STAT_GENDER_WAGE_RATIO : 1.0;
```

### 2. 命名規則の厳守

| プレフィックス | 意味 | 置き場所 |
|---|---|---|
| `STAT_` | 統計調査からの直接引用 | `src/data/stats/` |
| `EST_` | 推計・モデルパラメータ | `src/data/estimated/` |
| （プレフィックスなし） | 関数・変数 | `src/engine/` |

### 3. エンティティの構造

エージェントは **世帯（Household）** と **個人（Agent）** の二層構造。
個人は `householdId` で世帯に紐づく。

```
世帯を先に生成 → 個人を生成して世帯に紐づける → 税計算 → 消費行動
```

### 4. 給付の「資格」と「受給」を必ず分離する

```javascript
// 生活保護の例
household.welfareEligible    // 収入テスト → 資格あり/なし（CALC）
household.receivingWelfare   // 資格 × 捕捉率 → 実受給（確率的）
household.welfareNonReceiptReason  // 未受給理由（stigma / kinship_inquiry / info_gap / application_barrier）
```

捕捉率は `STAT_WELFARE_TAKEUP_RATE.overall`（0.25）を使う。

---

## エージェントのデータ構造（型定義の参考）

### Household

```javascript
{
  id: string,                    // 'hh-0001'
  type: HouseholdType,           // 'single' | 'couple' | 'couple_with_child'
                                 //   | 'single_parent' | 'three_generation' | 'other'
  memberIds: string[],           // Agent の id 配列
  region: Region,                // 'urban' | 'suburban' | 'rural'

  // 住居
  housingType: HousingType,      // 'own' | 'rent' | 'public' | 'family'
  housingCostMonthly: number,    // 円/月
  mortgageRemaining: number,     // 円（持ち家以外は 0）

  // 集計値（毎ターン個人から自動計算）
  combinedIncome: number,
  combinedSavings: number,
  dependentCount: number,

  // 給付資格（収入テストで毎ターン更新）
  welfareEligible: boolean,
  childBenefitEligible: boolean,
  carerAllowanceEligible: boolean,

  // 実受給（資格 × 捕捉率）
  receivingWelfare: boolean,
  receivingChildBenefit: boolean,
  receivingCarerAllowance: boolean,

  // 未受給理由
  welfareNonReceiptReason: null | 'stigma' | 'kinship_inquiry' | 'info_gap' | 'application_barrier',
}
```

### Agent

```javascript
{
  // ── 不変属性 ──
  id: string,
  householdId: string,
  birthYear: number,
  gender: 'M' | 'F',
  region: Region,
  education: Education,          // 'middle_school' | 'high_school' | 'vocational'
                                 //   | 'university' | 'graduate'
  baseLifeExpectancy: number,

  // ── 気質属性（生成時に確定・変化なし） ──
  baseMPC: number,               // 0.35〜0.98
  riskTolerance: 'low' | 'medium' | 'high',
  publicServiceReliance: number, // 0〜1

  // ── 動的属性：就業 ──
  employmentStatus: EmploymentStatus,
  employmentType: EmploymentType,
  industry: Industry,
  occupationLevel: 'entry' | 'mid' | 'senior' | 'executive',
  turnsInCurrentJob: number,

  // ── 動的属性：所得・資産 ──
  annualIncome: number,
  savings: number,
  debtBalance: number,

  // ── 動的属性：税計算結果（TaxCalculator が毎ターン更新） ──
  employmentIncomeDeduction: number,
  totalDeductions: number,
  taxableIncome: number,
  incomeTaxAnnual: number,
  incomeTaxAfterCredit: number,
  municipalTax: number,
  healthInsurancePremium: number,
  pensionPremium: number,
  employmentInsurancePremium: number,
  careInsurancePremium: number,
  eitcTaxCreditAmount: number,
  eitcCashBenefitAmount: number,
  effectiveConsumptionTaxRate: number,
  consumptionTaxBurdenAnnual: number,
  disposableIncome: number,
  totalTaxBurden: number,
  effectiveTotalBurdenRate: number,
  netBenefitFromGov: number,

  // ── 動的属性：消費 ──
  semiannualConsumption: number,
  consumptionBasketFoodRatio: number,

  // ── 動的属性：社会 ──
  health: number,                // 0〜100
  happiness: number,             // 0〜100
  govTrust: number,              // 0〜100

  // ── ライフイベントフラグ ──
  isJobSeeking: boolean,
  isOnParentalLeave: boolean,

  // ── エンジン内部 ──
  policyEffectQueue: PolicyEffect[],
}
```

---

## ターン進行の処理順

1ターン = 6ヶ月（通常国会・臨時国会に対応）

```
① 税・社会保険計算（TaxCalculator）
   → 全エージェントの disposableIncome を確定
   → 世帯収入テスト → 給付 Eligible フラグ更新
   → 捕捉率適用 → 実受給フラグ更新

② エージェント行動
   → 消費・貯蓄の決定
   → 求職・転職行動
   → 出産・死亡・加齢

③ 企業・産業フェーズ
   → 雇用調整
   → 設備投資決定

④ 政府フェーズ
   → 税収集計（所得税・住民税・社保・消費税）
   → 政府支出の執行
   → 国債発行調整

⑤ マクロ指標集計（MacroAggregator）
   → GDP・失業率・CPI・ジニ係数・財政収支

⑥ 統計・グラフ更新
```

---

## TaxCalculator の計算順（詳細）

各エージェントに対して以下の順で実行：

```
1. 給与所得控除（STAT_EMPLOYMENT_INCOME_DEDUCTION_BRACKETS）
2. 課税所得 = 年収 - 給与所得控除 - 基礎控除 - 配偶者控除 - 扶養控除 - 社保料
3. 所得税（STAT_INCOME_TAX_BRACKETS の速算表）
4. EITC（TaxPolicy.eitc.enabled 時のみ・EST_EITC_PARAMS）
5. 住民税（STAT_MUNICIPAL_TAX）
6. 社会保険料（雇用形態で分岐・STAT_HEALTH_INSURANCE_RATE 等）
7. 可処分所得の確定
8. 消費税負担（consumptionBasketFoodRatio × STAT_CONSUMPTION_TAX）
```

---

## 政策エンジン（TaxPolicy オブジェクト）

プレイヤーが変更できるレバー。初期値はすべて `tax.stat.js` の法令値を参照。

```javascript
// store/simulationStore.js で管理
const taxPolicy = {
  incomeTaxBrackets:          [...STAT_INCOME_TAX_BRACKETS],   // 変更可
  basicDeduction:             STAT_PERSONAL_DEDUCTIONS.basicDeduction,
  spouseDeduction:            STAT_PERSONAL_DEDUCTIONS.spouseDeduction,
  spouseIncomeLimit:          STAT_PERSONAL_DEDUCTIONS.spouseIncomeLimit,
  consumptionTaxStandardRate: STAT_CONSUMPTION_TAX.standardRate,
  consumptionTaxReducedRate:  STAT_CONSUMPTION_TAX.reducedRate,
  // 捕捉率改善ポリシー（初期値：現状維持）
  welfareBarrierReduction: {
    kinship_inquiry:      0.0,  // 0〜1（1.0で完全廃止）
    info_gap:             0.0,
    application_barrier:  0.0,
    stigma:               0.0,
  },
  eitc: { enabled: false, ...EST_EITC_PARAMS },
}
```

---

## キャリブレーション目標値

`calibration.js` で生成後に以下を検証すること：

| 指標 | 目標値 | 許容誤差 |
|---|---|---|
| 正規雇用率 | 62.2% | ±3% |
| 正規平均年収 | 458万円 | ±5% |
| 非正規平均年収 | 198万円 | ±5% |
| 高齢者率（65歳以上） | 29.1% | ±2% |
| 失業率 | 2.6% | ±1% |
| 生活保護捕捉率 | 25% | ±5% |
| ジニ係数（税引後） | 0.38 | ±0.03 |

---

## Phase 1 の実装タスク（最初にやること）

優先順位順：

1. **`src/engine/agentFactory.js`**
   - `generateHouseholds(count)` — 世帯生成
   - `generateAgents(households)` — 個人生成（STAT_* + EST_* を使用）
   - 捕捉率ロジック（`welfareEligible` / `receivingWelfare` / `welfareNonReceiptReason`）

2. **`src/engine/taxCalculator.js`**
   - `calculateTax(agent, household, taxPolicy)` — 上記8ステップを実装

3. **`src/engine/macroAggregator.js`**
   - `aggregateMacro(agents, households, govPolicy)` — マクロ指標の集計

4. **`src/store/simulationStore.js`**
   - Zustand store（agents / households / taxPolicy / macroHistory）

5. **`src/engine/calibration.js`**
   - `validateAgents(agents, households)` — キャリブレーション検証

---

## 注意事項

- `agentFactory.js` でランダムサンプリングに使うユーティリティ関数
  （`sampleFromDistribution`, `gaussianRandom`, `clamp` 等）は
  `src/utils/random.js` に切り出すこと。
- 年収0円（学生・無職・退職者）エージェントへの除算は必ず0チェックをすること。
- 子どもの年齢計算で負値が出ないよう `Math.max(0, ...)` を必ず使うこと。
- 目標人数（デフォルト1000人）ちょうどに揃えるため、世帯生成は
  「合計 memberIds 数が目標に達したら打ち切る」方式にすること。
