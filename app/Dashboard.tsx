"use client";
/* eslint-disable @next/next/no-img-element -- User-supplied explanatory image is intentionally served at its original resolution. */

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  allMunicipalities,
  allPrefectures,
  benchmarkFor,
  causeAt,
  compositionAt,
  dataGeneratedAt,
  dataSnapshot,
  formatMetric,
  groupAt,
  healthRatioSnapshot,
  healthRatioSourceUrl,
  hydrateOfficialData,
  hydratePrefecturalData,
  indexForYear,
  isDeficitMetric,
  isNoneAtZero,
  metricHistory,
  metricValue,
  metrics,
  populationAt,
  prefecturalDataGeneratedAt,
  prefecturalDataSnapshot,
  prefecturalDataSourceUrl,
  rankWithin,
  years,
  type MetricKey,
  type Municipality,
  type Scope,
} from "./data";

type View = "ranking" | "scatter" | "detail" | "wakayama" | "guide" | "risk" | "sources";

const nav: { id: View; label: string; index: string }[] = [
  { id: "ranking", label: "全国ランキング", index: "01" },
  { id: "scatter", label: "指標マップ", index: "02" },
  { id: "detail", label: "団体カルテ", index: "03" },
  { id: "wakayama", label: "地域ビュー", index: "04" },
  { id: "guide", label: "やさしい指標解説", index: "05" },
  { id: "risk", label: "財政悪化でどうなる？", index: "06" },
  { id: "sources", label: "出典・注意", index: "07" },
];

function Trend({ values, good = false }: { values: Array<number | null>; good?: boolean }) {
  const available = values.filter((value): value is number => value != null);
  if (!available.length) return <span className="no-data">—</span>;
  const min = Math.min(...available);
  const max = Math.max(...available);
  const range = max - min || 1;
  return (
    <div className="spark" aria-label={`${values.length}年推移 ${values.map((value) => value ?? "データなし").join("、")}`}>
      {values.map((v, i) => (
        <i key={i} style={{ height: v == null ? "8%" : `${24 + ((v - min) / range) * 60}%` }} className={`${good ? "good" : ""} ${v == null ? "missing" : ""}`} />
      ))}
    </div>
  );
}

// CSVは画面に出ている指標をすべて書き出す。表計算で扱えるよう値は常に数値とし、
// 「赤字なし」「負担なし」は 0 として出力する（列名で意味を判別できる）。
function DownloadButton({ rows, columns, year, scope, filename }: { rows: Municipality[]; columns: MetricKey[]; year: number; scope: Scope; filename: string }) {
  function download() {
    const header = [
      "年度", "団体コード", "団体名",
      scope === "municipality" ? "都道府県" : "地域",
      scope === "municipality" ? "類似団体区分" : "財政力グループ",
      "人口",
      ...columns.map((key) => `${metrics[key].label}${metrics[key].unit ? `（${metrics[key].unit}）` : ""}`),
    ];
    const lines = rows.map((m) => [
      year, m.code, m.name, m.pref, groupAt(m, year), populationAt(m, year),
      ...columns.map((key) => metricValue(m, key, year) ?? ""),
    ]);
    const escapeCsvCell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
    const csv = "\uFEFF" + [header, ...lines].map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  return <button className="button secondary" onClick={download}><span>↓</span> CSVを出力</button>;
}

export default function Dashboard() {
  const [dataStatus, setDataStatus] = useState<"loading" | "ready" | "error">("loading");
  const [dataRevision, setDataRevision] = useState(0);
  const [dataRequest, setDataRequest] = useState(0);
  const [copyStatus, setCopyStatus] = useState<"success" | "error" | null>(null);
  const [scope, setScope] = useState<Scope>("municipality");
  const [view, setView] = useState<View>("ranking");
  const [year, setYear] = useState(years[years.length - 1]);
  const [metric, setMetric] = useState<MetricKey>("ordinaryBalance");
  const [pref, setPref] = useState("すべて");
  const [group, setGroup] = useState("すべて");
  const [population, setPopulation] = useState(0);
  const [descending, setDescending] = useState(true);
  const [search, setSearch] = useState("");
  const [scatterSearch, setScatterSearch] = useState("");
  const [scatterPref, setScatterPref] = useState("すべて");
  const [focusPref, setFocusPref] = useState("和歌山県");
  const [selectedCode, setSelectedCode] = useState("30201");
  const [xMetric, setXMetric] = useState<MetricKey>("ordinaryBalance");
  const [yMetric, setYMetric] = useState<MetricKey>("futureBurden");
  const entities = scope === "municipality" ? allMunicipalities : allPrefectures;
  const selected = entities.find((m) => m.code === selectedCode) ?? entities[0];

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch(`/official-data.json?v=${encodeURIComponent(dataGeneratedAt)}`, { signal: controller.signal }),
      fetch(`/prefectural-data.json?v=${encodeURIComponent(prefecturalDataGeneratedAt)}`, { signal: controller.signal }),
    ])
      .then(async ([municipalResponse, prefecturalResponse]) => {
        if (!municipalResponse.ok || !prefecturalResponse.ok) throw new Error("公式データを取得できませんでした");
        return Promise.all([municipalResponse.json(), prefecturalResponse.json()]);
      })
      .then(([municipalPayload, prefecturalPayload]: [unknown, unknown]) => {
        hydrateOfficialData(municipalPayload);
        hydratePrefecturalData(prefecturalPayload);
        setDataRevision((revision) => revision + 1);
        setDataStatus("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setDataStatus("error");
      });
    return () => controller.abort();
  }, [dataRequest]);

  // URL is an external state source; hydrate filters once after the client mounts.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (dataStatus !== "ready") return;
    const params = new URLSearchParams(window.location.search);
    const v = params.get("view") as View | null;
    const m = params.get("metric") as MetricKey | null;
    const requestedScope = params.get("scope") as Scope | null;
    const activeScope: Scope = requestedScope === "prefecture" ? "prefecture" : "municipality";
    const activeEntities = activeScope === "municipality" ? allMunicipalities : allPrefectures;
    setScope(activeScope);
    if (v && nav.some((n) => n.id === v)) setView(v);
    if (m && metrics[m]) setMetric(m);
    const requestedYear = Number(params.get("year"));
    if (years.includes(requestedYear)) setYear(requestedYear);
    const entity = params.get("entity") ?? params.get("municipality");
    if (entity && activeEntities.some((item) => item.code === entity)) setSelectedCode(entity);
    const requestedArea = params.get("area") ?? params.get("prefecture");
    if (requestedArea && activeEntities.some((item) => item.pref === requestedArea)) setFocusPref(requestedArea);
  }, [dataStatus, dataRevision]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (dataStatus !== "ready") return;
    const params = new URLSearchParams();
    params.set("view", view);
    params.set("scope", scope);
    params.set("year", String(year));
    params.set("metric", metric);
    if (view === "detail") params.set("entity", selectedCode);
    if (view === "wakayama") params.set("area", focusPref);
    window.history.replaceState(null, "", `?${params.toString()}`);
  }, [dataStatus, view, year, metric, scope, selectedCode, focusPref]);

  const prefs = ["すべて", ...Array.from(new Set(entities.map((m) => m.pref)))];
  const groups = ["すべて", ...Array.from(new Set(entities.map((m) => groupAt(m, year))))];
  const filtered = entities
    .filter((m) => (pref === "すべて" || m.pref === pref) && (group === "すべて" || groupAt(m, year) === group))
    .filter((m) => populationAt(m, year) >= population && (m.name.includes(search) || m.pref.includes(search)))
    .filter((m) => metricValue(m, metric, year) != null)
    .sort((a, b) => ((metricValue(b, metric, year) ?? 0) - (metricValue(a, metric, year) ?? 0)) * (descending ? 1 : -1));

  async function copyShareUrl() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(window.location.href);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = window.location.href;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();
        if (!copied) throw new Error("copy command failed");
      }
      setCopyStatus("success");
    } catch {
      setCopyStatus("error");
    }
    window.setTimeout(() => setCopyStatus(null), 2200);
  }

  function openDetail(item: Municipality) {
    setSelectedCode(item.code);
    setView("detail");
  }

  function switchScope(nextScope: Scope) {
    if (nextScope === scope) return;
    setScope(nextScope);
    setSelectedCode(nextScope === "municipality" ? "30201" : "30");
    setFocusPref(nextScope === "municipality" ? "和歌山県" : "近畿");
    setPref("すべて");
    setScatterPref("すべて");
    setGroup("すべて");
    setPopulation(0);
    setSearch("");
    setScatterSearch("");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><span>F</span></div>
          <div><strong>Fiscal Lens</strong><small>{scope === "municipality" ? "市町村" : "都道府県"}財政を、解像する。</small></div>
        </div>
        <nav aria-label="メインナビゲーション">
          {nav.map((item) => (
            <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}>
              <span>{item.index}</span>{item.id === "wakayama" ? (scope === "municipality" ? "都道府県ビュー" : "地域ビュー") : item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="status-dot" />
          <div><b>{dataStatus === "ready" ? "公式データで表示中" : dataStatus === "error" ? "データを取得できません" : "公式データを読込中"}</b><small>デジタル庁・総務省 {years[0]}–{years.at(-1)}年度</small></div>
        </div>
        <div className="sidebar-footer">地方財政状況調査ベース<br />データ取得 {dataSnapshot.replaceAll("-", ".")}</div>
      </aside>

      <main>
        <header className="topbar">
          <div className="mobile-brand"><b>Fiscal Lens</b><span>財政ダッシュボード</span></div>
          <div className="scope-switch" role="group" aria-label="表示する自治体の種類">
            <button type="button" aria-pressed={scope === "municipality"} className={scope === "municipality" ? "active" : ""} onClick={() => switchScope("municipality")}>市町村版</button>
            <button type="button" aria-pressed={scope === "prefecture"} className={scope === "prefecture" ? "active" : ""} onClick={() => switchScope("prefecture")}>都道府県版</button>
          </div>
          <div className="year-control"><span>表示年度</span><select aria-label="表示年度" value={year} onChange={(e) => { setYear(Number(e.target.value)); setGroup("すべて"); }}>{years.map((y) => <option key={y} value={y}>{y}年度</option>)}</select></div>
          {copyStatus && <span className={`copy-status ${copyStatus}`} role="status" aria-live="polite">{copyStatus === "success" ? "コピーしました" : "コピーできませんでした"}</span>}
          <button className="icon-button" aria-label="共有URLをコピー" onClick={copyShareUrl}>↗</button>
        </header>

        <div className="mobile-nav">{nav.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}>{item.id === "wakayama" ? (scope === "municipality" ? "都道府県ビュー" : "地域ビュー") : item.label}</button>)}</div>

        {dataStatus === "loading" && <section className="page data-state" aria-live="polite"><span className="data-spinner" /><h1>公式データを読み込んでいます</h1><p>全国の市町村と47都道府県のデータを読み込んでいます。</p></section>}
        {dataStatus === "error" && <section className="page data-state error" role="alert"><h1>公式データを読み込めませんでした</h1><p>通信状況を確認して、もう一度お試しください。</p><button className="button secondary" onClick={() => { setDataStatus("loading"); setDataRequest((request) => request + 1); }}>再読み込み</button></section>}
        {dataStatus === "ready" && <>
          {view === "ranking" && <Ranking scope={scope} entities={entities} rows={filtered} year={year} metric={metric} setMetric={setMetric} pref={pref} setPref={setPref} prefs={prefs} group={group} setGroup={setGroup} groups={groups} population={population} setPopulation={setPopulation} descending={descending} setDescending={setDescending} search={search} setSearch={setSearch} openDetail={openDetail} />}
          {view === "scatter" && <Scatter scope={scope} entities={entities} year={year} xMetric={xMetric} setXMetric={setXMetric} yMetric={yMetric} setYMetric={setYMetric} pref={scatterPref} setPref={setScatterPref} prefs={prefs} search={scatterSearch} setSearch={setScatterSearch} openDetail={openDetail} />}
          {view === "detail" && selected && <Detail scope={scope} entities={entities} year={year} selected={selected} setSelectedCode={setSelectedCode} metric={metric} setMetric={setMetric} />}
          {view === "wakayama" && <PrefectureView scope={scope} entities={entities} year={year} pref={focusPref} setPref={setFocusPref} prefs={prefs.filter((item) => item !== "すべて")} openDetail={openDetail} />}
          {view === "guide" && <BeginnerGuide scope={scope} />}
          {view === "risk" && <FiscalRiskGuide />}
          {view === "sources" && <Sources scope={scope} />}
        </>}

        <footer className="main-footer"><span>本サイトは非公式の分析支援ツールです。正確な値は必ず公表元をご確認ください。</span><div><button onClick={() => setView("guide")}>数値の読み方</button><button onClick={() => setView("sources")}>出典・免責を見る →</button></div></footer>
      </main>
    </div>
  );
}

