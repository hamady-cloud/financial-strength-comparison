"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  allMunicipalities,
  benchmarkFor,
  causeAt,
  compositionAt,
  dataSnapshot,
  formatMetric,
  groupAt,
  indexForYear,
  metricHistory,
  metricValue,
  metrics,
  municipalities,
  populationAt,
  years,
  type MetricKey,
  type Municipality,
} from "./data";

type View = "ranking" | "scatter" | "detail" | "wakayama" | "guide" | "sources";

const nav: { id: View; label: string; index: string }[] = [
  { id: "ranking", label: "全国ランキング", index: "01" },
  { id: "scatter", label: "指標マップ", index: "02" },
  { id: "detail", label: "団体カルテ", index: "03" },
  { id: "wakayama", label: "和歌山ビュー", index: "04" },
  { id: "guide", label: "やさしい指標解説", index: "05" },
  { id: "sources", label: "出典・注意", index: "06" },
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

function DownloadButton({ rows, metric, year }: { rows: Municipality[]; metric: MetricKey; year: number }) {
  function download() {
    const header = ["年度", "団体コード", "団体名", "都道府県", "類似団体区分", metrics[metric].label, "人口"];
    const lines = rows.map((m) => [year, m.code, m.name, m.pref, groupAt(m, year), metricValue(m, metric, year) ?? "", populationAt(m, year)]);
    const csv = "\uFEFF" + [header, ...lines].map((r) => r.join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `municipal-fiscal-${metric}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return <button className="button secondary" onClick={download}><span>↓</span> CSVを出力</button>;
}

export default function Dashboard() {
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
  const [selectedCode, setSelectedCode] = useState("30201");
  const [xMetric, setXMetric] = useState<MetricKey>("ordinaryBalance");
  const [yMetric, setYMetric] = useState<MetricKey>("futureBurden");
  const selected = allMunicipalities.find((m) => m.code === selectedCode) ?? municipalities[0];

  // URL is an external state source; hydrate filters once after the client mounts.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get("view") as View | null;
    const m = params.get("metric") as MetricKey | null;
    if (v && nav.some((n) => n.id === v)) setView(v);
    if (m && metrics[m]) setMetric(m);
    const requestedYear = Number(params.get("year"));
    if (years.includes(requestedYear)) setYear(requestedYear);
    const municipality = params.get("municipality");
    if (municipality && allMunicipalities.some((item) => item.code === municipality)) setSelectedCode(municipality);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("view", view);
    params.set("year", String(year));
    params.set("metric", metric);
    if (view === "detail") params.set("municipality", selectedCode);
    window.history.replaceState(null, "", `?${params.toString()}`);
  }, [view, year, metric, selectedCode]);

  const prefs = useMemo(() => ["すべて", ...Array.from(new Set(allMunicipalities.map((m) => m.pref)))], []);
  const groups = useMemo(() => ["すべて", ...Array.from(new Set(allMunicipalities.map((m) => groupAt(m, year))))], [year]);
  const filtered = useMemo(() => allMunicipalities
    .filter((m) => (pref === "すべて" || m.pref === pref) && (group === "すべて" || groupAt(m, year) === group))
    .filter((m) => populationAt(m, year) >= population && (m.name.includes(search) || m.pref.includes(search)))
    .filter((m) => metricValue(m, metric, year) != null)
    .sort((a, b) => ((metricValue(b, metric, year) ?? 0) - (metricValue(a, metric, year) ?? 0)) * (descending ? 1 : -1)),
  [pref, group, population, search, metric, descending, year]);

  function openDetail(item: Municipality) {
    setSelectedCode(item.code);
    setView("detail");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><span>F</span></div>
          <div><strong>Fiscal Lens</strong><small>市町村財政を、解像する。</small></div>
        </div>
        <nav aria-label="メインナビゲーション">
          {nav.map((item) => (
            <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}>
              <span>{item.index}</span>{item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="status-dot" />
          <div><b>公式データで表示中</b><small>デジタル庁・総務省 2020–2024年度</small></div>
        </div>
        <div className="sidebar-footer">地方財政状況調査ベース<br />データ更新 2026.04.24</div>
      </aside>

      <main>
        <header className="topbar">
          <div className="mobile-brand"><b>Fiscal Lens</b><span>財政ダッシュボード</span></div>
          <div className="year-control"><span>表示年度</span><select value={year} onChange={(e) => { setYear(Number(e.target.value)); setGroup("すべて"); }}>{years.map((y) => <option key={y} value={y}>{y}年度</option>)}</select></div>
          <button className="icon-button" aria-label="共有URLをコピー" onClick={() => navigator.clipboard?.writeText(window.location.href)}>↗</button>
        </header>

        <div className="mobile-nav">{nav.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}>{item.label}</button>)}</div>

        {view === "ranking" && <Ranking rows={filtered} year={year} metric={metric} setMetric={setMetric} pref={pref} setPref={setPref} prefs={prefs} group={group} setGroup={setGroup} groups={groups} population={population} setPopulation={setPopulation} descending={descending} setDescending={setDescending} search={search} setSearch={setSearch} openDetail={openDetail} />}
        {view === "scatter" && <Scatter year={year} xMetric={xMetric} setXMetric={setXMetric} yMetric={yMetric} setYMetric={setYMetric} pref={scatterPref} setPref={setScatterPref} prefs={prefs} search={scatterSearch} setSearch={setScatterSearch} openDetail={openDetail} />}
        {view === "detail" && <Detail year={year} selected={selected} setSelectedCode={setSelectedCode} metric={metric} setMetric={setMetric} />}
        {view === "wakayama" && <Wakayama year={year} openDetail={openDetail} />}
        {view === "guide" && <BeginnerGuide />}
        {view === "sources" && <Sources />}

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
  futureBurden: "将来支払う可能性がある借金などの負担から、基金などを差し引き、自治体の収入規模と比べた指標です。低いほど、将来の負担が小さい傾向があります。",
  fundBalance: "主な基金（自治体の貯金）を収入規模で割った、このツール独自の比較指標です。高いほど、災害や急な支出への備えが厚い傾向があります。",
  personnel: "歳出（性質別）の合計に対して、職員給与などの人件費が占める割合を本ツールで計算したものです。単独で良し悪しを決めず、似た規模の自治体と比べて読みます。",
};

const groupHelp: Record<string, string> = {
  政令指定都市: "人口や行政規模が大きく、都道府県が行う仕事の一部も担う都市です。正式な類似団体区分では1つの区分として扱われます。",
  中核市: "人口規模が比較的大きく、保健所の設置など、一部の行政権限を都道府県から移された都市です。",
  施行時特例市: "地方自治法上の施行時特例市です。正式な類似団体区分では1つの区分として扱われます。",
  特別区: "東京都の23特別区です。正式な類似団体区分では1つの区分として扱われます。",
};

function groupExplanation(group: string) {
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
  rows: Municipality[]; year: number; metric: MetricKey; setMetric: (v: MetricKey) => void; pref: string; setPref: (v: string) => void; prefs: string[];
  group: string; setGroup: (v: string) => void; groups: string[]; population: number; setPopulation: (v: number) => void;
  descending: boolean; setDescending: (v: boolean) => void; search: string; setSearch: (v: string) => void; openDetail: (m: Municipality) => void;
}) {
  const { rows, metric, year } = props;
  const values = rows.map((item) => metricValue(item, metric, year)).filter((value): value is number => value != null).sort((a, b) => a - b);
  const median = values.length ? values[Math.floor(values.length / 2)] : null;
  return <section className="page">
    <PageIntro eyebrow="NATIONAL BENCHMARK" title="全国ランキング" text={`${year}年度の公式値を、正式な類似団体区分とともに比較します。`} action={<DownloadButton rows={rows} metric={metric} year={year} />} />
    <div className="insight-strip">
      <div><small>対象団体</small><strong>{rows.length}<em>団体</em></strong><span>全国収録 {allMunicipalities.length.toLocaleString()}団体</span></div>
      <div><small>中央値</small><strong>{formatMetric(median, metric)}</strong><span>{metrics[metric].label}</span></div>
      <div className="insight"><span className="insight-mark">!</span><p><b>読み方のヒント</b>{metrics[metric].better === "low" ? "値が高い団体ほど、継続的な確認が必要です。" : "値が低い団体ほど、相対的な余力が小さい傾向です。"}</p></div>
    </div>
    <div className="filter-panel">
      <label className="search-filter"><span>団体検索</span><div className="search-field"><span>⌕</span><input value={props.search} onChange={(e) => props.setSearch(e.target.value)} placeholder="団体名・都道府県で検索" /></div></label>
      <label><span>都道府県</span><select value={props.pref} onChange={(e) => props.setPref(e.target.value)}>{props.prefs.map((v) => <option key={v}>{v}</option>)}</select></label>
      <label><span>類似団体区分</span><select value={props.group} onChange={(e) => props.setGroup(e.target.value)}>{props.groups.map((v) => <option key={v}>{v}</option>)}</select></label>
      <label><span>人口下限</span><select value={props.population} onChange={(e) => props.setPopulation(Number(e.target.value))}><option value={0}>指定なし</option><option value={10000}>1万人以上</option><option value={100000}>10万人以上</option><option value={500000}>50万人以上</option></select></label>
      <label><span>表示指標</span><select value={metric} onChange={(e) => props.setMetric(e.target.value as MetricKey)}>{Object.entries(metrics).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
    </div>
    <div className="table-card">
      <div className="table-head"><div><b>{metrics[metric].label}ランキング</b><span>比較条件に該当する団体</span></div><button className="sort-button" onClick={() => props.setDescending(!props.descending)}>{props.descending ? "高い順 ↓" : "低い順 ↑"}</button></div>
      <div className="table-scroll"><table><thead><tr><th>順位</th><th>団体</th><th><span className="header-with-help">類似区分<HelpTip label="類似団体区分" text="人口と産業構造などにより総務省が定める正式な比較グループです。年度ごとの公表区分を表示しています。" compact /></span></th><th>指標値</th><th>類似団体平均との差</th><th>前年度差</th><th>{year - years[0] + 1}年トレンド</th><th /></tr></thead>
        <tbody>{rows.slice(0, 50).map((m, i) => {
          const value = metricValue(m, metric, year); const benchmark = benchmarkFor(m, metric, year); const diff = value != null && benchmark != null ? value - benchmark : null;
          const history = metricHistory(m, metric, year); const previous = history.length > 1 ? history[history.length - 2] : null; const yoy = value != null && previous != null ? value - previous : null;
          const first = history.find((item) => item != null); const good = first != null && value != null && (metrics[metric].better === "low" ? value <= first : value >= first);
          const diffBad = diff != null && (metrics[metric].better === "low" ? diff > 0 : diff < 0); const yoyBad = yoy != null && (metrics[metric].better === "low" ? yoy > 0 : yoy < 0);
          return <tr key={m.code}><td><span className={`rank ${i < 3 ? "top" : ""}`}>{i + 1}</span></td><td><button className="entity" onClick={() => props.openDetail(m)}><b>{m.name}</b><small>{m.pref} · {populationAt(m, year).toLocaleString()}人</small></button></td><td><GroupTag group={groupAt(m, year)} /></td><td><strong>{formatMetric(value, metric)}</strong></td><td>{diff == null ? <span className="no-data">—</span> : <span className={diffBad ? "delta bad" : "delta good"}>{diff > 0 ? "+" : ""}{diff.toFixed(metrics[metric].digits)}{metrics[metric].unit}</span>}</td><td>{yoy == null ? <span className="no-data">—</span> : <span className={yoyBad ? "delta bad" : "delta good"}>{yoy > 0 ? "▲" : "▼"} {Math.abs(yoy).toFixed(metrics[metric].digits)}</span>}</td><td><Trend values={history} good={good} /></td><td><button className="row-arrow" aria-label={`${m.name}の詳細`} onClick={() => props.openDetail(m)}>→</button></td></tr>;
        })}</tbody></table>{rows.length === 0 && <div className="empty">条件に合う団体がありません。フィルタを変更してください。</div>}</div>
    </div>
  </section>;
}

function Scatter({ year, xMetric, setXMetric, yMetric, setYMetric, pref, setPref, prefs, search, setSearch, openDetail }: { year: number; xMetric: MetricKey; setXMetric: (v: MetricKey) => void; yMetric: MetricKey; setYMetric: (v: MetricKey) => void; pref: string; setPref: (v: string) => void; prefs: string[]; search: string; setSearch: (v: string) => void; openDetail: (m: Municipality) => void }) {
  const plotted = allMunicipalities.filter((m) => (pref === "すべて" || m.pref === pref) && metricValue(m, xMetric, year) != null && metricValue(m, yMetric, year) != null);
  const xValues = plotted.map((m) => metricValue(m, xMetric, year) as number); const yValues = plotted.map((m) => metricValue(m, yMetric, year) as number);
  const minX = Math.min(...xValues); const maxX = Math.max(...xValues); const minY = Math.min(...yValues); const maxY = Math.max(...yValues);
  const avgX = xValues.reduce((a, b) => a + b, 0) / xValues.length; const avgY = yValues.reduce((a, b) => a + b, 0) / yValues.length;
  const normalizedSearch = search.trim();
  const match = normalizedSearch ? plotted.find((m) => m.name.includes(normalizedSearch)) : undefined;
  return <section className="page">
    <PageIntro eyebrow="RELATIONSHIP MAP" title="指標マップ" text={`${year}年度の2つの指標を重ね、単一指標では見えない財政構造を捉えます。`} />
    <div className="scatter-layout"><div className="chart-card">
      <div className="chart-toolbar"><label><span>X軸</span><select value={xMetric} onChange={(e) => setXMetric(e.target.value as MetricKey)}>{Object.entries(metrics).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label><span className="cross">×</span><label><span>Y軸</span><select value={yMetric} onChange={(e) => setYMetric(e.target.value as MetricKey)}>{Object.entries(metrics).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label><label><span>都道府県</span><select value={pref} onChange={(e) => setPref(e.target.value)}>{prefs.map((value) => <option key={value}>{value}</option>)}</select></label><label className="search-filter"><span>団体検索</span><div className="search-field compact"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="団体をハイライト" /></div></label></div>
      <div className="scatter-chart">
        <div className="danger-zone"><span>注視ゾーン</span></div><div className="axis-line x" style={{ left: `${((avgX - minX) / (maxX - minX || 1)) * 100}%` }} /><div className="axis-line y" style={{ bottom: `${((avgY - minY) / (maxY - minY || 1)) * 100}%` }} />
        {plotted.map((m) => { const x = metricValue(m, xMetric, year) as number; const y = metricValue(m, yMetric, year) as number; const left = ((x - minX) / (maxX - minX || 1)) * 92 + 4; const bottom = ((y - minY) / (maxY - minY || 1)) * 84 + 7; const highlight = match?.code === m.code; const pointSize = Math.max(9, Math.min(24, Math.sqrt(populationAt(m, year)) / 65)); return <button key={m.code} className={`point ${m.pref === "和歌山県" ? "wakayama" : ""} ${highlight ? "highlight" : ""}`} style={{ left: `${left}%`, bottom: `${bottom}%`, width: `${pointSize}px`, height: `${pointSize}px` }} onClick={() => openDetail(m)} aria-label={`${m.name} ${formatMetric(x, xMetric)} / ${formatMetric(y, yMetric)}`}><span>{m.name}</span></button>; })}
        <div className="axis-label left">{metrics[yMetric].label} →</div><div className="axis-label bottom">{metrics[xMetric].label} →</div>
      </div><div className="legend"><span><i className="dot teal" />和歌山県</span><span><i className="dot navy" />その他</span><span>破線：表示可能団体の平均</span></div>
    </div><aside className="map-insight"><span className="eyebrow">QUICK READ</span><h2>右上ほど、複合的な負担が大きい</h2><p>水準だけでなく、自治体規模・類似団体平均との差・推移をあわせて確認してください。</p><div className="mini-stat"><span>平均 X</span><b>{formatMetric(avgX, xMetric)}</b></div><div className="mini-stat"><span>平均 Y</span><b>{formatMetric(avgY, yMetric)}</b></div><div className="callout"><b>点の大きさ</b><span>住民基本台帳人口</span></div></aside></div>
  </section>;
}

function Detail({ year, selected, setSelectedCode, metric, setMetric }: { year: number; selected: Municipality; setSelectedCode: (v: string) => void; metric: MetricKey; setMetric: (v: MetricKey) => void }) {
  const selectedGroup = groupAt(selected, year);
  const peerRows = allMunicipalities.filter((m) => groupAt(m, year) === selectedGroup);
  const rankedNational = allMunicipalities.filter((m) => metricValue(m, "ordinaryBalance", year) != null).sort((a, b) => (metricValue(a, "ordinaryBalance", year) ?? 0) - (metricValue(b, "ordinaryBalance", year) ?? 0));
  const rankedPref = rankedNational.filter((m) => m.pref === selected.pref);
  const nationalRank = rankedNational.findIndex((m) => m.code === selected.code) + 1;
  const prefRank = rankedPref.findIndex((m) => m.code === selected.code) + 1;
  const cards: MetricKey[] = ["fiscalStrength", "ordinaryBalance", "debtService", "futureBurden", "fundBalance", "personnel"];
  const history = metricHistory(selected, metric, year);
  const availableHistory = history.filter((value): value is number => value != null);
  const historyMin = availableHistory.length ? Math.min(...availableHistory) : 0;
  const historyMax = availableHistory.length ? Math.max(...availableHistory) : 1;
  const composition = compositionAt(selected, year);
  const personnel = composition.personnel ?? 0; const assistance = composition.assistance ?? 0; const debt = composition.debt ?? 0; const other = composition.other ?? 0;
  const donutStyle = { background: `conic-gradient(var(--ink) 0 ${personnel}%, var(--teal) ${personnel}% ${personnel + assistance}%, var(--coral) ${personnel + assistance}% ${personnel + assistance + debt}%, #d8c8a9 ${personnel + assistance + debt}% 100%)` };
  return <section className="page">
    <PageIntro eyebrow="MUNICIPALITY PROFILE" title="団体カルテ" text={`${year}年度の公式値と、2020年度からの指標別推移を表示します。`} />
    <div className="entity-picker"><label><span>対象団体</span><select value={selected.code} onChange={(e) => setSelectedCode(e.target.value)}>{allMunicipalities.map((m) => <option key={m.code} value={m.code}>{m.pref}　{m.name}</option>)}</select></label><div><GroupTag group={selectedGroup} accent /><span>{populationAt(selected, year).toLocaleString()}人</span><span>団体コード {selected.code}</span></div></div>
    <div className="profile-hero"><div><span className="eyebrow">FISCAL SNAPSHOT</span><h2>{selected.name}</h2><p>{selected.pref}における経常収支比率順位 <b>{prefRank > 0 ? `${prefRank}位` : "—"}</b> ／ 全国順位 <b>{nationalRank > 0 ? `${nationalRank}位` : "—"}</b></p></div><div className="cause-badge"><span>歳出（性質別）の最大費目</span><strong>{causeAt(selected, year)}</strong><small>人件費・扶助費・公債費の構成比から判定</small></div></div>
    <div className="metric-grid">{cards.map((key) => { const value = metricValue(selected, key, year); const benchmark = benchmarkFor(selected, key, year); const diff = value != null && benchmark != null ? value - benchmark : null; const isBad = diff != null && (metrics[key].better === "low" ? diff > 0 : diff < 0); return <div className="metric-card" key={key}><div><span>{metrics[key].label}</span><HelpTip label={metrics[key].label} text={metricHelp[key]} /></div><strong>{formatMetric(value, key)}</strong><p className={diff == null ? "no-data" : isBad ? "bad-text" : "good-text"}>{diff == null ? "類似団体平均 —" : `類似団体平均 ${diff > 0 ? "+" : ""}${diff.toFixed(metrics[key].digits)}${metrics[key].unit}`}</p><div className="range"><i style={{ width: value == null ? "0" : `${Math.min(100, Math.max(8, (value / (key === "fiscalStrength" ? 1.8 : key === "futureBurden" ? 280 : 140)) * 100))}%` }} /></div></div>; })}</div>
    <div className="detail-grid"><div className="panel"><div className="panel-title"><div><span className="eyebrow">METRIC-SPECIFIC TREND</span><h3>{metrics[metric].label}の推移</h3></div><select value={metric} onChange={(e) => setMetric(e.target.value as MetricKey)}>{Object.entries(metrics).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div><div className="line-chart"><div className="grid-lines" /><div className="trend-columns">{history.map((value, index) => { const height = value == null ? 3 : 18 + ((value - historyMin) / (historyMax - historyMin || 1)) * 62; return <div key={years[index]}><span className={value == null ? "missing-value" : ""} style={{ bottom: `${height}%` }}>{value == null ? "—" : formatMetric(value, metric)}</span><i className={value == null ? "missing" : ""} style={{ height: `${height}%` }} /><small>{years[index]}</small></div>; })}</div></div></div>
      <div className="panel"><div className="panel-title"><div><span className="eyebrow">EXPENDITURE MIX</span><h3>歳出（性質別）の構成</h3></div></div><div className="composition"><div className="donut" style={donutStyle}><b>{year}</b><span>年度</span></div><div className="composition-list"><p><span><i style={{ background: "#12364a" }} />人件費</span><b>{composition.personnel == null ? "—" : `${personnel.toFixed(1)}%`}</b></p><p><span><i style={{ background: "#1b8a88" }} />扶助費</span><b>{composition.assistance == null ? "—" : `${assistance.toFixed(1)}%`}</b></p><p><span><i style={{ background: "#e1765d" }} />公債費</span><b>{composition.debt == null ? "—" : `${debt.toFixed(1)}%`}</b></p><p><span><i style={{ background: "#d8c8a9" }} />その他</span><b>{composition.other == null ? "—" : `${other.toFixed(1)}%`}</b></p></div></div><div className="cause-note"><b>{causeAt(selected, year)}</b><span>デジタル庁・総務省の歳出（性質別）を構成比に換算しています。</span></div></div></div>
    <div className="table-card compact-table"><div className="table-head"><div><b>類似団体との比較</b><span className="group-summary"><GroupTag group={selectedGroup} />{peerRows.length}団体</span></div></div><div className="table-scroll"><table><thead><tr><th>団体</th><th>財政力指数</th><th>経常収支比率</th><th>実質公債費比率</th><th>基金残高比率</th></tr></thead><tbody>{peerRows.slice(0, 8).map((m) => <tr key={m.code} className={m.code === selected.code ? "selected-row" : ""}><td><b>{m.name}</b></td><td>{formatMetric(metricValue(m, "fiscalStrength", year), "fiscalStrength")}</td><td>{formatMetric(metricValue(m, "ordinaryBalance", year), "ordinaryBalance")}</td><td>{formatMetric(metricValue(m, "debtService", year), "debtService")}</td><td>{formatMetric(metricValue(m, "fundBalance", year), "fundBalance")}</td></tr>)}</tbody></table></div></div>
  </section>;
}

function Wakayama({ year, openDetail }: { year: number; openDetail: (m: Municipality) => void }) {
  const keys: MetricKey[] = ["fiscalStrength", "ordinaryBalance", "debtService", "futureBurden", "fundBalance"];
  const currentIndex = indexForYear(year);
  const changeFromIndex = Math.max(0, currentIndex - 2);
  const changeFor = (item: Municipality) => { const current = item.history.ordinaryBalance[currentIndex]; const previous = item.history.ordinaryBalance[changeFromIndex]; return current != null && previous != null ? current - previous : null; };
  const worst = [...municipalities].filter((item) => changeFor(item) != null).sort((a, b) => (changeFor(b) ?? 0) - (changeFor(a) ?? 0)).slice(0, 4);
  function heatClass(m: Municipality, key: MetricKey) { const vals = municipalities.map((x) => metricValue(x, key, year)).filter((value): value is number => value != null).sort((a, b) => a - b); const value = metricValue(m, key, year); if (value == null) return "heat-none"; const rank = vals.indexOf(value) / Math.max(vals.length, 1); const badness = metrics[key].better === "low" ? rank : 1 - rank; return badness > .72 ? "heat-high" : badness > .38 ? "heat-mid" : "heat-low"; }
  return <section className="page">
    <PageIntro eyebrow="WAKAYAMA FOCUS" title="和歌山ビュー" text={`${year}年度の県内30市町村を正式区分・公式値で見渡します。`} action={<DownloadButton rows={municipalities} metric="ordinaryBalance" year={year} />} />
    <div className="pref-hero"><div><span>和歌山県 · {year}年度</span><h2>30市町村の財政を、一望する。</h2><p>色は県内での相対的な位置を示します。濃い色がただちに「危険」を意味するものではありません。</p></div><div className="pref-stat"><b>30</b><span>municipalities</span></div></div>
    <div className="wakayama-grid"><div className="table-card heatmap-card"><div className="table-head"><div><b>県内ヒートマップ</b><span>各指標の県内分布</span></div><div className="heat-legend"><span>良好</span><i className="heat-low" /><i className="heat-mid" /><i className="heat-high" /><span>注視</span></div></div><div className="table-scroll"><table className="heatmap"><thead><tr><th>団体</th>{keys.map((key) => <th key={key}>{metrics[key].label}</th>)}</tr></thead><tbody>{municipalities.map((m) => <tr key={m.code}><td><div className="heat-entity"><button className="entity" onClick={() => openDetail(m)}><b>{m.name}</b></button><GroupTag group={groupAt(m, year)} /></div></td>{keys.map((key) => <td key={key}><span className={heatClass(m, key)}>{formatMetric(metricValue(m, key, year), key)}</span></td>)}</tr>)}</tbody></table></div></div>
      <aside className="trend-panel"><span className="eyebrow">3-YEAR CHANGE</span><h2>悪化幅の大きい団体</h2><p>経常収支比率が{years[changeFromIndex]}年度から上昇した順</p>{worst.map((m, i) => <button key={m.code} onClick={() => openDetail(m)}><span className="trend-rank">0{i + 1}</span><div><b>{m.name}</b><small>{causeAt(m, year)}</small></div><strong>{(changeFor(m) ?? 0) > 0 ? "+" : ""}{(changeFor(m) ?? 0).toFixed(1)}<em>pt</em></strong></button>)}<div className="trend-note"><b>注目点</b><p>単年度の変化ではなく、費目別の寄与とあわせて確認してください。</p></div></aside></div>
  </section>;
}

function BeginnerGuide() {
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
      low: "低いほど、収入規模に対する将来負担は小さい傾向があります。負担額が基金などを下回る場合は「—」になることもあります。",
      caution: "一般の市町村では350%が早期健全化基準です。政令指定都市などは扱いが異なるため、公式資料も確認します。",
    },
    {
      number: "05",
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
      number: "06",
      name: "歳出（性質別）の構成比",
      question: "支出全体の中で、人件費・福祉・借金返済はどれくらい？",
      simple: "歳出を性質別に分け、人件費、扶助費、公債費などが支出全体に占める割合を見ます。どの種類の支出が大きいかを把握する数字です。",
      formulaTop: "各費目の歳出額",
      formulaBottom: "歳出（性質別）の合計額",
      suffix: "× 100",
      terms: "人件費は職員給与など、扶助費は生活・福祉の支援、公債費は借金返済です。このほか物件費や普通建設事業費などもあります。",
      example: "歳出（性質別）の合計が100億円で、人件費が25億円なら人件費比率は25%。扶助費30%、公債費20%などと分けて支出構造を見ます。",
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
      <div className="guide-lead"><span className="guide-kicker">まず、ここだけ覚えよう</span><h2>市町村の財政は、<br />「まちの大きな家計簿」です。</h2><p>市町村は、<strong>税金や国からのお金</strong>を受け取り、学校、道路、ごみ収集、消防、福祉などに使います。</p><p><em>普通の家計と違い、利益を出すことが目的ではありません。</em><br />住民に必要なサービスを続けながら、急な災害や将来の負担にも備える必要があります。</p></div>
      <div className="household-map"><div><span>まちの収入</span><b>税金・地方交付税など</b><small>家計なら「給料」に近い</small></div><i>→</i><div><span>まちの支出</span><b>教育・福祉・道路など</b><small>家計なら「生活費」に近い</small></div><i>＋</i><div><span>将来への備え</span><b>基金・借金の管理</b><small>家計なら「貯金とローン」</small></div></div>
    </div>

    <div className="guide-warning"><span>大切</span><p><b>1つの数字だけで「良いまち・悪いまち」と決めないでください。</b>人口、産業、年齢構成、面積、必要な公共施設などで数字は変わります。「似た自治体との比較」「数年間の変化」「高くなった理由」の3つを合わせて読みます。</p></div>

    <div className="reading-guide"><span className="eyebrow">HOW TO READ</span><h2>数字を見る4つの順番</h2><div><article><b>1</b><h3>同じ条件で比べる</h3><p>まず類似団体平均との差を見ます。人口の違う大都市と小さな町を、そのまま比べないためです。</p></article><article><b>2</b><h3>数年の流れを見る</h3><p>1年だけの上昇・低下に慌てず、3年・5年と続く変化かを確認します。</p></article><article><b>3</b><h3>複数の数字を組み合わせる</h3><p>借金が多くても基金が厚い場合があります。負担・余力・貯金をセットで見ます。</p></article><article><b>4</b><h3>理由を調べる</h3><p>高齢化、災害復旧、施設整備など、数字が動いた背景を決算資料で確認します。</p></article></div></div>

    <div className="guide-section-head"><span className="eyebrow">SIX KEY METRICS</span><h2>6つの数字を、ひとつずつ理解する</h2><p>計算式は理解しやすい形に簡略化しています。実際の公式計算では、法令に基づく控除や調整が加わる場合があります。</p></div>

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

function Sources() {
  const sourceRows = [
    ["地方財政（市町村ごと）データテーブル", "デジタル庁・総務省", "指標・歳入歳出・団体基礎情報", "2026.04.24"],
    ["類似団体別市町村財政指数表", "総務省", "正式な類似団体区分・平均値", "年度別"],
    ["地方財政状況調査", "総務省", "2020～2024年度決算", "年度別"],
  ];
  return <section className="page sources-page">
    <PageIntro eyebrow="METHODOLOGY & SOURCES" title="出典・注意" text="数字の出どころ、加工方法、そしてこのツールで言えることの限界を明らかにします。" />
    <div className="demo-banner verified"><span>✓</span><div><b>公式公表データへ接続済みです</b><p>デジタル庁・総務省が公開する2020～2024年度の全国1,741団体を収録しています。類似団体区分は各年度の正式区分です。</p></div></div>
    <div className="source-grid"><div className="panel source-main"><span className="eyebrow">DATA LINEAGE</span><h2>データソース</h2><div className="source-table">{sourceRows.map((row) => <div key={row[0]}><div><b>{row[0]}</b><small>{row[1]}</small></div><span>{row[2]}</span><em>{row[3]}</em></div>)}</div><a className="source-link" href="https://www.digital.go.jp/resources/japandashboard/municipal-finance" target="_blank" rel="noreferrer">デジタル庁の公開ページを確認 ↗</a></div><div className="panel update-card"><span className="eyebrow">DATA SNAPSHOT</span><b>公開データ取得日</b><h2>{dataSnapshot.replaceAll("-", ".")}</h2><p>対象年度：2020～2024<br />対象：全国 {allMunicipalities.length.toLocaleString()}団体</p><div className="update-status"><i />公式スナップショット</div></div></div>
    <div className="definitions"><span className="eyebrow">DEFINITIONS</span><h2>指標の定義と見方</h2><div className="definition-grid"><article><span>01</span><h3>財政力指数</h3><p>基準財政収入額 ÷ 基準財政需要額の3か年平均。高いほど自主財源による行政需要への対応力が高い傾向です。</p></article><article><span>02</span><h3>経常収支比率</h3><p>経常経費充当一般財源 ÷ 経常一般財源。高いほど使途の自由な財源に余裕が少ないことを示します。</p></article><article><span>03</span><h3>実質公債費比率</h3><p>公債費等 ÷ 標準財政規模の3か年平均。18%で起債許可団体、25%で早期健全化基準です。</p></article><article><span>04</span><h3>将来負担比率</h3><p>将来負担額 ÷ 標準財政規模。市町村の早期健全化基準は350%です。</p></article><article><span>05</span><h3>基金残高比率</h3><p>主要3基金の残高 ÷ 標準財政規模。本ツール独自の比較指標で、低いほど備えが薄い傾向です。</p></article></div></div>
    <div className="limits-grid"><article className="can"><span>言えること</span><h3>比較の起点をつくる</h3><ul><li>同じ区分・年度で見た相対的な位置</li><li>複数指標から見た財政構造の特徴</li><li>追加確認が必要な団体の一次選定</li></ul></article><article className="cannot"><span>言えないこと</span><h3>運営の巧拙は断定しない</h3><ul><li>単一指標による財政運営の良し悪し</li><li>公営企業・特別会計を含む全体像</li><li>将来の財政状況の予測・保証</li></ul></article></div>
    <div className="process"><span className="eyebrow">PROCESS</span><h2>加工フロー</h2><div><span><b>01</b>公表CSV取得</span><i>→</i><span><b>02</b>団体コード・年度結合</span><i>→</i><span><b>03</b>欠損・重複検証</span><i>→</i><span><b>04</b>年度別系列化</span><i>→</i><span><b>05</b>表示用JSON</span></div></div>
  </section>;
}
