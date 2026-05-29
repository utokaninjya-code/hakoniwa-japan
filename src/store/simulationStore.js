/**
 * src/store/simulationStore.js
 * Zustand store — シミュレーション状態管理
 */

import { create } from 'zustand';
import {
  STAT_INCOME_TAX_BRACKETS,
  STAT_PERSONAL_DEDUCTIONS,
  STAT_CONSUMPTION_TAX,
  EST_EITC_PARAMS,
} from '../data/index.js';
import { generateSimulation } from '../engine/agentFactory.js';
import { runTurn } from '../engine/simulationEngine.js';

const MAX_HISTORY = 40; // 最大40ターン（20年分）

const initialTaxPolicy = {
  incomeTaxBrackets:          [...STAT_INCOME_TAX_BRACKETS],
  basicDeduction:             STAT_PERSONAL_DEDUCTIONS.basicDeduction,
  spouseDeduction:            STAT_PERSONAL_DEDUCTIONS.spouseDeduction,
  spouseIncomeLimit:          STAT_PERSONAL_DEDUCTIONS.spouseIncomeLimit,
  consumptionTaxStandardRate: STAT_CONSUMPTION_TAX.standardRate,
  consumptionTaxReducedRate:  STAT_CONSUMPTION_TAX.reducedRate,
  welfareBarrierReduction: {
    kinship_inquiry:     0,
    info_gap:            0,
    application_barrier: 0,
    stigma:              0,
  },
  eitc: { enabled: false, ...EST_EITC_PARAMS },
};

export const useSimulationStore = create((set, get) => ({
  agents:       [],
  households:   [],
  macroHistory: [],
  taxPolicy:    initialTaxPolicy,
  isRunning:    false,

  initSimulation: (count = 1000) => {
    const { agents, households } = generateSimulation(count, get().taxPolicy);
    const macro = runTurn(agents, households, get().taxPolicy);
    set({
      agents,
      households,
      macroHistory: [macro],
    });
  },

  advanceTurn: () => {
    const { agents, households, taxPolicy, macroHistory } = get();
    if (agents.length === 0) return;
    const prevMacro = macroHistory[macroHistory.length - 1] ?? null;
    const macro = runTurn(agents, households, taxPolicy, prevMacro);
    set({
      agents:       [...agents],
      households:   [...households],
      macroHistory: [...macroHistory.slice(-MAX_HISTORY + 1), macro],
    });
  },

  updateTaxPolicy: (patch) => {
    set(s => ({ taxPolicy: { ...s.taxPolicy, ...patch } }));
  },

  resetPolicy: () => {
    set({ taxPolicy: initialTaxPolicy });
  },
}));