function PageIntro({ eyebrow, title, text, action }: { eyebrow: string; title: string; text: string; action?: React.ReactNode }) {
  return <div className="page-intro"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{text}</p></div>{action}</div>;
}

const metricHelp: Record<MetricKey, string> = {
  fiscalStrength: "必要な行政サービスにかかる標準的な費用を、その自治体の標準的な税収でどれだけまかなえるかを見る指標です。高いほど、自分たちの収入で行政を運営しやすい傾向があります。",
  ordinaryBalance: "毎年自由に使える収入のうち、人件費・福祉・借金返済など、毎年続く支出に使う割合です。高いほど、新しい事業に回せるお金の余裕が小さい傾向があります。",
  debtService: "自治体の収入規模に対して、実質的な借金返済の負担がどれくらいあるかを示す割合です。低いほど、返済負担が軽い傾向があります。",
  futureBurden: "将来支払う可能性がある借金などの負担から、基金などを差し引き、自治体の収入規模と比べた指標です。低いほど、将来の負担が小さい傾向があります。差し引き後の負担が残らない場合は「負担なし」と表示します。",
  actualDeficit: "一般会計などに生じた実質的な赤字を、自治体の標準的な収入規模と比べた法定指標です。赤字がない場合は『赤字なし』と表示します。値が高いほど注意が必要です。",
  consolidatedDeficit: "一般会計だけでなく、公営事業会計などを含む全会計を合算した実質的な赤字を、標準的な収入規模と比べた法定指標です。赤字がない場合は『赤字なし』と表示します。",
  fundBalance: "主な基金（自治体の貯金）を収入規模で割った、このツール独自の比較指標です。高いほど、災害や急な支出への備えが厚い傾向があります。",
  personnel: "歳出総額に対して、職員給与などの人件費が占める割合を本ツールで計算したものです。単独で良し悪しを決めず、似た規模の自治体と比べて読みます。",
};

const groupHelp: Record<string, string> = {
  政令指定都市: "人口や行政規模が大きく、都道府県が行う仕事の一部も担う都市です。正式な類似団体区分では1つの区分として扱われます。",
  中核市: "人口規模が比較的大きく、保健所の設置など、一部の行政権限を都道府県から移された都市です。",
  施行時特例市: "地方自治法上の施行時特例市です。正式な類似団体区分では1つの区分として扱われます。",
  特別区: "東京都の23特別区です。正式な類似団体区分では1つの区分として扱われます。",
};

function groupExplanation(group: string) {
  if (group.startsWith("グループ")) return `${group}は、財政力指数の水準で都道府県を比較する公式グループです。Aは1.0以上、Bは0.5以上1.0未満、Cは0.4以上0.5未満、Dは0.3以上0.4未満、Eは0.3未満です。`;
  if (groupHelp[group]) return groupHelp[group];
  if (group.startsWith("一般市")) return `${group}は、総務省の正式な類似団体区分です。「一般市」の後のローマ数字は人口規模、ハイフン後の数字は産業構造の区分を表します。`;
  if (group.startsWith("町村")) return `${group}は、総務省の正式な類似団体区分です。ローマ数字は人口規模、ハイフン後の数字は産業構造の区分を表します。`;
  return "人口と産業構造などが近い自治体をまとめた、総務省の正式な類似団体区分です。";
}

