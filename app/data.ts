export type MetricKey =
  | "fiscalStrength"
  | "ordinaryBalance"
  | "debtService"
  | "futureBurden"
  | "fundBalance"
  | "personnel";

export type Municipality = {
  code: string;
  name: string;
  pref: string;
  group: string;
  population: number;
  fiscalStrength: number;
  ordinaryBalance: number;
  debtService: number;
  futureBurden: number;
  fundBalance: number;
  personnel: number;
  trend: number[];
  cause: "公債費型" | "扶助費型" | "人件費型" | "均衡型";
};

export const metrics: Record<MetricKey, { label: string; unit: string; better: "high" | "low"; digits: number }> = {
  fiscalStrength: { label: "財政力指数", unit: "", better: "high", digits: 2 },
  ordinaryBalance: { label: "経常収支比率", unit: "%", better: "low", digits: 1 },
  debtService: { label: "実質公債費比率", unit: "%", better: "low", digits: 1 },
  futureBurden: { label: "将来負担比率", unit: "%", better: "low", digits: 1 },
  fundBalance: { label: "基金残高比率", unit: "%", better: "high", digits: 1 },
  personnel: { label: "人件費充当率", unit: "%", better: "low", digits: 1 },
};

const wakayamaNames = [
  "和歌山市", "海南市", "橋本市", "有田市", "御坊市", "田辺市", "新宮市", "紀の川市", "岩出市",
  "紀美野町", "かつらぎ町", "九度山町", "高野町", "湯浅町", "広川町", "有田川町", "美浜町", "日高町",
  "由良町", "印南町", "みなべ町", "日高川町", "白浜町", "上富田町", "すさみ町", "那智勝浦町",
  "太地町", "古座川町", "北山村", "串本町",
];

const causes: Municipality["cause"][] = ["扶助費型", "公債費型", "均衡型", "人件費型"];

export const municipalities: Municipality[] = wakayamaNames.map((name, i) => {
  const city = i < 9;
  const small = i >= 23;
  const base = 89 + ((i * 7) % 13);
  const change = Number((((i % 6) - 2) * 0.7).toFixed(1));
  return {
    code: `30${201 + i}`,
    name,
    pref: "和歌山県",
    group: city ? (i === 0 ? "中核市" : "都市Ⅱ") : small ? "町村Ⅰ" : "町村Ⅱ",
    population: city ? 360000 - i * 36000 : Math.max(450, 29000 - (i - 9) * 1350),
    fiscalStrength: Number((city ? 0.68 - i * 0.025 : 0.42 - (i - 9) * 0.009).toFixed(2)),
    ordinaryBalance: Number((base + change).toFixed(1)),
    debtService: Number((4.2 + ((i * 17) % 106) / 10).toFixed(1)),
    futureBurden: Number((8 + ((i * 23) % 112)).toFixed(1)),
    fundBalance: Number((35 + ((i * 29) % 95)).toFixed(1)),
    personnel: Number((20 + ((i * 11) % 82) / 10).toFixed(1)),
    trend: [base - 3.2, base - 1.7, base - 1.2, base - 0.4, base + change].map((v) => Number(v.toFixed(1))),
    cause: causes[i % causes.length],
  };
});

const nationalSeed: Omit<Municipality, "code">[] = [
  { name: "横浜市", pref: "神奈川県", group: "政令市", population: 3770000, fiscalStrength: 0.97, ordinaryBalance: 98.3, debtService: 9.6, futureBurden: 129.2, fundBalance: 19.8, personnel: 23.1, trend: [96.2, 96.8, 97.5, 97.9, 98.3], cause: "扶助費型" },
  { name: "札幌市", pref: "北海道", group: "政令市", population: 1960000, fiscalStrength: 0.72, ordinaryBalance: 96.9, debtService: 6.1, futureBurden: 66.4, fundBalance: 24.5, personnel: 21.8, trend: [95.1, 95.6, 96.0, 96.4, 96.9], cause: "扶助費型" },
  { name: "川崎市", pref: "神奈川県", group: "政令市", population: 1540000, fiscalStrength: 1.08, ordinaryBalance: 99.1, debtService: 7.0, futureBurden: 118.5, fundBalance: 15.2, personnel: 24.0, trend: [97.2, 97.9, 98.1, 98.6, 99.1], cause: "人件費型" },
  { name: "福岡市", pref: "福岡県", group: "政令市", population: 1650000, fiscalStrength: 0.89, ordinaryBalance: 92.7, debtService: 7.8, futureBurden: 61.1, fundBalance: 32.8, personnel: 19.7, trend: [93.8, 93.1, 92.9, 92.8, 92.7], cause: "公債費型" },
  { name: "金沢市", pref: "石川県", group: "中核市", population: 458000, fiscalStrength: 0.82, ordinaryBalance: 91.3, debtService: 10.2, futureBurden: 81.6, fundBalance: 44.1, personnel: 20.9, trend: [90.1, 90.7, 91.0, 91.2, 91.3], cause: "公債費型" },
  { name: "高松市", pref: "香川県", group: "中核市", population: 417000, fiscalStrength: 0.81, ordinaryBalance: 90.6, debtService: 5.6, futureBurden: 35.7, fundBalance: 67.4, personnel: 19.8, trend: [91.2, 91.0, 90.8, 90.7, 90.6], cause: "均衡型" },
  { name: "鳥取市", pref: "鳥取県", group: "中核市", population: 184000, fiscalStrength: 0.53, ordinaryBalance: 93.8, debtService: 8.8, futureBurden: 45.3, fundBalance: 79.2, personnel: 22.6, trend: [91.9, 92.1, 92.7, 93.2, 93.8], cause: "人件費型" },
  { name: "豊田市", pref: "愛知県", group: "中核市", population: 416000, fiscalStrength: 1.63, ordinaryBalance: 83.2, debtService: 1.1, futureBurden: 0, fundBalance: 133.6, personnel: 16.8, trend: [84.4, 83.9, 83.7, 83.3, 83.2], cause: "均衡型" },
  { name: "夕張市", pref: "北海道", group: "都市Ⅱ", population: 6600, fiscalStrength: 0.18, ordinaryBalance: 108.4, debtService: 35.2, futureBurden: 251.6, fundBalance: 9.4, personnel: 27.2, trend: [104.1, 105.5, 106.2, 107.3, 108.4], cause: "公債費型" },
  { name: "長野市", pref: "長野県", group: "中核市", population: 367000, fiscalStrength: 0.72, ordinaryBalance: 89.9, debtService: 6.4, futureBurden: 28.9, fundBalance: 86.0, personnel: 19.1, trend: [90.6, 90.4, 90.3, 90.0, 89.9], cause: "均衡型" },
];

export const allMunicipalities: Municipality[] = [
  ...municipalities,
  ...nationalSeed.map((item, i) => ({ ...item, code: `90${101 + i}` })),
];

export const years = [2019, 2020, 2021, 2022, 2023];

export function metricValue(item: Municipality, metric: MetricKey) {
  return item[metric] as number;
}

export function formatMetric(value: number, key: MetricKey) {
  const meta = metrics[key];
  return `${value.toFixed(meta.digits)}${meta.unit}`;
}

export function benchmarkFor(item: Municipality, key: MetricKey) {
  const peers = allMunicipalities.filter((m) => m.group === item.group);
  return peers.reduce((sum, m) => sum + metricValue(m, key), 0) / Math.max(peers.length, 1);
}
