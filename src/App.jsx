import React, { useEffect } from 'react';
import { useSimulationStore } from './store/simulationStore.js';

export default function App() {
  const {
    initSimulation,
    advanceTurn,
    runCalibration,
    macroHistory,
    calibrationResults,
  } = useSimulationStore();

  useEffect(() => { initSimulation(1000); }, []);

  const latest = macroHistory[macroHistory.length - 1];

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-3xl font-bold mb-6">箱庭ニッポン</h1>

      {/* マクロ指標 */}
      {latest ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Stat label="ターン"         value={latest.turn} />
          <Stat label="失業率"         value={`${(latest.unemploymentRate * 100).toFixed(1)}%`} />
          <Stat label="ジニ係数"       value={latest.giniCoefficient.toFixed(3)} />
          <Stat label="捕捉率"         value={`${(latest.welfareCoverageRate * 100).toFixed(1)}%`} />
          <Stat label="平均可処分所得" value={`${Math.round(latest.meanDisposableIncome / 10000)}万円`} />
          <Stat label="平均幸福度"     value={latest.meanHappiness.toFixed(1)} />
          <Stat label="就業者数"           value={`${latest.employedCount}人`} />
          <Stat label="エージェント数"     value={`${latest.totalAgents}人`} />
          <Stat label="就業者平均可処分所得" value={`${Math.round((latest.meanDisposableIncomeEmployed ?? 0) / 10000)}万円`} />
        </div>
      ) : (
        <p className="text-gray-400 mb-6">初期化中...</p>
      )}

      {/* 操作ボタン */}
      <div className="flex gap-4 mb-8">
        <button
          onClick={advanceTurn}
          className="bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-lg font-semibold"
        >
          ターン進行（+6ヶ月）
        </button>
        <button
          onClick={runCalibration}
          className="bg-gray-600 hover:bg-gray-500 px-6 py-3 rounded-lg font-semibold"
        >
          キャリブレーション再実行
        </button>
      </div>

      {/* キャリブレーション結果 */}
      {calibrationResults && (
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-bold mb-4">キャリブレーション結果</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-700">
                <th className="text-left py-2 pr-4">指標</th>
                <th className="text-right py-2 px-4">実測値</th>
                <th className="text-right py-2 px-4">目標値</th>
                <th className="text-right py-2">乖離</th>
              </tr>
            </thead>
            <tbody>
              {calibrationResults.results.map(r => (
                <tr key={r.metric} className="border-b border-gray-700">
                  <td className="py-2 pr-4">{r.metric}</td>
                  <td className="text-right py-2 px-4 font-mono">
                    {formatCalibValue(r.metric, r.value)}
                  </td>
                  <td className="text-right py-2 px-4 font-mono text-gray-400">
                    {formatCalibValue(r.metric, r.target)}
                  </td>
                  <td className="text-right py-2 font-mono text-gray-300">
                    {(r.deviation * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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

function formatCalibValue(metric, value) {
  if (metric.includes('係数') || metric.includes('率')) {
    return value.toFixed(4);
  }
  if (metric.includes('年収') || metric.includes('所得')) {
    return `${Math.round(value / 10000)}万円`;
  }
  return value.toFixed(4);
}
