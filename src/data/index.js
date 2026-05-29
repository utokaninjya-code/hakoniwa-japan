/**
 * src/data/index.js
 * データ層の一括エクスポート（トップレベル）
 *
 * 使い方:
 *   import { STAT_AGE_GROUP_DISTRIBUTION, EST_MPC_PARAMS } from '../data';
 *
 * 命名規則:
 *   STAT_*  統計調査からの直接引用値（stats/ 配下）
 *   EST_*   推計・モデルパラメータ（estimated/ 配下）
 */

export * from './stats/index.js';
export * from './estimated/index.js';
