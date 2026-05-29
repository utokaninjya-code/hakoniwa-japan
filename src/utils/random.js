/**
 * src/utils/random.js
 * シミュレーション全体で使うランダムサンプリングユーティリティ
 */

// Box-Muller 法による正規分布サンプリング
export function gaussianRandom(mean = 0, stdDev = 1) {
  let u, v;
  do { u = Math.random(); } while (u === 0);
  do { v = Math.random(); } while (v === 0);
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return mean + stdDev * z;
}

// 重み付きサンプリング: dist = [{ value, weight }, ...]
export function weightedSample(dist) {
  const total = dist.reduce((s, d) => s + d.weight, 0);
  let r = Math.random() * total;
  for (const d of dist) {
    r -= d.weight;
    if (r <= 0) return d.value;
  }
  return dist[dist.length - 1].value;
}

// 分布配列からサンプリング: dist = [{ ratio, ...その他 }, ...]  ratio合計=1.0
export function sampleFromDistribution(dist) {
  let r = Math.random();
  for (const d of dist) {
    r -= d.ratio;
    if (r <= 0) return d;
  }
  return dist[dist.length - 1];
}

// 範囲クランプ
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// min〜max の整数ランダム（両端含む）
export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ログ正規サンプリング: median × exp(gauss(0, sigma))
export function lognormalSample(median, sigma) {
  return median * Math.exp(gaussianRandom(0, sigma));
}
