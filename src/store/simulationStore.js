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
import { validateAgents } from '../engine/calibration.js';

const MAX_HISTORY = 40;

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
  agents:             [],
  households:         [],
  macroHistory:       [],
  taxPolicy:          initialTaxPolicy,
  isRunning:          false,
  calibrationResults: null,

  initSimulation: (count = 1000) => {
    const { agents, households } = generateSimulation(count, get().taxPolicy);
    const macro = runTurn(agents, households, get().taxPolicy);

    // 税計算後にキャリブレーション実行
    const calibrationResults = validateAgents(agents, households);

    set({
      agents,
      households,
      macroHistory:       [macro],
      calibrationResults,
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

  runCalibration: () => {
    const { agents, households } = get();
    if (agents.length === 0) return;
    const calibrationResults = validateAgents(agents, households);
    set({ calibrationResults });
  },

  updateTaxPolicy: (patch) => {
    set(s => ({ taxPolicy: { ...s.taxPolicy, ...patch } }));
  },

  resetPolicy: () => {
    set({ taxPolicy: initialTaxPolicy });
  },
}));
