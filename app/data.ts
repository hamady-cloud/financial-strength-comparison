import officialDataMeta from "./official-data-meta.json";
import prefecturalDataMeta from "./prefectural-data-meta.json";

export type Scope = "municipality" | "prefecture";
export type MetricKey =
  | "fiscalStrength" | "ordinaryBalance" | "debtService" | "futureBurden"
  | "actualDeficit" | "consolidatedDeficit" | "fundBalance" | "personnel";

type MetricSeries = Record<MetricKey, Array<number | null>>;

export type Municipality = {
  code: string;
  name: string;
  pref: string;
  scope: Scope;
  groups: Array<string | null>;
  populations: Array<number | null>;
  history: MetricSeries;
  composition: {
    personnel: Array<number | null>;
    assistance: Array<number | null>;
    debt: Array<number | null>;
    other: Array<number | null>;
  };
};

type CompactEntity = {
  c: string;
  n: string;
  p: string;
  g: Array<string | null>;
  pop: Array<number | null>;
  v: Record<"f" | "o" | "d" | "b" | "a" | "c" | "r" | "pe", Array<number | null>>;
  comp: Record<"a" | "d" | "o", Array<number | null>>;
};
type GroupAverages = Record<string, Partial<Record<"f" | "o" | "d" | "b", Array<number | null>>>>;
type DataPayload = { groupAverages: GroupAverages; municipalities?: CompactEntity[]; prefectures?: CompactEntity[] };

export const years = officialDataMeta.years;
export const dataSnapshot = officialDataMeta.snapshot;
export const dataGeneratedAt = officialDataMeta.generatedAt;
export const dataSource = officialDataMeta.source;
export const dataSourceUrl = officialDataMeta.sourceUrl;
export const healthRatioSnapshot = officialDataMeta.healthRatioSnapshot;
export const healthRatioSource = officialDataMeta.healthRatioSource;
export const healthRatioSourceUrl = officialDataMeta.healthRatioSourceUrl;
export const prefecturalDataSnapshot = prefecturalDataMeta.snapshot;
export const prefecturalDataGeneratedAt = prefecturalDataMeta.generatedAt;
export const prefecturalDataSourceUrl = prefecturalDataMeta.sourceUrl;

export const metrics: Record<MetricKey, { label: string; unit: string; better: "high" | "low"; digits: number; official: boolean }> = {
  fiscalStrength: { label: "財政力指数", unit: "", better: "high", digits: 2, official: true },
  ordinaryBalance: { label: "経常収支比率", unit: "%", better: "low", digits: 1, official: true },
  debtService: { label: "実質公債費比率", unit: "%", better: "low", digits: 1, official: true },
  futureBurden: { label: "将来負担比率", unit: "%", better: "low", digits: 1, official: true },
  actualDeficit: { label: "実質赤字比率", unit: "%", better: "low", digits: 2, official: true },
  consolidatedDeficit: { label: "連結実質赤字比率", unit: "%", better: "low", digits: 2, official: true },
  fundBalance: { label: "基金残高比率", unit: "%", better: "high", digits: 1, official: false },
  personnel: { label: "人件費比率（歳出）", unit: "%", better: "low", digits: 1, official: false },
};

export const allMunicipalities: Municipality[] = [];
export const municipalities: Municipality[] = [];
export const allPrefectures: Municipality[] = [];
const groupAveragesByScope: Record<Scope, GroupAverages> = { municipality: {}, prefecture: {} };

function parseEntities(records: CompactEntity[], scope: Scope): Municipality[] {
  return records.map((record) => ({
    code: record.c,
    name: record.n,
    pref: record.p,
    scope,
    groups: record.g,
    populations: record.pop,
    history: {
      fiscalStrength: record.v.f, ordinaryBalance: record.v.o, debtService: record.v.d,
      futureBurden: record.v.b, actualDeficit: record.v.a, consolidatedDeficit: record.v.c,
      fundBalance: record.v.r, personnel: record.v.pe,
    },
    composition: {
      personnel: record.v.pe, assistance: record.comp.a, debt: record.comp.d, other: record.comp.o,
    },
  }));
}

function replaceAverages(scope: Scope, averages: GroupAverages) {
  const target = groupAveragesByScope[scope];
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, averages);
}

export function hydrateOfficialData(input: unknown) {
  if (!input || typeof input !== "object") throw new Error("公式データの形式が正しくありません。");
  const payload = input as Partial<DataPayload>;
  if (!Array.isArray(payload.municipalities) || !payload.groupAverages) throw new Error("市町村データに必要な項目がありません。");
  replaceAverages("municipality", payload.groupAverages);
  const parsed = parseEntities(payload.municipalities, "municipality");
  allMunicipalities.splice(0, allMunicipalities.length, ...parsed);
  municipalities.splice(0, municipalities.length, ...parsed.filter((item) => item.pref === "和歌山県"));
}

