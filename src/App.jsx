import React, { useEffect } from 'react';
import { useSimulationStore } from './store/simulationStore.js';

export default function App() {
  const { initSimulation, advanceTurn, macroHistory, agents, households } = useSimulationStore();

  useEffect(() => {
    initSimulation(1000);
  }, []);

  const latest = macroHistory[macroHistory.length - 1];

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-3xl font-bold mb-6">箱庭ニッポン</h1>

      {latest ? (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <Stat label="ターン" value={latest.turn} />
          <Stat label="失業率" value={`${(latest.unemploymentRate * 100).toFixed(1)}%`} />
          <Stat label="ジニ係数" value={latest.giniCoefficient.toFixed(3)} />
          <Stat label="生活保護捕捉率" value={`${(latest.welfareCoverageRate * 100).toFixed(1)}%`} />
          <Stat label="平均可処分所得" value={`${Math.round(latest.meanDisposableIncome / 10000)}万円`} />
          <Stat label="平均幸福度" value={latest.meanHappiness.toFixed(1)} />
          <Stat label="就業者数" value={`${latest.employedCount}人`} />
          <Stat label="エージェント総数" value={`${latest.totalAgents}人`} />
        </div>
      ) : (
        <p className="text-gray-400">シミュレーション初期化中...</p>
      )}

      <button
        onClick={advanceTurn}
        className="bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-lg font-semibold"
      >
        ターン進行（+6ヶ月）
      </button>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="text-gray-400 text-sm">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}
