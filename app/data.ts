import officialData from "./official-data.json";

export type MetricKey =
  | "fiscalStrength"
  | "ordinaryBalance"
  | "debtService"
  | "futureBurden"
  | "fundBalance"
  | "personnel";

type MetricSeries = Record<MetricKey, Array<number | null>>;

export type Municipality = {
  code: string;
  name: string;
  pref: string;
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

type CompactMunicipality = {
  c: string;
  n: string;
  p: string;
  g: Array<string | null>;
  pop: Array<number | null>;
  v: Record<"f" | "o" | "d" | "b" | "r" | "pe", Array<number | null>>;
  comp: Record<"pe" | "a" | "d" | "o", Array<number | null>>;
};

const compactRecords = officialData.municipalities as CompactMunicipality[];

export const years = officialData.years;
export const dataSnapshot = officialData.snapshot;
export const dataSource = officialData.source;
export const dataSourceUrl = officialData.sourceUrl;

export const metrics: Record<MetricKey, { label: string; unit: string; better: "high" | "low"; digits: number; official: boolean }> = {
  fiscalStrength: { label: "財政力指数", unit: "", better: "high", digits: 2, official: true },
  ordinaryBalance: { label: "経常収支比率", unit: "%", better: "low", digits: 1, official: true },
  debtService: { label: "実質公債費比率", unit: "%", better: "low", digits: 1, official: true },
  futureBurden: { label: "将来負担比率", unit: "%", better: "low", digits: 1, official: true },
  fundBalance: { label: "基金残高比率", unit: "%", better: "high", digits: 1, official: false },
  personnel: { label: "人件費比率（歳出）", unit: "%", better: "low", digits: 1, official: false },
};

export const allMunicipalities: Municipality[] = compactRecords.map((record) => ({
  code: record.c,
  name: record.n,
  pref: record.p,
  groups: record.g,
  populations: record.pop,
  history: {
    fiscalStrength: record.v.f,
    ordinaryBalance: record.v.o,
    debtService: record.v.d,
    futureBurden: record.v.b,
    fundBalance: record.v.r,
    personnel: record.v.pe,
  },
  composition: {
    personnel: record.comp.pe,
    assistance: record.comp.a,
    debt: record.comp.d,
    other: record.comp.o,
  },
}));

export const municipalities = allMunicipalities.filter((item) => item.pref === "和歌山県");

export function indexForYear(year: number) {
  const index = years.indexOf(year);
  return index >= 0 ? index : years.length - 1;
}

export function groupAt(item: Municipality, year = years[years.length - 1]) {
  return item.groups[indexForYear(year)] ?? "区分なし";
}

export function populationAt(item: Municipality, year = years[years.length - 1]) {
  return item.populations[indexForYear(year)] ?? 0;
}

export function metricValue(item: Municipality, metric: MetricKey, year = years[years.length - 1]) {
  return item.history[metric][indexForYear(year)] ?? null;
}

export function metricHistory(item: Municipality, metric: MetricKey, throughYear = years[years.length - 1]) {
  return item.history[metric].slice(0, indexForYear(throughYear) + 1);
}

export function formatMetric(value: number | null, key: MetricKey) {
  if (value == null || !Number.isFinite(value)) return "—";
  const meta = metrics[key];
  return `${value.toFixed(meta.digits)}${meta.unit}`;
}

const compactGroupAverages = officialData.groupAverages as Record<string, Partial<Record<"f" | "o" | "d" | "b", Array<number | null>>>>;
const officialMetricCodes: Partial<Record<MetricKey, "f" | "o" | "d" | "b">> = {
  fiscalStrength: "f",
  ordinaryBalance: "o",
  debtService: "d",
  futureBurden: "b",
};

export function benchmarkFor(item: Municipality, key: MetricKey, year = years[years.length - 1]) {
  const index = indexForYear(year);
  const group = groupAt(item, year);
  const officialCode = officialMetricCodes[key];
  const officialAverage = officialCode ? compactGroupAverages[group]?.[officialCode]?.[index] : null;
  if (officialAverage != null) return officialAverage;
  const values = allMunicipalities
    .filter((candidate) => groupAt(candidate, year) === group)
    .map((candidate) => metricValue(candidate, key, year))
    .filter((value): value is number => value != null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function compositionAt(item: Municipality, year = years[years.length - 1]) {
  const index = indexForYear(year);
  return {
    personnel: item.composition.personnel[index] ?? null,
    assistance: item.composition.assistance[index] ?? null,
    debt: item.composition.debt[index] ?? null,
    other: item.composition.other[index] ?? null,
  };
}

export function causeAt(item: Municipality, year = years[years.length - 1]) {
  const composition = compositionAt(item, year);
  const candidates = [
    ["人件費型", composition.personnel],
    ["扶助費型", composition.assistance],
    ["公債費型", composition.debt],
  ] as const;
  const available = candidates.filter((candidate): candidate is readonly [typeof candidate[0], number] => candidate[1] != null);
  if (!available.length) return "データなし";
  return [...available].sort((a, b) => b[1] - a[1])[0][0];
}