export function hydratePrefecturalData(input: unknown) {
  if (!input || typeof input !== "object") throw new Error("都道府県データの形式が正しくありません。");
  const payload = input as Partial<DataPayload>;
  if (!Array.isArray(payload.prefectures) || !payload.groupAverages) throw new Error("都道府県データに必要な項目がありません。");
  replaceAverages("prefecture", payload.groupAverages);
  allPrefectures.splice(0, allPrefectures.length, ...parseEntities(payload.prefectures, "prefecture"));
}

export function indexForYear(year: number) {
  const index = years.indexOf(year);
  return index >= 0 ? index : years.length - 1;
}
export function groupAt(item: Municipality, year = years.at(-1)!) { return item.groups[indexForYear(year)] ?? "区分なし"; }
export function populationAt(item: Municipality, year = years.at(-1)!) { return item.populations[indexForYear(year)] ?? 0; }
export function metricValue(item: Municipality, metric: MetricKey, year = years.at(-1)!) { return item.history[metric][indexForYear(year)] ?? null; }
export function metricHistory(item: Municipality, metric: MetricKey, throughYear = years.at(-1)!) { return item.history[metric].slice(0, indexForYear(throughYear) + 1); }
export function isDeficitMetric(key: MetricKey) { return key === "actualDeficit" || key === "consolidatedDeficit"; }

// 0 が「測定された0」ではなく「該当なし」を意味する指標。
// 赤字比率は公表値「－」＝赤字なし、将来負担比率は「－」＝将来負担額が
// 充当可能財源等を下回る（負担なし）を、それぞれ 0 として保持している。
const zeroLabels: Partial<Record<MetricKey, string>> = {
  actualDeficit: "赤字なし",
  consolidatedDeficit: "赤字なし",
  futureBurden: "負担なし",
};
export function formatMetric(value: number | null, key: MetricKey) {
  if (value == null || !Number.isFinite(value)) return "—";
  const zeroLabel = zeroLabels[key];
  if (zeroLabel && value === 0) return zeroLabel;
  const meta = metrics[key];
  return `${value.toFixed(meta.digits)}${meta.unit}`;
}

// 同順位を正しく扱う順位計算。値の刻みが粗い指標（経常収支比率は1,741団体に対し
// 相異値49種）では同値が大量に発生するため、配列順で順位を決めてはいけない。
export function rankWithin(list: Municipality[], target: Municipality, key: MetricKey, year: number) {
  const value = metricValue(target, key, year);
  if (value == null) return null;
  const better = metrics[key].better === "low"
    ? (candidate: number) => candidate < value
    : (candidate: number) => candidate > value;
  let ahead = 0;
  let tied = 0;
  for (const item of list) {
    const candidate = metricValue(item, key, year);
    if (candidate == null) continue;
    if (better(candidate)) ahead += 1;
    else if (candidate === value) tied += 1;
  }
  return { rank: ahead + 1, tied };
}

const officialMetricCodes: Partial<Record<MetricKey, "f" | "o" | "d" | "b">> = {
  fiscalStrength: "f", ordinaryBalance: "o", debtService: "d", futureBurden: "b",
};
export function benchmarkFor(item: Municipality, key: MetricKey, year = years.at(-1)!) {
  if (isDeficitMetric(key)) return null;
  const index = indexForYear(year);
  const group = groupAt(item, year);
  const officialCode = officialMetricCodes[key];
  const officialAverage = officialCode ? groupAveragesByScope[item.scope][group]?.[officialCode]?.[index] : null;
  if (officialAverage != null) return officialAverage;
  const source = item.scope === "municipality" ? allMunicipalities : allPrefectures;
  const values = source.filter((candidate) => groupAt(candidate, year) === group)
    .map((candidate) => metricValue(candidate, key, year))
    .filter((value): value is number => value != null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function compositionAt(item: Municipality, year = years.at(-1)!) {
  const index = indexForYear(year);
  return {
    personnel: item.composition.personnel[index] ?? null, assistance: item.composition.assistance[index] ?? null,
    debt: item.composition.debt[index] ?? null, other: item.composition.other[index] ?? null,
  };
}
export function causeAt(item: Municipality, year = years.at(-1)!) {
  const composition = compositionAt(item, year);
  const candidates = [["人件費型", composition.personnel], ["扶助費型", composition.assistance], ["公債費型", composition.debt]] as const;
  const available = candidates.filter((candidate): candidate is readonly [typeof candidate[0], number] => candidate[1] != null);
  return available.length ? [...available].sort((a, b) => b[1] - a[1])[0][0] : "データなし";
}