function HelpTip({ label, text, compact = false }: { label: string; text: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const id = useId();

  function toggle() {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const width = Math.min(320, window.innerWidth - 24);
      const left = Math.min(window.innerWidth - width - 12, Math.max(12, rect.right - width));
      const showAbove = rect.bottom + 190 > window.innerHeight;
      setPosition({ top: showAbove ? Math.max(12, rect.top - 174) : rect.bottom + 8, left });
    }
    setOpen((value) => !value);
  }

  useEffect(() => {
    if (!open) return;
    function closeOnOutside(event: PointerEvent) {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !popoverRef.current?.contains(target)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    function closeOnViewportChange() { setOpen(false); }
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [open]);

  return <span className={`help-tip ${compact ? "compact" : ""}`}>
    <button ref={buttonRef} type="button" className="help-trigger" aria-label={`${label}の意味を表示`} aria-expanded={open} aria-controls={id} onClick={toggle}>?</button>
    {open && typeof document !== "undefined" && createPortal(
      <div ref={popoverRef} id={id} className="help-popover" role="dialog" aria-label={`${label}の説明`} style={position}>
        <div><strong>{label}</strong><button type="button" aria-label="説明を閉じる" onClick={() => setOpen(false)}>×</button></div>
        <p>{text}</p>
      </div>,
      document.body,
    )}
  </span>;
}

function GroupTag({ group, accent = false }: { group: string; accent?: boolean }) {
  const explanation = groupExplanation(group);
  return <span className="group-tag-wrap"><span className={`tag ${accent ? "accent" : ""}`}>{group}</span><HelpTip label={group} text={explanation} compact /></span>;
}

function Ranking(props: {
  scope: Scope; entities: Municipality[]; rows: Municipality[]; year: number; metric: MetricKey; setMetric: (v: MetricKey) => void; pref: string; setPref: (v: string) => void; prefs: string[];
  group: string; setGroup: (v: string) => void; groups: string[]; population: number; setPopulation: (v: number) => void;
  descending: boolean; setDescending: (v: boolean) => void; search: string; setSearch: (v: string) => void; openDetail: (m: Municipality) => void;
}) {
  const { rows, metric, year } = props;
  const isPrefecture = props.scope === "prefecture";
  const values = rows.map((item) => metricValue(item, metric, year)).filter((value): value is number => value != null).sort((a, b) => a - b);
  const median = values.length ? values[Math.floor(values.length / 2)] : null;
  // 同値には同じ順位を与える。公表値の刻みが粗く（経常収支比率は相異値49種）、
  // 配列順で採番すると団体コード順の並びを順位として見せてしまうため。
  const ranks: number[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const value = metricValue(rows[index], metric, year);
    const previous = index > 0 ? metricValue(rows[index - 1], metric, year) : null;
    ranks.push(index > 0 && value === previous ? ranks[index - 1] : index + 1);
  }
  // 全団体が同値の指標（赤字比率は全国で「赤字なし」）では順位を出さない。
  const uniform = values.length > 1 && values[0] === values[values.length - 1];
  return <section className="page">
    <PageIntro eyebrow="NATIONAL BENCHMARK" title={isPrefecture ? "都道府県ランキング" : "全国市町村ランキング"} text={`${year}年度の公式値を、${isPrefecture ? "財政力グループ" : "正式な類似団体区分"}とともに比較します。`} action={<DownloadButton rows={rows} columns={[metric]} year={year} scope={props.scope} filename={`${props.scope === "municipality" ? "municipal" : "prefectural"}-${metric}-${year}.csv`} />} />
    <div className="insight-strip">
      <div><small>対象団体</small><strong>{rows.length}<em>団体</em></strong><span>全国収録 {props.entities.length.toLocaleString()}団体</span></div>
      <div><small>中央値</small><strong>{formatMetric(median, metric)}</strong><span>{metrics[metric].label}</span></div>
      <div className="insight"><span className="insight-mark">!</span><p><b>読み方のヒント</b>{uniform
        ? `該当する団体はすべて${formatMetric(values[0], metric)}です。差がないため順位は表示していません。財政健全化法の基準と照らして確認してください。`
        : `${metrics[metric].better === "low" ? "値が高い団体ほど、継続的な確認が必要です。" : "値が低い団体ほど、相対的な余力が小さい傾向です。"}${new Set(values).size * 5 < values.length ? "公表値の刻みが粗く同値が多いため、同じ値には同じ順位を表示しています。" : ""}`}</p></div>
    </div>
    <div className="filter-panel">
      <label className="search-filter"><span>団体検索</span><div className="search-field"><span>⌕</span><input value={props.search} onChange={(e) => props.setSearch(e.target.value)} placeholder={isPrefecture ? "都道府県名・地域で検索" : "団体名・都道府県で検索"} /></div></label>
      <label><span>{isPrefecture ? "地域" : "都道府県"}</span><select value={props.pref} onChange={(e) => props.setPref(e.target.value)}>{props.prefs.map((v) => <option key={v}>{v}</option>)}</select></label>
      <label><span>{isPrefecture ? "財政力グループ" : "類似団体区分"}</span><select value={props.group} onChange={(e) => props.setGroup(e.target.value)}>{props.groups.map((v) => <option key={v}>{v}</option>)}</select></label>
      <label><span>人口下限</span><select value={props.population} onChange={(e) => props.setPopulation(Number(e.target.value))}><option value={0}>指定なし</option>{isPrefecture ? <><option value={1000000}>100万人以上</option><option value={5000000}>500万人以上</option><option value={10000000}>1,000万人以上</option></> : <><option value={10000}>1万人以上</option><option value={100000}>10万人以上</option><option value={500000}>50万人以上</option></>}</select></label>
      <label><span>表示指標</span><select value={metric} onChange={(e) => props.setMetric(e.target.value as MetricKey)}>{Object.entries(metrics).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
    </div>
    <div className="table-card">
      <div className="table-head"><div><b>{metrics[metric].label}ランキング</b><span>比較条件に該当する団体</span></div><button className="sort-button" onClick={() => props.setDescending(!props.descending)}>{props.descending ? "高い順 ↓" : "低い順 ↑"}</button></div>
      <div className="table-scroll"><table><thead><tr><th>順位</th><th>団体</th><th><span className="header-with-help">{isPrefecture ? "財政力グループ" : "類似区分"}<HelpTip label={isPrefecture ? "財政力グループ" : "類似団体区分"} text={isPrefecture ? "財政力指数の水準により、都道府県をA～Eの5グループに分けた公式の比較区分です。" : "人口と産業構造などにより総務省が定める正式な比較グループです。年度ごとの公表区分を表示しています。"} compact /></span></th><th>指標値</th><th>{isDeficitMetric(metric) ? <span className="header-with-help">法定基準で確認<HelpTip label="赤字比率の比較" text="赤字比率は、多くの団体が『赤字なし』のため平均差を表示しません。財政健全化法の基準と照らして確認してください。" compact /></span> : `${isPrefecture ? "グループ" : "類似団体"}平均との差`}</th><th>前年度差</th><th>{year - years[0] + 1}年トレンド</th><th /></tr></thead>
        <tbody>{rows.slice(0, 50).map((m, i) => {
          const value = metricValue(m, metric, year); const benchmark = benchmarkFor(m, metric, year); const diff = value != null && benchmark != null ? value - benchmark : null;
          const history = metricHistory(m, metric, year); const previous = history.length > 1 ? history[history.length - 2] : null; const yoy = value != null && previous != null ? value - previous : null;
          const first = history.find((item) => item != null); const good = first != null && value != null && (metrics[metric].better === "low" ? value <= first : value >= first);
          const diffBad = diff != null && (metrics[metric].better === "low" ? diff > 0 : diff < 0); const yoyBad = yoy != null && (metrics[metric].better === "low" ? yoy > 0 : yoy < 0);
          return <tr key={m.code}><td>{uniform ? <span className="rank flat" aria-label="順位なし">—</span> : <span className={`rank ${ranks[i] <= 3 ? "top" : ""}`}>{ranks[i]}</span>}</td><td><button className="entity" onClick={() => props.openDetail(m)}><b>{m.name}</b><small>{m.pref} · {populationAt(m, year).toLocaleString()}人</small></button></td><td><GroupTag group={groupAt(m, year)} /></td><td><strong>{formatMetric(value, metric)}</strong></td><td>{isDeficitMetric(metric) ? <span className="no-data">平均との差は非表示</span> : diff == null ? <span className="no-data">—</span> : <span className={diffBad ? "delta bad" : "delta good"}>{diff > 0 ? "+" : ""}{diff.toFixed(metrics[metric].digits)}{metrics[metric].unit}</span>}</td><td>{yoy == null ? <span className="no-data">—</span> : <span className={yoyBad ? "delta bad" : "delta good"}>{yoy === 0 ? "→" : yoy > 0 ? "▲" : "▼"} {Math.abs(yoy).toFixed(metrics[metric].digits)}</span>}</td><td><Trend values={history} good={good} /></td><td><button className="row-arrow" aria-label={`${m.name}の詳細`} onClick={() => props.openDetail(m)}>→</button></td></tr>;
        })}</tbody></table>{rows.length === 0 && <div className="empty">条件に合う団体がありません。フィルタを変更してください。</div>}</div>
    </div>
  </section>;
}

// 公表値の刻みが粗く（経常収支比率は1,741団体に対し49種）、点が格子状に重なって
// 1,241団体（71%）がクリックできなかった。団体コードから決まる固定のずれを、
// 刻み1つ分より十分小さい範囲で与えて重なりをほどく。乱数ではないので再描画しても動かない。
function scatterOffset(code: string, axis: number, amplitude: number) {
  let hash = axis * 0x9e3779b1;
  for (let index = 0; index < code.length; index += 1) hash = (Math.imul(hash, 31) + code.charCodeAt(index)) | 0;
  return (((hash >>> 0) % 1000) / 1000 - 0.5) * 2 * amplitude;
}

function Scatter({ scope, entities, year, xMetric, setXMetric, yMetric, setYMetric, pref, setPref, prefs, search, setSearch, openDetail }: { scope: Scope; entities: Municipality[]; year: number; xMetric: MetricKey; setXMetric: (v: MetricKey) => void; yMetric: MetricKey; setYMetric: (v: MetricKey) => void; pref: string; setPref: (v: string) => void; prefs: string[]; search: string; setSearch: (v: string) => void; openDetail: (m: Municipality) => void }) {
  const inScope = entities.filter((m) => pref === "すべて" || m.pref === pref);
  const plotted = inScope.filter((m) => metricValue(m, xMetric, year) != null && metricValue(m, yMetric, year) != null);
  const isPrefecture = scope === "prefecture";
  // 赤字比率は全団体が「赤字なし」で差がないため、軸に選ぶと全点が1本の線に重なる。
  // 散布図の軸からは外し、団体カルテと地域ビューで法定基準と照らして確認する。
  const axisMetrics = (Object.keys(metrics) as MetricKey[]).filter((key) => !isDeficitMetric(key));
  const xValues = plotted.map((m) => metricValue(m, xMetric, year) as number); const yValues = plotted.map((m) => metricValue(m, yMetric, year) as number);
  const hasPoints = plotted.length > 0;
  const minX = hasPoints ? Math.min(...xValues) : 0; const maxX = hasPoints ? Math.max(...xValues) : 0; const minY = hasPoints ? Math.min(...yValues) : 0; const maxY = hasPoints ? Math.max(...yValues) : 0;
  const avgX = hasPoints ? xValues.reduce((a, b) => a + b, 0) / xValues.length : null; const avgY = hasPoints ? yValues.reduce((a, b) => a + b, 0) / yValues.length : null;
  const normalizedSearch = search.trim();
  const match = normalizedSearch ? plotted.find((m) => m.name.includes(normalizedSearch)) : undefined;
  return <section className="page">
    <PageIntro eyebrow="RELATIONSHIP MAP" title="指標マップ" text={`${year}年度の2つの指標を重ね、単一指標では見えない財政構造を捉えます。`} />
    <div className="scatter-layout"><div className="chart-card">
      <div className="chart-toolbar"><label><span>X軸</span><select value={xMetric} onChange={(e) => setXMetric(e.target.value as MetricKey)}>{axisMetrics.map((k) => <option key={k} value={k}>{metrics[k].label}</option>)}</select></label><span className="cross">×</span><label><span>Y軸</span><select value={yMetric} onChange={(e) => setYMetric(e.target.value as MetricKey)}>{axisMetrics.map((k) => <option key={k} value={k}>{metrics[k].label}</option>)}</select></label><label><span>{isPrefecture ? "地域" : "都道府県"}</span><select value={pref} onChange={(e) => setPref(e.target.value)}>{prefs.map((value) => <option key={value}>{value}</option>)}</select></label><label className="search-filter"><span>団体検索</span><div className="search-field compact"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={isPrefecture ? "都道府県をハイライト" : "団体をハイライト"} /></div></label></div>
      <div className="scatter-chart">
        <div className="danger-zone"><span>注視ゾーン</span></div>{avgX != null && <div className="axis-line x" style={{ left: `${((avgX - minX) / (maxX - minX || 1)) * 100}%` }} />}{avgY != null && <div className="axis-line y" style={{ bottom: `${((avgY - minY) / (maxY - minY || 1)) * 100}%` }} />}
        {plotted.map((m) => { const x = metricValue(m, xMetric, year) as number; const y = metricValue(m, yMetric, year) as number; const left = ((x - minX) / (maxX - minX || 1)) * 92 + 4 + scatterOffset(m.code, 1, 0.6); const bottom = ((y - minY) / (maxY - minY || 1)) * 84 + 7 + scatterOffset(m.code, 2, 0.9); const highlight = match?.code === m.code; const pointSize = Math.max(9, Math.min(24, Math.sqrt(populationAt(m, year)) / (isPrefecture ? 160 : 65))); return <button key={m.code} className={`point ${(isPrefecture ? m.code === "30" : m.pref === "和歌山県") ? "wakayama" : ""} ${highlight ? "highlight" : ""}`} style={{ left: `${left}%`, bottom: `${bottom}%`, width: `${pointSize}px`, height: `${pointSize}px` }} onClick={() => openDetail(m)} aria-label={`${m.name} ${formatMetric(x, xMetric)} / ${formatMetric(y, yMetric)}`}><span>{m.name}</span></button>; })}
        {!hasPoints && <div className="scatter-empty">表示できる団体がありません。都道府県または指標を変更してください。</div>}
        <div className="axis-label left">{metrics[yMetric].label} →</div><div className="axis-label bottom">{metrics[xMetric].label} →</div>
      </div><div className="legend"><span><i className="dot teal" />{isPrefecture ? "和歌山県" : "和歌山県内"}</span><span><i className="dot navy" />その他</span><span>破線：表示可能団体の平均</span></div>
    </div><aside className="map-insight"><span className="eyebrow">QUICK READ</span><h2>右上ほど、複合的な負担が大きい</h2><p>水準だけでなく、自治体規模・類似団体平均との差・推移をあわせて確認してください。</p><div className="mini-stat"><span>表示団体</span><b>{plotted.length.toLocaleString()} / {inScope.length.toLocaleString()}</b></div>{plotted.length < inScope.length && <p className="map-note">選択した指標に値のない{(inScope.length - plotted.length).toLocaleString()}団体は表示していません。</p>}<div className="mini-stat"><span>平均 X</span><b>{formatMetric(avgX, xMetric)}</b></div><div className="mini-stat"><span>平均 Y</span><b>{formatMetric(avgY, yMetric)}</b></div><div className="callout"><b>点の大きさ</b><span>住民基本台帳人口</span></div><p className="map-note">公表値の刻みが粗く同じ座標に多数の団体が重なるため、点は刻みより小さい範囲でわずかにずらして描画しています。正確な値は団体カルテでご確認ください。</p></aside></div>
  </section>;
}

function Detail({ scope, entities, year, selected, setSelectedCode, metric, setMetric }: { scope: Scope; entities: Municipality[]; year: number; selected: Municipality; setSelectedCode: (v: string) => void; metric: MetricKey; setMetric: (v: MetricKey) => void }) {
  const isPrefecture = scope === "prefecture";
  const selectedGroup = groupAt(selected, year);
  const peerRows = entities.filter((m) => groupAt(m, year) === selectedGroup);
  // 同値が多い指標なので、配列位置ではなく「自分より良い団体の数＋1」で順位を出す。
  const national = rankWithin(entities, selected, "ordinaryBalance", year);
  const prefectural = rankWithin(entities.filter((m) => m.pref === selected.pref), selected, "ordinaryBalance", year);
  const cards: MetricKey[] = ["fiscalStrength", "ordinaryBalance", "debtService", "futureBurden", "actualDeficit", "consolidatedDeficit", "fundBalance", "personnel"];
  const history = metricHistory(selected, metric, year);
  const availableHistory = history.filter((value): value is number => value != null);
  const historyMin = availableHistory.length ? Math.min(...availableHistory) : 0;
  const historyMax = availableHistory.length ? Math.max(...availableHistory) : 1;
  const composition = compositionAt(selected, year);
  const personnel = composition.personnel ?? 0; const assistance = composition.assistance ?? 0; const debt = composition.debt ?? 0; const other = composition.other ?? 0;
  const donutStyle = { background: `conic-gradient(var(--ink) 0 ${personnel}%, var(--teal) ${personnel}% ${personnel + assistance}%, var(--coral) ${personnel + assistance}% ${personnel + assistance + debt}%, #d8c8a9 ${personnel + assistance + debt}% 100%)` };
  return <section className="page">
    <PageIntro eyebrow={isPrefecture ? "PREFECTURE PROFILE" : "MUNICIPALITY PROFILE"} title="団体カルテ" text={`${year}年度の公式値と、${years[0]}年度からの指標別推移を表示します。`} />
    <div className="entity-picker"><label><span>対象団体</span><select value={selected.code} onChange={(e) => setSelectedCode(e.target.value)}>{entities.map((m) => <option key={m.code} value={m.code}>{m.pref}　{m.name}</option>)}</select></label><div><GroupTag group={selectedGroup} accent /><span>{populationAt(selected, year).toLocaleString()}人</span><span>団体コード {selected.code}</span></div></div>
    <div className="profile-hero"><div><span className="eyebrow">FISCAL SNAPSHOT</span><h2>{selected.name}</h2><p>{selected.pref}における経常収支比率順位 <b>{prefectural ? `${prefectural.rank}位` : "—"}</b> ／ 全国順位 <b>{national ? `${national.rank}位` : "—"}</b></p>{national && national.tied > 1 && <p className="rank-note">同じ値の団体が全国に{national.tied.toLocaleString()}団体あります（公表値の刻みによる同順位）。</p>}</div><div className="cause-badge"><span>歳出の最大費目</span><strong>{causeAt(selected, year)}</strong><small>人件費・扶助費・公債費の構成比から判定</small></div></div>
    <div className="metric-grid">{cards.map((key) => { const value = metricValue(selected, key, year); const benchmark = benchmarkFor(selected, key, year); const diff = value != null && benchmark != null ? value - benchmark : null; const isBad = diff != null && (metrics[key].better === "low" ? diff > 0 : diff < 0); const deficit = isDeficitMetric(key); const context = key === "actualDeficit" ? (isPrefecture ? "早期健全化基準 3.75%" : "早期健全化基準 11.25～15%") : key === "consolidatedDeficit" ? (isPrefecture ? "早期健全化基準 8.75%" : "早期健全化基準 16.25～20%") : diff == null ? `${isPrefecture ? "グループ" : "類似団体"}平均 —` : `${isPrefecture ? "グループ" : "類似団体"}平均 ${diff > 0 ? "+" : ""}${diff.toFixed(metrics[key].digits)}${metrics[key].unit}`; return <div className="metric-card" key={key}><div><span>{metrics[key].label}</span><HelpTip label={metrics[key].label} text={metricHelp[key]} /></div><strong>{formatMetric(value, key)}</strong><p className={deficit ? (value ?? 0) > 0 ? "bad-text" : "good-text" : diff == null ? "no-data" : isBad ? "bad-text" : "good-text"}>{context}</p><div className="range"><i style={{ width: value == null || (value === 0 && isNoneAtZero(key)) ? "0" : `${Math.min(100, Math.max(8, (value / (key === "fiscalStrength" ? 1.8 : key === "futureBurden" ? 280 : deficit ? 20 : 140)) * 100))}%` }} /></div></div>; })}</div>
    <div className="detail-grid"><div className="panel"><div className="panel-title"><div><span className="eyebrow">METRIC-SPECIFIC TREND</span><h3>{metrics[metric].label}の推移</h3></div><select value={metric} onChange={(e) => setMetric(e.target.value as MetricKey)}>{Object.entries(metrics).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div><div className="line-chart"><div className="grid-lines" /><div className="trend-columns">{history.map((value, index) => { const height = value == null ? 3 : 18 + ((value - historyMin) / (historyMax - historyMin || 1)) * 62; return <div key={years[index]}><span className={value == null ? "missing-value" : ""} style={{ bottom: `${height}%` }}>{value == null ? "—" : formatMetric(value, metric)}</span><i className={value == null ? "missing" : ""} style={{ height: `${height}%` }} /><small>{years[index]}</small></div>; })}</div></div></div>
      <div className="panel"><div className="panel-title"><div><span className="eyebrow">EXPENDITURE MIX</span><h3>歳出の構成</h3></div></div><div className="composition"><div className="donut" style={donutStyle}><b>{year}</b><span>年度</span></div><div className="composition-list"><p><span><i style={{ background: "#12364a" }} />人件費</span><b>{composition.personnel == null ? "—" : `${personnel.toFixed(1)}%`}</b></p><p><span><i style={{ background: "#1b8a88" }} />扶助費</span><b>{composition.assistance == null ? "—" : `${assistance.toFixed(1)}%`}</b></p><p><span><i style={{ background: "#e1765d" }} />公債費</span><b>{composition.debt == null ? "—" : `${debt.toFixed(1)}%`}</b></p><p><span><i style={{ background: "#d8c8a9" }} />その他</span><b>{composition.other == null ? "—" : `${other.toFixed(1)}%`}</b></p></div></div><div className="cause-note"><b>{causeAt(selected, year)}</b><span>歳出総額に対する構成比です。人件費・扶助費は性質別、公債費は目的別の公表値を用いています。</span></div></div></div>
    <div className="table-card compact-table"><div className="table-head"><div><b>{isPrefecture ? "同じ財政力グループ" : "類似団体"}との比較</b><span className="group-summary"><GroupTag group={selectedGroup} />{peerRows.length}団体</span></div></div><div className="table-scroll"><table><thead><tr><th>団体</th><th>財政力指数</th><th>経常収支比率</th><th>実質公債費比率</th><th>実質赤字比率</th><th>連結実質赤字比率</th><th>基金残高比率</th></tr></thead><tbody>{peerRows.slice(0, 8).map((m) => <tr key={m.code} className={m.code === selected.code ? "selected-row" : ""}><td><b>{m.name}</b></td><td>{formatMetric(metricValue(m, "fiscalStrength", year), "fiscalStrength")}</td><td>{formatMetric(metricValue(m, "ordinaryBalance", year), "ordinaryBalance")}</td><td>{formatMetric(metricValue(m, "debtService", year), "debtService")}</td><td>{formatMetric(metricValue(m, "actualDeficit", year), "actualDeficit")}</td><td>{formatMetric(metricValue(m, "consolidatedDeficit", year), "consolidatedDeficit")}</td><td>{formatMetric(metricValue(m, "fundBalance", year), "fundBalance")}</td></tr>)}</tbody></table></div></div>
  </section>;
}

function PrefectureView({ scope, entities, year, pref, setPref, prefs, openDetail }: { scope: Scope; entities: Municipality[]; year: number; pref: string; setPref: (v: string) => void; prefs: string[]; openDetail: (m: Municipality) => void }) {
  const isPrefecture = scope === "prefecture";
  const keys: MetricKey[] = ["fiscalStrength", "ordinaryBalance", "debtService", "futureBurden", "actualDeficit", "consolidatedDeficit", "fundBalance"];
  const rows = entities.filter((item) => item.pref === pref);
  const currentIndex = indexForYear(year);
  const changeFromIndex = Math.max(0, currentIndex - 2);
  const changeFor = (item: Municipality) => { const current = item.history.ordinaryBalance[currentIndex]; const previous = item.history.ordinaryBalance[changeFromIndex]; return current != null && previous != null ? current - previous : null; };
  const worst = [...rows].filter((item) => changeFor(item) != null).sort((a, b) => (changeFor(b) ?? 0) - (changeFor(a) ?? 0)).slice(0, 4);
  function heatClass(m: Municipality, key: MetricKey) { const vals = rows.map((x) => metricValue(x, key, year)).filter((value): value is number => value != null).sort((a, b) => a - b); const value = metricValue(m, key, year); if (value == null) return "heat-none"; const rank = vals.indexOf(value) / Math.max(vals.length, 1); const badness = metrics[key].better === "low" ? rank : 1 - rank; return badness > .72 ? "heat-high" : badness > .38 ? "heat-mid" : "heat-low"; }
  return <section className="page">
    <PageIntro eyebrow={isPrefecture ? "REGIONAL FOCUS" : "PREFECTURE FOCUS"} title={isPrefecture ? "地域ビュー" : "都道府県ビュー"} text={`${year}年度の${pref}に属する${rows.length}${isPrefecture ? "都道府県" : "市区町村"}を、公式値で見渡します。`} action={<div className="pref-view-actions"><label><span>{isPrefecture ? "地域" : "都道府県"}を選ぶ</span><select value={pref} onChange={(e) => setPref(e.target.value)}>{prefs.map((item) => <option key={item}>{item}</option>)}</select></label><DownloadButton rows={rows} columns={keys} year={year} scope={scope} filename={`${pref}-fiscal-${year}.csv`} /></div>} />
    <div className="pref-hero"><div><span>{pref} · {year}年度</span><h2>{rows.length}{isPrefecture ? "都道府県" : "市区町村"}の財政を、一望する。</h2><p>色は選択した{isPrefecture ? "地域" : "都道府県"}内での相対的な位置です。濃い色がただちに「危険」を意味するものではありません。</p></div><div className="pref-stat"><b>{rows.length}</b><span>{isPrefecture ? "prefectures" : "municipalities"}</span></div></div>
    <div className="wakayama-grid"><div className="table-card heatmap-card"><div className="table-head"><div><b>{isPrefecture ? "地域別" : "都道府県内"}ヒートマップ</b><span>各指標の域内分布</span></div><div className="heat-legend"><span>良好</span><i className="heat-low" /><i className="heat-mid" /><i className="heat-high" /><span>注視</span></div></div><div className="table-scroll"><table className="heatmap"><thead><tr><th>団体</th>{keys.map((key) => <th key={key}>{metrics[key].label}</th>)}</tr></thead><tbody>{rows.map((m) => <tr key={m.code}><td><div className="heat-entity"><button className="entity" onClick={() => openDetail(m)}><b>{m.name}</b></button><GroupTag group={groupAt(m, year)} /></div></td>{keys.map((key) => <td key={key}><span className={heatClass(m, key)}>{formatMetric(metricValue(m, key, year), key)}</span></td>)}</tr>)}</tbody></table></div></div>
      <aside className="trend-panel"><span className="eyebrow">3-YEAR CHANGE</span><h2>悪化幅の大きい団体</h2><p>経常収支比率が{years[changeFromIndex]}年度から上昇した順</p>{worst.map((m, i) => <button key={m.code} onClick={() => openDetail(m)}><span className="trend-rank">0{i + 1}</span><div><b>{m.name}</b><small>{causeAt(m, year)}</small></div><strong>{(changeFor(m) ?? 0) > 0 ? "+" : ""}{(changeFor(m) ?? 0).toFixed(1)}<em>pt</em></strong></button>)}<div className="trend-note"><b>注目点</b><p>単年度の変化ではなく、費目別の寄与とあわせて確認してください。</p></div></aside></div>
  </section>;
}

function BeginnerGuide({ scope }: { scope: Scope }) {
  const isPrefecture = scope === "prefecture";
  const guideMetrics = [
    {
      number: "01",
      name: "財政力指数",
      question: "自分たちで集められるお金で、必要な仕事をどれくらいまかなえる？",
      simple: "まちの「自分でお金を用意する力」を見る数字です。国から配られる地方交付税に、どのくらい頼らずにすむかを考える手がかりになります。",
      formulaTop: "基準財政収入額",
      formulaBottom: "基準財政需要額",
      suffix: "3年間の平均",
      terms: "「収入額」は標準的に見込める税収など、「需要額」は標準的な行政サービスに必要とされる費用です。実際の歳入・歳出の総額そのものではありません。",
      example: "収入額が70億円、必要額が100億円なら、70 ÷ 100 ＝ 0.70。3年分を平均して表示します。",
      high: "高いほど、税収など自前のお金で対応できる割合が大きい傾向があります。",
      low: "低いほど、地方交付税など国からの支えが重要になります。",
      caution: "1.00未満だから直ちに危険、という意味ではありません。人口規模や産業構造が近い自治体と比べます。",
    },
    {
      number: "02",
      name: "経常収支比率",
      question: "毎年自由に使えるお金のうち、固定費でどれくらい埋まっている？",
      simple: "家計でいえば、毎月の給料のうち、家賃・食費・ローンなど毎月ほぼ必ず出ていくお金が占める割合です。まちの「お金の動かしやすさ」がわかります。",
      formulaTop: "毎年続く経費に使った一般財源",
      formulaBottom: "毎年入る、使い道が決まっていない一般財源",
      suffix: "× 100",
      terms: "一般財源とは、税金や地方交付税など、使い道を自治体が比較的自由に決められるお金です。",
      example: "自由に使える収入が100億円、そのうち固定的な経費が92億円なら、92 ÷ 100 × 100 ＝ 92%。新しい仕事に回せる余地は単純化すると8%です。",
      high: "高いほど固定費の割合が大きく、新しい事業や急な支出に対応しにくい傾向があります。",
      low: "低いほど、政策や臨時の支出に回せる余地がある傾向があります。",
      caution: "法律上の一律な危険ラインはありません。必要な福祉サービスが多いなど、高くなる理由を内訳で確認します。",
    },
    {
      number: "03",
      name: "実質公債費比率",
      question: "1年間の収入規模に対して、借金返済の負担はどれくらい？",
      simple: "まちのローン返済負担を見る数字です。一般会計の返済だけでなく、公営企業などの返済を実質的に負担している分も考えます。",
      formulaTop: "その年に実質的に負担した借金返済額",
      formulaBottom: "標準財政規模などをもとにした額",
      suffix: "× 100・3年間の平均",
      terms: "標準財政規模は、その自治体が標準的に持つ経常的な一般財源の大きさです。公式計算では、国から補われる返済財源などを調整します。",
      example: "説明を簡単にして、収入規模が1,000億円、実質的な返済負担が120億円なら、120 ÷ 1,000 × 100 ＝ 12%。",
      high: "高いほど借金返済の負担が重く、ほかの仕事に使えるお金が少なくなりやすいです。",
      low: "低いほど、その年の収入に対する返済負担は小さい傾向があります。",
      caution: "18%以上は地方債を発行するときに国の許可が必要となり、25%以上は早期健全化基準です。ただし、公式値は複数の調整を含みます。",
    },
    {
      number: "04",
      name: "将来負担比率",
      question: "将来払う約束になっている負担は、今の収入規模に対してどれくらい？",
      simple: "いま残っている借金や、将来負担する可能性が高い金額から、返済に使える基金などを差し引いて測ります。家計でいえば「住宅ローンなどの残高」と「返済用の貯金」をまとめて見るイメージです。",
      formulaTop: "将来負担する額 − 返済に使える基金など",
      formulaBottom: "標準財政規模などをもとにした額",
      suffix: "× 100",
      terms: "将来負担には地方債残高のほか、一部事務組合や第三セクターなどへの負担が含まれることがあります。",
      example: "説明を簡単にして、差し引き後の将来負担が800億円、収入規模が1,000億円なら、800 ÷ 1,000 × 100 ＝ 80%。",
      high: "高いほど、将来の世代が負担する可能性のある金額が大きい傾向があります。",
      low: "低いほど、収入規模に対する将来負担は小さい傾向があります。将来負担額が基金などの充当可能財源を下回る場合、公表値は「－」となり、本ツールでは「負担なし」と表示します。",
      caution: "一般の市町村では350%が早期健全化基準です。政令指定都市などは扱いが異なるため、公式資料も確認します。",
    },
    {
      number: "05",
      name: "実質赤字比率",
      question: "一般会計などの赤字は、まちの標準的な収入に比べてどれくらい？",
      simple: "学校、福祉、道路などの中心的な行政サービスを扱う会計で、年度末に実質的な赤字が出たとき、その大きさを自治体の収入規模と比べる法律上の指標です。",
      formulaTop: "一般会計等の実質赤字額",
      formulaBottom: "標準財政規模",
      suffix: "× 100",
      terms: "実質赤字額は、単なる支出超過ではなく、翌年度へ回すべきお金などを調整した後の赤字です。標準財政規模は自治体の標準的な収入の大きさです。",
      example: "実質赤字が10億円、標準財政規模が100億円なら、10 ÷ 100 × 100 ＝ 10%。赤字がなければ、このアプリでは「赤字なし」と表示します。",
      high: "高いほど、中心的な行政サービスを行う会計の赤字が、自治体の収入規模に比べて大きい状態です。",
      low: "0%相当または「赤字なし」なら、実質赤字が生じていないことを示します。",
      caution: "市町村の早期健全化基準は財政規模により11.25～15%、財政再生基準は20%です。基準以上になると法律に沿った健全化・再生計画が必要です。",
    },
    {
      number: "06",
      name: "連結実質赤字比率",
      question: "一般会計だけでなく、まちの全会計を合わせると赤字はどれくらい？",
      simple: "一般会計に加え、国民健康保険や公営企業なども含め、自治体全体として実質的な赤字があるかを見る法律上の指標です。家計でいえば、財布を一つだけでなく全部まとめて確認するイメージです。",
      formulaTop: "全会計を連結した実質赤字額",
      formulaBottom: "標準財政規模",
      suffix: "× 100",
      terms: "連結とは、自治体が持つ複数の会計の黒字と赤字を、法律のルールに沿って合算することです。",
      example: "全会計を合わせた実質赤字が15億円、標準財政規模が100億円なら、15 ÷ 100 × 100 ＝ 15%。赤字がなければ「赤字なし」です。",
      high: "高いほど、一部の会計だけでなく自治体全体で見た赤字負担が大きい状態です。",
      low: "0%相当または「赤字なし」なら、全会計を合わせた実質赤字が生じていないことを示します。",
      caution: "市町村の早期健全化基準は財政規模により16.25～20%、財政再生基準は30%です。個々の公営企業の資金不足は、別の『資金不足比率』でも確認します。",
    },
    {
      number: "07",
      name: "基金残高比率",
      question: "もしもの時に使える貯金は、まちの収入規模に対してどれくらい？",
      simple: "自治体の主な貯金である基金を、自治体の大きさに合わせて比べるための数字です。金額だけでは大都市が大きく見えるため、収入規模で割ります。",
      formulaTop: "財政調整基金 ＋ 減債基金 ＋ その他特定目的基金",
      formulaBottom: "標準財政規模",
      suffix: "× 100",
      terms: "財政調整基金は急な支出などに備える貯金、減債基金は借金返済のための貯金、特定目的基金は施設整備など目的を決めた貯金です。",
      example: "基金が合計500億円、収入規模が1,000億円なら、500 ÷ 1,000 × 100 ＝ 50%。",
      high: "高いほど、災害・税収減・大きな事業などに備える余力が厚い傾向があります。",
      low: "低いほど、急な支出が起きたときの選択肢が限られやすくなります。",
      caution: "これは本ツールの比較用指標で、法律上の健全化指標ではありません。基金には使い道が決まったものもあるため、全額を自由に使えるわけではありません。",
    },
    {
      number: "08",
      name: "歳出の構成比",
      question: "支出全体の中で、人件費・福祉・借金返済はどれくらい？",
      simple: "歳出全体のうち、人件費、扶助費、公債費が占める割合を見ます。どの種類の支出が大きいかを把握する数字です。",
      formulaTop: "各費目の歳出額",
      formulaBottom: "歳出総額",
      suffix: "× 100",
      terms: "人件費は職員給与など、扶助費は生活・福祉の支援、公債費は借金返済です。このほか物件費や普通建設事業費などもあります。人件費・扶助費は性質別、公債費は目的別の公表値を用いています（出典タブに理由を記載）。",
      example: "歳出総額が100億円で、人件費が25億円なら人件費比率は25%。扶助費30%、公債費20%などと分けて支出構造を見ます。",
      high: "ある費目が類似団体より高ければ、支出構造の違いを詳しく調べる手がかりになります。",
      low: "低い費目だけを見て安心せず、ほかの費目やサービス内容も合わせて確認します。",
      caution: "費用が高いことには理由があります。高齢化、施設数、行政区域の広さなど、地域事情を確認せずに良し悪しを決めないことが重要です。",
    },
  ];

  const glossary = [
    ["一般財源", "使い道が細かく決められておらず、自治体が比較的自由に使えるお金。地方税や地方交付税など。"],
    ["標準財政規模", "その自治体が標準的な状態で持つ、毎年の一般財源のおおよその大きさ。自治体の規模をそろえて比べる物差し。"],
    ["基金", "自治体の貯金。急な支出への備え、借金返済、施設整備など、目的によっていくつかの種類がある。"],
    ["地方債", "道路や学校など長く使う施設を整備するときなどに、自治体が行う借金。将来の住民も返済を負担する。"],
    ["普通会計", "自治体ごとに異なる会計を比べやすくするため、共通ルールで組み直した統計上の会計区分。"],
    ["類似団体", "人口や産業構造などが近い自治体のグループ。条件の近いまち同士で公平に比べるために使う。"],
  ];

  return <section className="page guide-page">
    <PageIntro eyebrow="FISCAL BASICS" title="やさしい指標解説" text="はじめて財政を見る人のために、計算方法と数字の意味を、身近な例で説明します。" />

    <div className="guide-hero">
      <div className="guide-lead"><span className="guide-kicker">まず、ここだけ覚えよう</span><h2>{isPrefecture ? "都道府県" : "市町村"}の財政は、<br /><span className="keep-line">「地域の大きな家計簿」です。</span></h2><p>{isPrefecture ? <>都道府県は、<strong>税金や国からのお金</strong>を受け取り、高校、警察、広域道路、災害対応、医療の調整などに使います。</> : <>市町村は、<strong>税金や国からのお金</strong>を受け取り、小学校・中学校、道路、ごみ収集、消防、福祉などに使います。</>}</p><p><em>普通の家計と違い、利益を出すことが目的ではありません。</em><br />住民に必要なサービスを続けながら、急な災害や将来の負担にも備える必要があります。</p></div>
      <div className="household-map"><div><span>地域の収入</span><b>税金・地方交付税など</b><small>家計なら「給料」に近い</small></div><i>→</i><div><span>地域の支出</span><b>{isPrefecture ? "教育・警察・広域道路など" : "教育・福祉・道路など"}</b><small>家計なら「生活費」に近い</small></div><i>＋</i><div><span>将来への備え</span><b>基金・借金の管理</b><small>家計なら「貯金とローン」</small></div></div>
    </div>

    <div className="guide-warning"><span>大切</span><p><b>1つの数字だけで「良いまち・悪いまち」と決めないでください。</b>人口、産業、年齢構成、面積、必要な公共施設などで数字は変わります。「似た自治体との比較」「数年間の変化」「高くなった理由」の3つを合わせて読みます。</p></div>

    <div className="reading-guide"><span className="eyebrow">HOW TO READ</span><h2>数字を見る4つの順番</h2><div><article><b>1</b><h3>同じ条件で比べる</h3><p>まず類似団体平均との差を見ます。人口の違う大都市と小さな町を、そのまま比べないためです。</p></article><article><b>2</b><h3>数年の流れを見る</h3><p>1年だけの上昇・低下に慌てず、3年・5年と続く変化かを確認します。</p></article><article><b>3</b><h3>複数の数字を組み合わせる</h3><p>借金が多くても基金が厚い場合があります。負担・余力・貯金をセットで見ます。</p></article><article><b>4</b><h3>理由を調べる</h3><p>高齢化、災害復旧、施設整備など、数字が動いた背景を決算資料で確認します。</p></article></div></div>

    <div className="guide-section-head"><span className="eyebrow">EIGHT KEY METRICS</span><h2>8つの数字を、ひとつずつ理解する</h2><p>計算式は理解しやすい形に簡略化しています。実際の公式計算では、法令に基づく控除や調整が加わる場合があります。</p></div>

    <div className="guide-metrics">{guideMetrics.map((item) => <article className="guide-metric-card" key={item.number}>
      <header><span>{item.number}</span><div><small>この数字でわかること</small><h3>{item.name}</h3></div></header>
      <p className="guide-question">「{item.question}」</p>
      <p className="guide-simple">{item.simple}</p>
      <div className="formula-box"><span className="formula-label">計算方法</span><div className="fraction"><b>{item.formulaTop}</b><i /><b>{item.formulaBottom}</b></div><strong>{item.suffix}</strong></div>
      <p className="term-note"><b>ことばの補足</b>{item.terms}</p>
      <div className="example-box"><span>たとえば</span><p>{item.example}</p></div>
      <div className="direction-grid"><div><span className="up">高いとき</span><p>{item.high}</p></div><div><span className="down">低いとき</span><p>{item.low}</p></div></div>
      <div className="guide-caution"><b>読み間違いに注意</b><p>{item.caution}</p></div>
    </article>)}</div>

    <div className="glossary"><div className="guide-section-head"><span className="eyebrow">GLOSSARY</span><h2>よく出てくる財政用語</h2><p>難しい言葉は、画面に戻る前にここで確認できます。</p></div><div className="glossary-grid">{glossary.map(([term, text]) => <article key={term}><h3>{term}</h3><p>{text}</p></article>)}</div></div>

    <div className="guide-finish"><div><span>迷ったときの合言葉</span><h2>比べる・流れを見る・理由を探す</h2></div><p>財政指標は、自治体を採点するためではなく、詳しく調べる入口を見つけるための道具です。</p></div>
  </section>;
}

function FiscalRiskGuide() {
  const thresholds = [
    { name: "実質赤字比率", meaning: "一般会計などの1年分の赤字が、まちの標準的な収入に対してどれくらいか", yellow: <>市町村 <b>11.25～15%</b><br />都道府県 3.75%</>, red: <>市町村 <b>20%</b><br />都道府県 5%</> },
    { name: "連結実質赤字比率", meaning: "一般会計だけでなく、国民健康保険や公営企業なども合わせた赤字の大きさ", yellow: <>市町村 <b>16.25～20%</b><br />都道府県 8.75%</>, red: <>市町村 <b>30%</b><br />都道府県 15%</> },
    { name: "実質公債費比率", meaning: "毎年の収入のうち、借金返済などに使う割合（3年間の平均）", yellow: <><b>25%</b></>, red: <><b>35%</b></> },
    { name: "将来負担比率", meaning: "借金や将来支払う約束が、まちの収入規模の何年分に近いかを見る目安", yellow: <>市町村 <b>350%</b><br />都道府県・政令市 400%</>, red: <>設定なし</> },
  ];
  const comparisonRows = [
    ["基本的な位置付け", "自治体が自ら、計画的に改善する段階", "国の強い関与のもとで再生する段階"],
    ["作る計画", "財政健全化計画", "財政再生計画"],
    ["計画の決定", "自治体が作成し、議会が議決", "自治体が作成・議決し、総務大臣との協議・同意が重要"],
    ["予算", "計画を踏まえて自治体が編成", "財政再生計画に沿って編成する義務"],
    ["地方債（借金）", "財政再生団体のような包括的制限はない", "同意のない計画では原則として発行できず、同意後も許可が必要"],
    ["国・都道府県の関与", "実施が難しい場合などに勧告", "計画や予算の変更まで勧告できる"],
  ];
  const impactAreas = [
    { number: "01", title: "税金・料金の負担", summary: "収入を増やすため、税率・使用料・手数料や徴収方法が見直されることがあります。", items: ["市町村民税・固定資産税などの税率", "ごみ、水道・下水道の料金", "住民票・印鑑証明などの手数料", "市営住宅、保育所、公共施設、健診の利用料", "滞納税や使用料の徴収強化"], note: "指定された瞬間に自動で増税されるわけではありません。税率や料金の変更には、原則として条例改正と議会の議決が必要です。" },
    { number: "02", title: "独自の福祉・子育て施策", summary: "法律で義務付けられたサービスより、自治体独自の「上乗せ」が先に見直されやすくなります。", items: ["子ども医療費助成の年齢・所得要件", "高齢者の交通助成や敬老祝い金", "出産・子育て、障害者への独自給付", "学校給食・教材費への独自補助", "住宅改修・耐震化などの補助"], note: "生活保護、介護保険、障害福祉、義務教育などが一斉に廃止される制度ではありません。" },
    { number: "03", title: "公共施設の統合・縮小", summary: "維持費の大きい施設は、統合、閉鎖、民間委託、開館時間短縮の対象になり得ます。", items: ["小中学校、保育所、幼稚園", "図書館、公民館、体育館、プール", "市民会館、観光・文化施設", "病院・診療所、支所・出張所", "公営住宅"], note: "施設が遠くなる、予約しにくくなるなど、高齢者、子育て世帯、車を持たない人ほど影響を受けやすくなります。" },
    { number: "04", title: "道路・建物・インフラ", summary: "借金を使いにくくなると、大きな整備や更新は緊急性の高いものから選ばれます。", items: ["道路補修や公共施設の建替えの先送り", "上下水道設備の更新延期", "除雪、草刈り、公園管理の縮小", "防災設備の更新抑制", "新しい大型事業の延期・中止"], note: "安全に直結する事業が直ちに止まるわけではありませんが、「今すぐ壊れないもの」は後回しになりやすくなります。" },
    { number: "05", title: "市役所の体制と手続き", summary: "大きな固定費である人件費を抑えるため、職員数、給与、採用、組織が見直されることがあります。", items: ["窓口や電話の待ち時間が増える", "支所の統合・廃止", "補助金審査や許認可に時間がかかる", "専門職・技術職が不足する", "災害、福祉、建築などの対応余力が小さくなる"], note: "財政再生計画には、事務事業の見直しや組織合理化などの歳出削減策を盛り込むことが想定されています。" },
  ];
  const nonEvents = ["市町村が会社のように清算・消滅する", "住民が自治体の借金を一括して肩代わりする", "住民の預金や財産が没収される", "市職員全員が一斉に解雇される", "警察、消防、学校、福祉が全面停止する", "国が市長や議会を直接置き換える"];
  return <section className="page risk-page">
    <PageIntro eyebrow="FISCAL HEALTH LAW" title="財政が悪いと、どうなる？" text="財政指標が基準を超えたとき、自治体の運営と住民生活がどう変わるのかを、制度と実例から整理します。" />

    <div className="risk-hero">
      <div className="risk-lead"><span>まず、ここだけ押さえよう</span><h2>財政悪化は、<br /><span className="keep-line">「まちの予算の自由」が小さくなることです。</span></h2><p>基準を超えると、赤字の解消や借金返済を優先した立て直しが始まります。自治体が突然なくなったり、翌日からすべてのサービスが止まったりする制度ではありません。</p><p><em>重くなるほど、住民のために新しいことを選べる余地が小さくなります。</em></p></div>
      <div className="risk-flow"><div><small>通常</small><b>毎年チェック</b><p>4つの比率を議会と住民に公表</p></div><i>→</i><div className="yellow"><small>イエロー</small><b>早期健全化</b><p>自治体主導で計画的に立て直す</p></div><i>→</i><div className="red"><small>レッド</small><b>財政再生</b><p>国の強い関与のもとで再生する</p></div></div>
    </div>

    <figure className="risk-visual"><div><span className="eyebrow">VISUAL GUIDE</span><h2>全体像を、1枚で確認する</h2><p>自治体のお金の流れから、早期健全化・財政再生、住民生活への影響までを図解しています。画像を押すと大きく表示できます。</p></div><a href="/fiscal-risk-guide.webp" target="_blank" rel="noreferrer"><img src="/fiscal-risk-guide.webp" alt="財政が悪化した場合の自治体の対応と住民生活への影響をまとめた図解" loading="lazy" decoding="async" /></a><figcaption>※ 実際の対応は、悪化した原因、赤字額、人口、施設数、国・都道府県の支援などによって異なります。</figcaption></figure>

    <div className="risk-key"><span>基準の読み方</span><div><b>この法律の比率は、基本的に高いほど要注意です。</b><p>「基準を下回ると危ない」のではありません。表の基準と同じか、それより高くなると法律上の手続きが始まります。</p></div></div>

    <div className="risk-section-head"><span className="eyebrow">LEGAL THRESHOLDS</span><h2>どの数値でイエロー・レッドになる？</h2><p>イエローは4つの健全化判断比率のうち1つでも基準以上になると対象です。レッドは将来負担比率を除く3つのうち1つでも基準以上になると対象です。赤字比率のイエロー基準に幅があるのは、自治体の財政規模によって計算結果が変わるためです。</p></div>
    <div className="table-card risk-table-card"><div className="table-scroll"><table className="risk-threshold-table"><thead><tr><th>法律上の指標</th><th>意味</th><th>早期健全化基準<br />イエロー</th><th>財政再生基準<br />レッド</th></tr></thead><tbody>{thresholds.map((item) => <tr key={item.name}><td><b>{item.name}</b></td><td>{item.meaning}</td><td className="yellow-cell">{item.yellow}</td><td className="red-cell">{item.red}</td></tr>)}</tbody></table></div></div>
    <p className="risk-table-note">※ 公営企業（水道・下水道など）は、資金不足比率が <b>20%以上</b> になると「経営健全化計画」が必要です。将来負担比率にはレッド基準がありません。</p>

    <div className="risk-section-head"><span className="eyebrow">THE BIG DIFFERENCE</span><h2>早期健全化と財政再生の、大きな違い</h2><p>どちらも計画を作って改善しますが、<b>決定的な違いは「誰が主導し、どこまで自由に予算と借金を決められるか」</b>です。</p></div>
    <div className="risk-outcomes">
      <article className="yellow"><span>イエローカード</span><h2>早期健全化団体</h2><p><b>自治体が自ら立て直す段階です。</b>財政健全化計画を作り、議会の議決を受けて公表します。毎年度の進捗も議会、国または都道府県へ報告します。</p><ul><li>新規事業や公共工事を厳選する</li><li>補助金、イベント、委託事業を見直す</li><li>公共施設を統合・再配置する</li><li>使用料や手数料を見直す</li><li>職員採用、給与、組織を見直す</li></ul><p className="outcome-note">改善が難しい場合は総務大臣や都道府県知事が勧告できますが、基本は自治体主導です。早く回復できれば、市民生活への影響を比較的小さく抑えられる場合もあります。</p></article>
      <article className="red"><span>レッドカード</span><h2>財政再生団体</h2><p><b>自治体だけでは立て直しが難しい段階です。</b>財政再生計画に基づく予算編成が必要となり、総務大臣の同意や地方債の許可など、国の関与が格段に強くなります。</p><ul><li>赤字解消と借金返済を最優先にする</li><li>計画の内容を国と協議する</li><li>地方債の発行が強く制限される</li><li>計画どおりでなければ変更勧告を受ける</li><li>税・料金・施設・人員を広く見直す</li></ul><p className="outcome-note">予算編成権そのものがなくなるわけではありません。ただし、国の監督下で、計画から外れた新しい政策を選びにくい状態になります。</p></article>
    </div>
    <div className="table-card comparison-card"><div className="table-scroll"><table className="comparison-table"><thead><tr><th>制度上の違い</th><th>早期健全化団体</th><th>財政再生団体</th></tr></thead><tbody>{comparisonRows.map((row) => <tr key={row[0]}><td><b>{row[0]}</b></td><td>{row[1]}</td><td>{row[2]}</td></tr>)}</tbody></table></div></div>

    <div className="risk-section-head impact-heading"><span className="eyebrow">FOR DAILY LIFE</span><h2>住民の暮らしに、起こり得ること</h2><p><b>法律が具体的な増税や施設統合を一律に命令するわけではありません。</b>何を見直すかは、悪化の原因と自治体の計画で変わります。ただし、赤字と借金を減らすため、次のような対応が組み合わされる可能性があります。</p></div>
    <div className="impact-grid">{impactAreas.map((area) => <article key={area.number}><header><span>{area.number}</span><h3>{area.title}</h3></header><p className="impact-summary">{area.summary}</p><ul>{area.items.map((item) => <li key={item}>{item}</li>)}</ul><p className="impact-note"><b>注意</b>{area.note}</p></article>)}</div>

    <div className="burden-message"><span>市民にとって本当に重い影響</span><blockquote>高い負担を払いながら、以前より不便な行政サービスを受ける期間が長く続くこと。</blockquote><p>単に税金が少し上がることだけではありません。暮らしの負担増とサービス低下が同時に続き、まちの魅力や将来の選択肢まで小さくなることが大きな問題です。</p></div>

    <div className="risk-section-head"><span className="eyebrow">REAL CASE: YUBARI</span><h2>夕張市で、実際に起きたこと</h2><p>夕張市は全国で唯一の財政再生団体であり、極端な事例です。ただし、財政再生が予算と市民生活にどう現れるかを具体的に示しています。</p></div>
    <div className="yubari-case">
      <div className="case-stat-grid"><div><strong>220<span>人</span> → 88<span>人</span></strong><p>一般職員<br />2006年度 → 2009年度</p></div><div><strong>50<span>%</span></strong><p>存続する施設の<br />使用料引上げ</p></div><div><strong>中学校3<span>校</span> → 1<span>校</span></strong><p>2010年に統合</p></div><div><strong>小学校6<span>校</span> → 1<span>校</span></strong><p>2011年に統合</p></div></div>
      <div className="case-detail"><h3>税・料金・施設・職員を、同時に見直しました</h3><ul><li>市民税、固定資産税、軽自動車税などの引上げ</li><li>施設使用料、下水道料金、証明手数料、検診料の引上げ</li><li>家庭ごみの有料化と徴収の強化</li><li>学校や市の施設の統合・閉鎖</li><li>大量退職と職員削減に伴う、国・北海道などからの職員派遣</li></ul><p><b>夕張市の措置が、ほかの団体にそのまま適用されるわけではありません。</b>赤字額、人口、産業構造、施設数、支援策によって負担の内容は大きく変わります。</p></div>
    </div>
    <div className="case-source-row"><a href="https://www.city.yubari.lg.jp/uploaded/attachment/2308.pdf" target="_blank" rel="noreferrer">夕張市「財政再生計画策定に向けた考え方」↗</a><a href="https://www.city.yubari.lg.jp/uploaded/attachment/2294.pdf" target="_blank" rel="noreferrer">夕張市「財政再生計画の実施状況」↗</a><a href="https://www.city.yubari.lg.jp/uploaded/attachment/1656.pdf" target="_blank" rel="noreferrer">夕張市「学校統合後の交通資料」↗</a><a href="https://dl.ndl.go.jp/view/prepareDownload?contentNo=1&itemId=info%3Andljp%2Fpid%2F11018719" target="_blank" rel="noreferrer">国立国会図書館「地方自治体の財政再建」↗</a></div>

    <div className="risk-section-head"><span className="eyebrow">WHY CASES DIFFER</span><h2>同じ早期健全化でも、対応は同じではない</h2><p><b>基準を超えた原因が違えば、必要な立て直し方も変わります。</b>一般会計の構造的な赤字なのか、病院や下水道なのか、第三セクターなのか、過去の施設整備の借金なのかを見分けることが大切です。</p></div>
    <div className="case-comparison"><article><span>広い見直しをした例</span><h3>大阪府 泉佐野市</h3><p>職員採用・給与・組織、公共事業、補助金、委託契約、市有地売却まで踏み込んだ実施プランを作成しました。一方で、市民サービスへの影響を極力抑え、不可欠な事業を確保する方針も明記しました。</p><a href="https://www.city.izumisano.lg.jp/kakuka/koushitsu/gyozaisei/nemu/kakonokeikakusyu/kakonokeikakusyu/11895.html" target="_blank" rel="noreferrer">泉佐野市の公式資料 ↗</a></article><article><span>原因を絞って改善した例</span><h3>長野県 王滝村</h3><p>主因は村営観光施設事業の借金返済を一般会計が支えていたことでした。企業債の繰上償還を中心に対応し、計画期間内に実質公債費比率を基準未満へ改善しました。</p><a href="https://www.vill.otaki.nagano.jp/aboutus/keikaku/keikaku/zaiseikennzenka_plan.html" target="_blank" rel="noreferrer">王滝村の公式資料 ↗</a></article></div>

    <div className="risk-section-head"><span className="eyebrow">A POSSIBLE SPIRAL</span><h2>長引くと、悪循環になるおそれがあります</h2></div>
    <div className="risk-spiral"><div><b>財政が悪化</b><span>収入より支出が多い</span></div><i>→</i><div><b>サービス縮小</b><span>使えるまちの魅力が下がる</span></div><i>→</i><div><b>人口が減る</b><span>若い世代や企業が流出</span></div><i>→</i><div><b>税収が減る</b><span>使える財源がさらに減る</span></div><i>↺</i></div>

    <div className="non-events"><div><span className="eyebrow">WHAT DOES NOT HAPPEN AUTOMATICALLY</span><h2>自動的には、起きないこと</h2><p><b>自治体そのものは存続します。</b>財政再生の本質は、自治体が消えることではなく、過去の赤字処理を優先するため政策の選択肢が狭くなることです。</p></div><ul>{nonEvents.map((item) => <li key={item}><span>×</span>{item}</li>)}</ul></div>

    <div className="risk-clarifications"><article><h3>経常収支比率が100%を超えたらレッド？</h3><p><b>いいえ。</b> 経常収支比率は重要な注意信号ですが、財政健全化法のイエロー・レッドを直接決める4指標ではありません。</p></article><article><h3>計画に入ったら、必ず全面緊縮？</h3><p><b>一律ではありません。</b> 問題が特定事業に集中していれば、資産売却や繰上償還を中心に改善できる場合もあります。</p></article><article><h3>このアプリだけで正式判定できる？</h3><p><b>できません。</b> 監査を経て各自治体が公表する健全化判断比率と計画を必ず確認してください。</p></article></div>

    <div className="legal-sources"><div><span className="eyebrow">OFFICIAL SOURCES</span><h2>法律・基準・実例の確認先</h2><p>基準と制度は2026年7月22日時点の現行法令を確認しています。実際の判定や対応は、各自治体が監査を経て公表する比率と計画をご確認ください。</p></div><div><a href="https://laws.e-gov.go.jp/law/419AC0000000094" target="_blank" rel="noreferrer">e-Gov「地方公共団体の財政の健全化に関する法律」↗</a><a href="https://laws.e-gov.go.jp/law/419CO0000000397" target="_blank" rel="noreferrer">e-Gov「同法施行令」↗</a><a href="https://www.city.yubari.lg.jp/soshiki/4/1254.html" target="_blank" rel="noreferrer">夕張市「財政再生計画」↗</a></div></div>
  </section>;
}

function Sources({ scope }: { scope: Scope }) {
  const isPrefecture = scope === "prefecture";
  const snapshot = isPrefecture ? prefecturalDataSnapshot : dataSnapshot;
  const entityCount = isPrefecture ? allPrefectures.length : allMunicipalities.length;
  const sourcePage = isPrefecture ? prefecturalDataSourceUrl : "https://www.digital.go.jp/resources/japandashboard/municipal-finance";
  const yearRange = `${years[0]}～${years.at(-1)}年度`;
  const sourceRows = [
    [`地方財政（${isPrefecture ? "都道府県" : "市町村"}ごと）データテーブル`, "デジタル庁・総務省", `指標・歳入歳出・団体基礎情報（${yearRange}）`, snapshot.replaceAll("-", ".")],
    ["健全化判断比率・資金不足比率（確報）", "総務省・e-Stat", `実質赤字比率・連結実質赤字比率（${yearRange}）`, healthRatioSnapshot.replaceAll("-", ".")],
    [isPrefecture ? "都道府県財政力グループ" : "類似団体別市町村財政指数表", "総務省", isPrefecture ? "財政力指数別グループ・平均値" : "正式な類似団体区分・平均値", "年度別"],
    ["地方財政状況調査", "総務省", `${yearRange}決算`, "年度別"],
  ];
  return <section className="page sources-page">
    <PageIntro eyebrow="METHODOLOGY & SOURCES" title="出典・注意" text="数字の出どころ、加工方法、そしてこのツールで言えることの限界を明らかにします。" />
    <div className="demo-banner verified"><span>✓</span><div><b>公式公表データへ接続済みです</b><p>デジタル庁・総務省が公開する{yearRange}の全国{entityCount.toLocaleString()}団体を収録しています。{isPrefecture ? "財政力グループ" : "類似団体区分"}は各年度の公式区分です。</p></div></div>
    <div className="source-grid"><div className="panel source-main"><span className="eyebrow">DATA LINEAGE</span><h2>データソース</h2><div className="source-table">{sourceRows.map((row) => <div key={row[0]}><div><b>{row[0]}</b><small>{row[1]}</small></div><span>{row[2]}</span><em>{row[3]}</em></div>)}</div><div className="source-links"><a className="source-link" href={sourcePage} target="_blank" rel="noreferrer">デジタル庁の公開ページ ↗</a><a className="source-link" href={healthRatioSourceUrl} target="_blank" rel="noreferrer">最新年度の赤字比率公表元 ↗</a></div></div><div className="panel update-card"><span className="eyebrow">DATA SNAPSHOT</span><b>基礎財政データ取得日</b><h2>{snapshot.replaceAll("-", ".")}</h2><p>赤字比率確報：{healthRatioSnapshot.replaceAll("-", ".")}<br />対象年度：{yearRange}<br />対象：全国 {entityCount.toLocaleString()}団体</p><div className="update-status"><i />自動品質検査済み</div></div></div>
    <div className="definitions"><span className="eyebrow">DEFINITIONS</span><h2>指標の定義と見方</h2><div className="definition-grid"><article><span>01</span><h3>財政力指数</h3><p>基準財政収入額 ÷ 基準財政需要額の3か年平均。高いほど自主財源による行政需要への対応力が高い傾向です。</p></article><article><span>02</span><h3>経常収支比率</h3><p>経常経費充当一般財源 ÷ 経常一般財源。高いほど使途の自由な財源に余裕が少ないことを示します。</p></article><article><span>03</span><h3>実質公債費比率</h3><p>公債費等 ÷ 標準財政規模の3か年平均。18%で起債許可団体、25%で早期健全化基準です。</p></article><article><span>04</span><h3>将来負担比率</h3><p>将来負担額 ÷ 標準財政規模。早期健全化基準は{isPrefecture ? "400%" : "市町村350%"}です。充当可能財源が将来負担額を上回る団体は公表値が「－」となり、本ツールでは「負担なし」として集計・順位付けします。</p></article><article><span>05</span><h3>実質赤字比率</h3><p>一般会計等の実質赤字額 ÷ 標準財政規模。赤字がない公表値「－」は「赤字なし」と表示します。</p></article><article><span>06</span><h3>連結実質赤字比率</h3><p>全会計を連結した実質赤字額 ÷ 標準財政規模。赤字がない公表値「－」は「赤字なし」と表示します。</p></article><article><span>07</span><h3>基金残高比率</h3><p>主要3基金の残高 ÷ 標準財政規模。本ツール独自の比較指標で、低いほど備えが薄い傾向です。原子力災害の復興基金などを持つ団体は極端に高くなるため、上位は水準だけで判断せず背景をご確認ください。</p></article><article><span>08</span><h3>歳出の構成比</h3><p>各費目 ÷ 歳出総額。人件費・扶助費は性質別、公債費は目的別の公表値を用いています{isPrefecture ? "。" : "（理由は下記の注記をご覧ください）。"}なお2020年度は特別定額給付金により歳出総額が大きく膨らんでおり、各費目の構成比は前後の年度と単純に比較できません。</p></article></div>{!isPrefecture && <div className="source-caveat"><b>公表データの既知の不整合について</b><p>デジタル庁『地方財政（市町村ごと）』の市区町村版CSVでは、歳出（性質別）の「公債費」欄に目的別の「災害復旧費」の値が入っています（2026-04-24版で8,705件中8,593件が完全一致）。また同ブロックは繰出金などを欠き、歳出総額を再現しません（目的別合計より中央値9.5%小さい）。本ツールでは公債費と分母を目的別の公表値から取ることで、この不整合を回避しています。都道府県版CSVでは同じ問題は生じていません。</p></div>}</div>
    <div className="limits-grid"><article className="can"><span>言えること</span><h3>比較の起点をつくる</h3><ul><li>同じ区分・年度で見た相対的な位置</li><li>複数指標から見た財政構造の特徴</li><li>追加確認が必要な団体の一次選定</li></ul></article><article className="cannot"><span>言えないこと</span><h3>運営の巧拙は断定しない</h3><ul><li>単一指標による財政運営の良し悪し</li><li>公営企業・特別会計を含む全体像</li><li>将来の財政状況の予測・保証</li><li>同値が多い指標での細かい順位差</li></ul></article></div>
    <div className="process"><span className="eyebrow">PROCESS</span><h2>加工フロー</h2><div><span><b>01</b>公表CSV取得</span><i>→</i><span><b>02</b>団体コード・年度結合</span><i>→</i><span><b>03</b>欠損・重複検証</span><i>→</i><span><b>04</b>年度別系列化</span><i>→</i><span><b>05</b>表示用JSON</span></div></div>
  </section>;
}
