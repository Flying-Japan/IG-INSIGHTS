/* ── IG 인사이트 대시보드 ── */

// ── Utilities ──
const fmt = n => n == null ? '-' : n.toLocaleString('ko-KR');
const fmtPct = n => n == null ? '-' : n.toFixed(1) + '%';
const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
const sum = arr => arr.reduce((a, b) => a + (b || 0), 0);
const chartColors = {
  accent: '#F77737', accent2: '#833AB4', blue: '#448aff',
  green: '#00c853', red: '#ff5252', yellow: '#ffd600',
  orange: '#ff9100', purple: '#7c4dff', pink: '#e91e63',
};
const typeLabel = t => ({ 'CAROUSEL_ALBUM': '캐러셀', 'VIDEO': '릴스', 'IMAGE': '이미지' }[t] || t);
const chartTheme = {
  chart: { background: 'transparent', foreColor: '#9499b3', fontFamily: 'Noto Sans KR, sans-serif' },
  grid: { borderColor: '#2e3247', strokeDashArray: 3 },
  tooltip: { theme: 'dark' },
};

// ── Daily Change Helpers ──
function getDailyChange(daily, field) {
  if (!daily || daily.length < 2) return null;
  const today = daily[daily.length - 1];
  const yesterday = daily[daily.length - 2];
  const cur = today[field], prev = yesterday[field];
  if (cur == null || prev == null) return null;
  return { change: cur - prev, prev };
}
function changeBadge(changeObj, isRate = false) {
  if (!changeObj) return '';
  const { change } = changeObj;
  if (change === 0) return '';
  const sign = change >= 0 ? '+' : '';
  const val = isRate ? (sign + change.toFixed(1) + '%p') : (sign + fmt(change));
  const cls = change >= 0 ? 'positive' : 'negative';
  return ` <span class="kpi-change ${cls}">${val}</span>`;
}

// ── Data Store ──
let DATA = { posts: [], followers: [], daily: [], meta: {}, postsYesterday: [] };

// ── Init ──
async function init() {
  try {
    const [posts, followers, daily, meta, postsYesterday] = await Promise.all([
      fetch('data/posts.json').then(r => r.json()),
      fetch('data/followers.json').then(r => r.json()),
      fetch('data/daily_report.json').then(r => r.json()),
      fetch('data/meta.json').then(r => r.json()),
      fetch('data/posts_yesterday.json').then(r => r.ok ? r.json() : []).catch(() => []),
    ]);
    DATA = { posts, followers, daily, meta, postsYesterday };
    document.getElementById('update-time').textContent = '업데이트: ' + meta.updated_at_ko;
    document.getElementById('loading').classList.add('hidden');

    setupTabs();
    renderOverview();
    renderPostTable();
    renderFollowers();
    renderCategory();
    renderContent();
  } catch (e) {
    document.getElementById('loading').innerHTML = '<p>데이터 로딩 실패: ' + e.message + '</p>';
  }
}

// ── Tab Navigation ──
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      // Resize charts on tab switch
      window.dispatchEvent(new Event('resize'));
    });
  });
}

// ══════════════════════════════════════════════════
// TAB 1: Overview
// ══════════════════════════════════════════════════
function renderOverview() {
  const { posts, followers, daily } = DATA;

  // KPIs
  document.getElementById('kpi-posts').textContent = fmt(posts.length);

  const latestFollowers = followers.length ? followers[followers.length - 1].followers : null;
  document.getElementById('kpi-followers').textContent = fmt(latestFollowers);
  if (followers.length >= 2) {
    const change = (followers[followers.length - 1].followers || 0) - (followers[followers.length - 2].followers || 0);
    const el = document.getElementById('kpi-followers-change');
    el.textContent = (change >= 0 ? '+' : '') + fmt(change) + ' (전일 대비)';
    el.className = 'kpi-sub ' + (change >= 0 ? 'positive' : 'negative');
  }

  const engRates = posts.map(p => p.engagement_rate).filter(v => v != null);
  document.getElementById('kpi-engagement').innerHTML = fmtPct(avg(engRates)) + changeBadge(getDailyChange(daily, 'avg_engagement_rate'), true);

  const reaches = posts.map(p => p.reach).filter(v => v != null);
  const avgReachVal = Math.round(avg(reaches));
  const avgReachChange = daily.length >= 2 ? (() => {
    const d1 = daily[daily.length - 1], d0 = daily[daily.length - 2];
    if (d1.total_reach && d1.post_count && d0.total_reach && d0.post_count) {
      return { change: Math.round(d1.total_reach / d1.post_count - d0.total_reach / d0.post_count) };
    }
    return null;
  })() : null;
  document.getElementById('kpi-reach').innerHTML = fmt(avgReachVal) + changeBadge(avgReachChange);

  const totalLikes = sum(posts.map(p => p.likes));
  document.getElementById('kpi-likes').innerHTML = fmt(totalLikes) + changeBadge(getDailyChange(daily, 'total_likes'));

  const top = posts.find(p => p.rank === 1);
  document.getElementById('kpi-top').textContent = top ? top.title : '-';

  // Total stats with daily changes
  document.getElementById('kpi-total-reach').innerHTML = fmt(sum(posts.map(p => p.reach))) + changeBadge(getDailyChange(daily, 'total_reach'));
  document.getElementById('kpi-total-views').innerHTML = fmt(sum(posts.map(p => p.views))) + changeBadge(getDailyChange(daily, 'total_views'));
  document.getElementById('kpi-total-likes').innerHTML = fmt(sum(posts.map(p => p.likes))) + changeBadge(getDailyChange(daily, 'total_likes'));
  document.getElementById('kpi-total-saves').innerHTML = fmt(sum(posts.map(p => p.saves))) + changeBadge(getDailyChange(daily, 'total_saves'));
  document.getElementById('kpi-total-shares').innerHTML = fmt(sum(posts.map(p => p.shares))) + changeBadge(getDailyChange(daily, 'total_shares'));
  document.getElementById('kpi-total-comments').innerHTML = fmt(sum(posts.map(p => p.comments))) + changeBadge(getDailyChange(daily, 'total_comments'));
  const totalEngagement = sum(posts.map(p => (p.likes || 0) + (p.saves || 0) + (p.shares || 0) + (p.comments || 0)));
  document.getElementById('kpi-total-engagement').innerHTML = fmt(totalEngagement) + changeBadge(getDailyChange(daily, 'total_engagement'));

  // Follower trend chart (last 30 days from daily report or follower data)
  if (followers.length > 0) {
    new ApexCharts(document.getElementById('chart-follower-trend'), {
      ...chartTheme,
      series: [{ name: '팔로워', data: followers.map(f => f.followers) }],
      chart: { ...chartTheme.chart, type: 'area', height: 250 },
      xaxis: { categories: followers.map(f => f.date.replace(/\(.\)$/, '')), labels: { style: { fontSize: '11px' } } },
      yaxis: { labels: { formatter: v => fmt(v) } },
      stroke: { curve: 'smooth', width: 2 },
      fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05 } },
      colors: [chartColors.accent],
      grid: chartTheme.grid,
      tooltip: { ...chartTheme.tooltip, y: { formatter: v => fmt(v) + '명' } },
    }).render();
  }

  // Content type distribution donut
  const typeCounts = {};
  posts.forEach(p => { typeCounts[p.media_type] = (typeCounts[p.media_type] || 0) + 1; });
  new ApexCharts(document.getElementById('chart-type-dist'), {
    ...chartTheme,
    series: Object.values(typeCounts),
    chart: { ...chartTheme.chart, type: 'donut', height: 250 },
    labels: Object.keys(typeCounts).map(typeLabel),
    colors: [chartColors.accent, chartColors.blue, chartColors.green, chartColors.yellow],
    legend: { position: 'bottom', labels: { colors: '#9499b3' } },
    plotOptions: { pie: { donut: { size: '55%' } } },
  }).render();

  // Daily reach & engagement
  if (daily.length > 0) {
    new ApexCharts(document.getElementById('chart-daily-reach'), {
      ...chartTheme,
      series: [
        { name: '총 도달', data: daily.map(d => d.total_reach) },
        { name: '총 참여', data: daily.map(d => d.total_engagement) },
      ],
      chart: { ...chartTheme.chart, type: 'bar', height: 280 },
      xaxis: { categories: daily.map(d => d.date.replace(/\(.\)$/, '')), labels: { style: { fontSize: '11px' } } },
      yaxis: { labels: { formatter: v => fmt(v) } },
      colors: [chartColors.blue, chartColors.green],
      plotOptions: { bar: { borderRadius: 4, columnWidth: '60%' } },
      grid: chartTheme.grid,
      tooltip: { ...chartTheme.tooltip, y: { formatter: v => fmt(v) } },
    }).render();
  }

  // ── Marketer KPIs ──
  const saveRates = posts.map(p => p.save_rate).filter(v => v != null);
  const shareRates = posts.map(p => p.share_rate).filter(v => v != null);
  document.getElementById('kpi-avg-save-rate').innerHTML = fmtPct(avg(saveRates)) + changeBadge(getDailyChange(daily, 'avg_save_rate'), true);
  document.getElementById('kpi-avg-share-rate').innerHTML = fmtPct(avg(shareRates)) + changeBadge(getDailyChange(daily, 'avg_share_rate'), true);

  const avgEngPerPost = posts.length ? Math.round(sum(posts.map(p => (p.likes||0)+(p.saves||0)+(p.shares||0)+(p.comments||0))) / posts.length) : 0;
  const engPerPostChange = daily.length >= 2 ? (() => {
    const d1 = daily[daily.length - 1], d0 = daily[daily.length - 2];
    if (d1.total_engagement && d1.post_count && d0.total_engagement && d0.post_count) {
      return { change: Math.round(d1.total_engagement / d1.post_count - d0.total_engagement / d0.post_count) };
    }
    return null;
  })() : null;
  document.getElementById('kpi-avg-engagement-per-post').innerHTML = fmt(avgEngPerPost) + changeBadge(engPerPostChange);

  const reachRate = latestFollowers ? (avg(reaches) / latestFollowers * 100) : 0;
  document.getElementById('kpi-reach-rate').textContent = fmtPct(reachRate);

  // ── Day of Week chart ──
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const dayMap = {};
  dayNames.forEach(d => { dayMap[d] = { reach: [], eng: [], saves: [], count: 0 }; });
  posts.forEach(p => {
    const m = p.upload_date.match(/\((.)\)/);
    if (m && dayMap[m[1]]) {
      const d = dayMap[m[1]];
      d.count++;
      if (p.reach) d.reach.push(p.reach);
      if (p.engagement_rate) d.eng.push(p.engagement_rate);
      if (p.saves) d.saves.push(p.saves);
    }
  });
  const dayStats = dayNames.map(d => ({
    day: d, count: dayMap[d].count,
    avgReach: avg(dayMap[d].reach), avgEng: avg(dayMap[d].eng), avgSaves: avg(dayMap[d].saves),
  }));

  new ApexCharts(document.getElementById('chart-day-of-week'), {
    ...chartTheme,
    series: [
      { name: '평균 도달', data: dayStats.map(d => Math.round(d.avgReach)) },
      { name: '평균 저장', data: dayStats.map(d => Math.round(d.avgSaves)) },
    ],
    chart: { ...chartTheme.chart, type: 'bar', height: 280 },
    xaxis: { categories: dayStats.map(d => d.day + '요일 (' + d.count + '개)') },
    yaxis: [
      { title: { text: '도달', style: { color: '#9499b3' } }, labels: { formatter: v => fmt(v) } },
      { opposite: true, title: { text: '저장', style: { color: '#9499b3' } }, labels: { formatter: v => fmt(v) } },
    ],
    colors: [chartColors.blue, chartColors.green],
    plotOptions: { bar: { borderRadius: 3, columnWidth: '55%' } },
    grid: chartTheme.grid,
    tooltip: { ...chartTheme.tooltip, y: { formatter: v => fmt(v) } },
  }).render();

  // ── Carousel vs Reels comparison ──
  const typeCompare = {};
  posts.forEach(p => {
    const t = p.media_type || 'OTHER';
    if (!typeCompare[t]) typeCompare[t] = { reach: [], eng: [], saves: [], shares: [], saveRate: [], shareRate: [] };
    const tc = typeCompare[t];
    if (p.reach) tc.reach.push(p.reach);
    if (p.engagement_rate) tc.eng.push(p.engagement_rate);
    if (p.saves) tc.saves.push(p.saves);
    if (p.shares) tc.shares.push(p.shares);
    if (p.save_rate) tc.saveRate.push(p.save_rate);
    if (p.share_rate) tc.shareRate.push(p.share_rate);
  });
  const tcLabels = Object.keys(typeCompare).map(typeLabel);
  const tcKeys = Object.keys(typeCompare);

  new ApexCharts(document.getElementById('chart-type-compare'), {
    ...chartTheme,
    series: [
      { name: '평균 참여율', data: tcKeys.map(k => +avg(typeCompare[k].eng).toFixed(1)) },
      { name: '평균 저장율', data: tcKeys.map(k => +avg(typeCompare[k].saveRate).toFixed(1)) },
      { name: '평균 공유율', data: tcKeys.map(k => +avg(typeCompare[k].shareRate).toFixed(1)) },
    ],
    chart: { ...chartTheme.chart, type: 'bar', height: 280 },
    xaxis: { categories: tcLabels },
    yaxis: { labels: { formatter: v => v + '%' } },
    colors: [chartColors.accent, chartColors.green, chartColors.orange],
    plotOptions: { bar: { borderRadius: 3, columnWidth: '50%' } },
    grid: chartTheme.grid,
    tooltip: { ...chartTheme.tooltip, y: { formatter: v => v + '%' } },
  }).render();
}

// ══════════════════════════════════════════════════
// TAB 2: Post Table
// ══════════════════════════════════════════════════
let postTable = null;
let currentSortField = 'rank';
let yesterdayMap = new Map();

// Build yesterday lookup map
function buildYesterdayMap() {
  yesterdayMap = new Map();
  (DATA.postsYesterday || []).forEach(p => {
    const key = p.url || p.title;
    if (key) yesterdayMap.set(key, p);
  });
}

// Format cell with change
function fmtWithChange(value, field, row) {
  if (value == null) return '-';
  const key = row.url || row.title;
  const prev = yesterdayMap.get(key);
  let html = fmt(value);
  if (prev && prev[field] != null) {
    const diff = value - prev[field];
    if (diff !== 0) {
      const sign = diff > 0 ? '+' : '';
      const cls = diff > 0 ? 'positive' : 'negative';
      html += ` <span class="cell-change ${cls}">(${sign}${fmt(diff)})</span>`;
    }
  }
  return html;
}

// Column definitions factory
const colDef = {
  rank:       () => ({ title: '순위', field: '_rank', width: 60, hozAlign: 'center', sorter: 'number' }),
  upload_date:() => ({ title: '업로드일', field: 'upload_date', width: 110, sorter: 'string' }),
  media_type: () => ({ title: '유형', field: 'media_type', width: 80, hozAlign: 'center', formatter: cell => typeLabel(cell.getValue()) }),
  category:   () => ({ title: '카테고리', field: 'category', width: 90, hozAlign: 'center' }),
  title:      () => ({ title: '제목', field: 'title', minWidth: 180,
    formatter: cell => {
      const row = cell.getRow().getData();
      return row.url ? `<a href="${row.url}" target="_blank" style="color:#F77737;text-decoration:none">${cell.getValue()}</a>` : cell.getValue();
    }}),
  reach:      () => ({ title: '도달', field: 'reach', width: 100, hozAlign: 'right', sorter: 'number',
    formatter: cell => fmtWithChange(cell.getValue(), 'reach', cell.getRow().getData()) }),
  views:      () => ({ title: '조회수', field: 'views', width: 100, hozAlign: 'right', sorter: 'number',
    formatter: cell => fmtWithChange(cell.getValue(), 'views', cell.getRow().getData()) }),
  likes:      () => ({ title: '좋아요', field: 'likes', width: 90, hozAlign: 'right', sorter: 'number',
    formatter: cell => fmtWithChange(cell.getValue(), 'likes', cell.getRow().getData()) }),
  saves:      () => ({ title: '저장', field: 'saves', width: 85, hozAlign: 'right', sorter: 'number',
    formatter: cell => fmtWithChange(cell.getValue(), 'saves', cell.getRow().getData()) }),
  shares:     () => ({ title: '공유', field: 'shares', width: 85, hozAlign: 'right', sorter: 'number',
    formatter: cell => fmtWithChange(cell.getValue(), 'shares', cell.getRow().getData()) }),
  comments:   () => ({ title: '댓글', field: 'comments', width: 80, hozAlign: 'right', sorter: 'number',
    formatter: cell => fmtWithChange(cell.getValue(), 'comments', cell.getRow().getData()) }),
  engagement_rate: () => ({ title: '참여율', field: 'engagement_rate', width: 95, hozAlign: 'right', sorter: 'number',
    formatter: cell => {
      const v = cell.getValue();
      if (v == null) return '-';
      const color = v >= 5 ? '#00c853' : v >= 3 ? '#ffd600' : '#9499b3';
      const row = cell.getRow().getData();
      const key = row.url || row.title;
      const prev = yesterdayMap.get(key);
      let changeHtml = '';
      if (prev && prev.engagement_rate != null) {
        const diff = v - prev.engagement_rate;
        if (diff !== 0) {
          const sign = diff > 0 ? '+' : '';
          const cls = diff > 0 ? 'positive' : 'negative';
          changeHtml = ` <span class="cell-change ${cls}">(${sign}${diff.toFixed(1)})</span>`;
        }
      }
      return `<span style="color:${color}">${v.toFixed(1)}%</span>${changeHtml}`;
    }}),
  composite_score: () => ({ title: '점수', field: 'composite_score', width: 65, hozAlign: 'right', sorter: 'number',
    formatter: cell => { const v = cell.getValue(); return v != null ? v.toFixed(1) : '-'; }}),
};

// Default column order
const defaultOrder = ['rank','upload_date','media_type','category','title','reach','views','likes','saves','shares','comments','engagement_rate','composite_score'];

// Build columns with the sort-target field moved right after title
function buildColumns(sortField) {
  const order = [...defaultOrder];
  const metricsFields = ['reach','views','likes','saves','shares','comments','engagement_rate'];
  if (metricsFields.includes(sortField)) {
    const idx = order.indexOf(sortField);
    const titleIdx = order.indexOf('title');
    if (idx > titleIdx + 1) {
      order.splice(idx, 1);
      order.splice(titleIdx + 1, 0, sortField); // right after title
    }
  }
  return order.map(key => colDef[key]());
}

// Recalculate rank based on sort field
function recalcRankedData(posts, sortField, sortDir) {
  const sorted = [...posts];
  if (sortField === 'rank') {
    // Use original composite rank
    sorted.sort((a, b) => (a.rank || 999) - (b.rank || 999));
  } else if (sortField === 'upload_date') {
    sorted.sort((a, b) => sortDir === 'desc' ? b.upload_date.localeCompare(a.upload_date) : a.upload_date.localeCompare(b.upload_date));
  } else {
    sorted.sort((a, b) => sortDir === 'desc' ? (b[sortField] || 0) - (a[sortField] || 0) : (a[sortField] || 0) - (b[sortField] || 0));
  }
  return sorted.map((p, i) => ({ ...p, _rank: i + 1 }));
}

function renderPostTable() {
  const { posts } = DATA;
  buildYesterdayMap();

  // Populate category filter
  const categories = [...new Set(posts.map(p => p.category).filter(Boolean))].sort();
  const catSelect = document.getElementById('filter-category');
  categories.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    catSelect.appendChild(opt);
  });

  // Initial data with original rank
  const initialData = recalcRankedData(posts, 'rank', 'asc');

  postTable = new Tabulator('#post-table', {
    data: initialData,
    layout: 'fitColumns',
    height: '600px',
    pagination: false,
    columns: buildColumns('rank'),
  });

  // Row click → diagnosis modal
  postTable.on('rowClick', (e, row) => {
    if (e.target.tagName === 'A') return; // don't intercept link clicks
    showPostModal(row.getData());
  });

  // Sort dropdown handler
  document.getElementById('sort-select').addEventListener('change', function() {
    const [field, dir] = this.value.split('|');
    currentSortField = field;
    const rankedData = recalcRankedData(DATA.posts, field, dir);
    postTable.setColumns(buildColumns(field));
    postTable.replaceData(rankedData);
    // Re-apply active filters
    applyFilters();
  });

  // Filters
  document.getElementById('filter-category').addEventListener('change', applyFilters);
  document.getElementById('filter-type').addEventListener('change', applyFilters);
  document.getElementById('filter-search').addEventListener('input', applyFilters);
}

function applyFilters() {
  const cat = document.getElementById('filter-category').value;
  const type = document.getElementById('filter-type').value;
  const search = document.getElementById('filter-search').value.toLowerCase();

  const filters = [];
  if (cat) filters.push({ field: 'category', type: '=', value: cat });
  if (type) filters.push({ field: 'media_type', type: '=', value: type });
  if (search) filters.push({ field: 'title', type: 'like', value: search });

  postTable.setFilter(filters);
}

// ══════════════════════════════════════════════════
// TAB 3: Followers
// ══════════════════════════════════════════════════
function renderFollowers() {
  const { followers } = DATA;
  if (!followers.length) return;

  const latest = followers[followers.length - 1];
  const first = followers[0];
  const totalGrowth = (latest.followers || 0) - (first.followers || 0);
  const avgGrowth = followers.length > 1 ? totalGrowth / (followers.length - 1) : 0;

  document.getElementById('kpi-total-growth').textContent = (totalGrowth >= 0 ? '+' : '') + fmt(totalGrowth);
  document.getElementById('kpi-avg-growth').textContent = (avgGrowth >= 0 ? '+' : '') + avgGrowth.toFixed(1) + '/일';
  document.getElementById('kpi-current-followers').textContent = fmt(latest.followers);

  // Calculate daily changes
  const changes = followers.map((f, i) => {
    if (i === 0) return { date: f.date, change: 0 };
    const change = (f.followers || 0) - (followers[i - 1].followers || 0);
    return { date: f.date, change };
  });

  const best = changes.reduce((a, b) => (b.change > a.change ? b : a), changes[0]);
  document.getElementById('kpi-best-day').textContent = best.date + ' (+' + fmt(best.change) + ')';

  // Full follower chart
  new ApexCharts(document.getElementById('chart-follower-full'), {
    ...chartTheme,
    series: [{ name: '팔로워', data: followers.map(f => f.followers) }],
    chart: { ...chartTheme.chart, type: 'area', height: 300 },
    xaxis: { categories: followers.map(f => f.date.replace(/\(.\)$/, '')), labels: { style: { fontSize: '11px' } } },
    yaxis: { labels: { formatter: v => fmt(v) } },
    stroke: { curve: 'smooth', width: 2 },
    fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05 } },
    colors: [chartColors.accent2],
    grid: chartTheme.grid,
    tooltip: { ...chartTheme.tooltip, y: { formatter: v => fmt(v) + '명' } },
  }).render();

  // Daily change bar chart
  new ApexCharts(document.getElementById('chart-follower-change'), {
    ...chartTheme,
    series: [{ name: '변화', data: changes.slice(1).map(c => c.change) }],
    chart: { ...chartTheme.chart, type: 'bar', height: 250 },
    xaxis: { categories: changes.slice(1).map(c => c.date.replace(/\(.\)$/, '')), labels: { style: { fontSize: '11px' } } },
    colors: [chartColors.green],
    plotOptions: {
      bar: {
        borderRadius: 3,
        colors: {
          ranges: [{ from: -1000, to: -1, color: chartColors.red }, { from: 0, to: 10000, color: chartColors.green }],
        },
      },
    },
    grid: chartTheme.grid,
    tooltip: { ...chartTheme.tooltip, y: { formatter: v => (v >= 0 ? '+' : '') + fmt(v) + '명' } },
  }).render();
}

// ══════════════════════════════════════════════════
// TAB 4: Category Analysis
// ══════════════════════════════════════════════════
function renderCategory() {
  const { posts } = DATA;
  const catMap = {};
  posts.forEach(p => {
    const c = p.category || '기타';
    if (!catMap[c]) catMap[c] = [];
    catMap[c].push(p);
  });

  const catStats = Object.entries(catMap).map(([cat, items]) => ({
    category: cat,
    count: items.length,
    avgEngagement: avg(items.map(p => p.engagement_rate).filter(v => v != null)),
    avgReach: avg(items.map(p => p.reach).filter(v => v != null)),
    avgSaves: avg(items.map(p => p.saves).filter(v => v != null)),
    avgShares: avg(items.map(p => p.shares).filter(v => v != null)),
    avgScore: avg(items.map(p => p.composite_score).filter(v => v != null)),
  })).sort((a, b) => b.avgEngagement - a.avgEngagement);

  // Insights
  const best = catStats[0];
  const bestReach = [...catStats].sort((a, b) => b.avgReach - a.avgReach)[0];
  const bestSave = [...catStats].sort((a, b) => b.avgSaves - a.avgSaves)[0];
  document.getElementById('category-insights').innerHTML =
    `<div class="insight-item">` +
    `<strong>${best.category}</strong> 카테고리의 평균 참여율이 ${best.avgEngagement.toFixed(1)}%로 가장 높습니다.<br>` +
    `<strong>${bestReach.category}</strong> 카테고리의 평균 도달이 ${fmt(Math.round(bestReach.avgReach))}으로 가장 넓습니다.<br>` +
    `<strong>${bestSave.category}</strong> 카테고리의 평균 저장수가 ${fmt(Math.round(bestSave.avgSaves))}으로 가장 높습니다.` +
    `</div>`;

  // Engagement bar chart
  new ApexCharts(document.getElementById('chart-cat-engagement'), {
    ...chartTheme,
    series: [{ name: '평균 참여율', data: catStats.map(c => +c.avgEngagement.toFixed(1)) }],
    chart: { ...chartTheme.chart, type: 'bar', height: 300 },
    xaxis: { categories: catStats.map(c => c.category), labels: { style: { fontSize: '12px' } } },
    yaxis: { labels: { formatter: v => v + '%' } },
    colors: [chartColors.accent],
    plotOptions: { bar: { borderRadius: 4, horizontal: true } },
    grid: chartTheme.grid,
    tooltip: { ...chartTheme.tooltip, y: { formatter: v => v + '%' } },
  }).render();

  // Reach bar chart
  new ApexCharts(document.getElementById('chart-cat-reach'), {
    ...chartTheme,
    series: [{ name: '평균 도달', data: catStats.map(c => Math.round(c.avgReach)) }],
    chart: { ...chartTheme.chart, type: 'bar', height: 300 },
    xaxis: { categories: catStats.map(c => c.category), labels: { style: { fontSize: '12px' } } },
    yaxis: { labels: { formatter: v => fmt(v) } },
    colors: [chartColors.blue],
    plotOptions: { bar: { borderRadius: 4, horizontal: true } },
    grid: chartTheme.grid,
    tooltip: { ...chartTheme.tooltip, y: { formatter: v => fmt(v) } },
  }).render();

  // Save/Share grouped bar
  new ApexCharts(document.getElementById('chart-cat-save-share'), {
    ...chartTheme,
    series: [
      { name: '평균 저장', data: catStats.map(c => Math.round(c.avgSaves)) },
      { name: '평균 공유', data: catStats.map(c => Math.round(c.avgShares)) },
    ],
    chart: { ...chartTheme.chart, type: 'bar', height: 300 },
    xaxis: { categories: catStats.map(c => c.category), labels: { style: { fontSize: '12px' } } },
    colors: [chartColors.green, chartColors.orange],
    plotOptions: { bar: { borderRadius: 3, columnWidth: '60%' } },
    grid: chartTheme.grid,
    tooltip: { ...chartTheme.tooltip, y: { formatter: v => fmt(v) } },
  }).render();

  // Category summary table
  new Tabulator('#cat-summary-table', {
    data: catStats,
    layout: 'fitColumns',
    columns: [
      { title: '카테고리', field: 'category', width: 100 },
      { title: '게시물 수', field: 'count', width: 80, hozAlign: 'right', sorter: 'number' },
      { title: '평균 참여율', field: 'avgEngagement', width: 100, hozAlign: 'right', sorter: 'number',
        formatter: cell => cell.getValue().toFixed(1) + '%' },
      { title: '평균 도달', field: 'avgReach', width: 100, hozAlign: 'right', sorter: 'number',
        formatter: cell => fmt(Math.round(cell.getValue())) },
      { title: '평균 저장', field: 'avgSaves', width: 80, hozAlign: 'right', sorter: 'number',
        formatter: cell => fmt(Math.round(cell.getValue())) },
      { title: '평균 공유', field: 'avgShares', width: 80, hozAlign: 'right', sorter: 'number',
        formatter: cell => fmt(Math.round(cell.getValue())) },
      { title: '평균 종합점수', field: 'avgScore', width: 100, hozAlign: 'right', sorter: 'number',
        formatter: cell => cell.getValue().toFixed(1) },
    ],
  });
}

// ══════════════════════════════════════════════════
// TAB 5: Content Analysis
// ══════════════════════════════════════════════════
function renderContent() {
  const { posts } = DATA;
  const typeMap = {};
  posts.forEach(p => {
    const t = p.media_type || 'OTHER';
    if (!typeMap[t]) typeMap[t] = [];
    typeMap[t].push(p);
  });

  const typeStats = Object.entries(typeMap).map(([type, items]) => ({
    type,
    label: typeLabel(type),
    count: items.length,
    avgReach: avg(items.map(p => p.reach).filter(v => v != null)),
    avgEngagement: avg(items.map(p => p.engagement_rate).filter(v => v != null)),
    avgSaves: avg(items.map(p => p.saves).filter(v => v != null)),
    avgShares: avg(items.map(p => p.shares).filter(v => v != null)),
    avgSaveRate: avg(items.map(p => p.save_rate).filter(v => v != null)),
    avgShareRate: avg(items.map(p => p.share_rate).filter(v => v != null)),
  }));

  // Insights
  const bestReach = [...typeStats].sort((a, b) => b.avgReach - a.avgReach)[0];
  const bestSaveRate = [...typeStats].sort((a, b) => b.avgSaveRate - a.avgSaveRate)[0];
  const bestShareRate = [...typeStats].sort((a, b) => b.avgShareRate - a.avgShareRate)[0];

  let insightHtml = `<div class="insight-item">`;
  insightHtml += `<strong>${bestReach.label}</strong>의 평균 도달이 ${fmt(Math.round(bestReach.avgReach))}으로 가장 높습니다.<br>`;
  insightHtml += `<strong>${bestSaveRate.label}</strong>의 평균 저장율이 ${bestSaveRate.avgSaveRate.toFixed(1)}%로 가장 높습니다. (가치있는 콘텐츠 지표)<br>`;
  insightHtml += `<strong>${bestShareRate.label}</strong>의 평균 공유율이 ${bestShareRate.avgShareRate.toFixed(1)}%로 가장 높습니다. (바이럴 잠재력 지표)`;

  // Compare types
  if (typeStats.length >= 2) {
    const carousel = typeStats.find(t => t.type === 'CAROUSEL_ALBUM');
    const video = typeStats.find(t => t.type === 'VIDEO');
    if (carousel && video) {
      if (carousel.avgSaveRate > video.avgSaveRate) {
        const ratio = (carousel.avgSaveRate / video.avgSaveRate).toFixed(1);
        insightHtml += `<br><strong>캐러셀</strong>이 릴스보다 저장율이 ${ratio}배 높습니다.`;
      }
      if (video.avgReach > carousel.avgReach) {
        const ratio = (video.avgReach / carousel.avgReach).toFixed(1);
        insightHtml += `<br><strong>릴스</strong>가 캐러셀보다 도달이 ${ratio}배 넓습니다.`;
      }
    }
  }
  insightHtml += `</div>`;
  document.getElementById('content-insights').innerHTML = insightHtml;

  // Content type comparison grouped bar
  new ApexCharts(document.getElementById('chart-content-compare'), {
    ...chartTheme,
    series: [
      { name: '평균 도달', data: typeStats.map(t => Math.round(t.avgReach)) },
      { name: '평균 저장', data: typeStats.map(t => Math.round(t.avgSaves)) },
      { name: '평균 공유', data: typeStats.map(t => Math.round(t.avgShares)) },
    ],
    chart: { ...chartTheme.chart, type: 'bar', height: 300 },
    xaxis: { categories: typeStats.map(t => t.label) },
    colors: [chartColors.blue, chartColors.green, chartColors.orange],
    plotOptions: { bar: { borderRadius: 3, columnWidth: '55%' } },
    grid: chartTheme.grid,
    tooltip: { ...chartTheme.tooltip, y: { formatter: v => fmt(v) } },
  }).render();

  // Scatter: Reach vs Engagement Rate
  const scatterSeries = Object.entries(typeMap).map(([type, items]) => ({
    name: typeLabel(type),
    data: items.filter(p => p.reach && p.engagement_rate).map(p => ({
      x: p.reach,
      y: p.engagement_rate,
      title: p.title,
    })),
  }));
  new ApexCharts(document.getElementById('chart-scatter'), {
    ...chartTheme,
    series: scatterSeries,
    chart: { ...chartTheme.chart, type: 'scatter', height: 300 },
    xaxis: { title: { text: '도달', style: { color: '#9499b3' } }, labels: { formatter: v => fmt(v) } },
    yaxis: { title: { text: '참여율(%)', style: { color: '#9499b3' } }, labels: { formatter: v => v.toFixed(1) + '%' } },
    colors: [chartColors.accent, chartColors.blue, chartColors.green],
    grid: chartTheme.grid,
    tooltip: {
      ...chartTheme.tooltip,
      custom: ({ seriesIndex, dataPointIndex, w }) => {
        const p = w.config.series[seriesIndex].data[dataPointIndex];
        return `<div style="padding:8px;font-size:12px"><strong>${p.title || ''}</strong><br>도달: ${fmt(p.x)}<br>참여율: ${p.y.toFixed(1)}%</div>`;
      },
    },
  }).render();

  // Top 10 table
  const top10 = [...posts].sort((a, b) => (a.rank || 999) - (b.rank || 999)).slice(0, 10);
  new Tabulator('#top10-table', {
    data: top10,
    layout: 'fitColumns',
    columns: [
      { title: '순위', field: 'rank', width: 55, hozAlign: 'center', sorter: 'number' },
      { title: '유형', field: 'media_type', width: 70, hozAlign: 'center', formatter: cell => typeLabel(cell.getValue()) },
      { title: '카테고리', field: 'category', width: 80 },
      { title: '제목', field: 'title', minWidth: 200,
        formatter: cell => {
          const row = cell.getRow().getData();
          return row.url ? `<a href="${row.url}" target="_blank" style="color:#F77737;text-decoration:none">${cell.getValue()}</a>` : cell.getValue();
        }},
      { title: '도달', field: 'reach', width: 80, hozAlign: 'right', sorter: 'number', formatter: cell => fmt(cell.getValue()) },
      { title: '참여율', field: 'engagement_rate', width: 70, hozAlign: 'right', formatter: cell => fmtPct(cell.getValue()) },
      { title: '저장', field: 'saves', width: 60, hozAlign: 'right', formatter: cell => fmt(cell.getValue()) },
      { title: '공유', field: 'shares', width: 60, hozAlign: 'right', formatter: cell => fmt(cell.getValue()) },
      { title: '점수', field: 'composite_score', width: 60, hozAlign: 'right', formatter: cell => cell.getValue()?.toFixed(1) || '-' },
    ],
  });
}

// ══════════════════════════════════════════════════
// Post Diagnosis Modal
// ══════════════════════════════════════════════════
function getPercentile(value, arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = sorted.findIndex(v => v >= value);
  return idx === -1 ? 100 : Math.round((idx / sorted.length) * 100);
}

function diagnosePost(post) {
  const { posts } = DATA;
  const allReach = posts.map(p => p.reach).filter(v => v != null);
  const allEng = posts.map(p => p.engagement_rate).filter(v => v != null);
  const allSaves = posts.map(p => p.saves).filter(v => v != null);
  const allShares = posts.map(p => p.shares).filter(v => v != null);
  const allComments = posts.map(p => p.comments).filter(v => v != null);
  const allViews = posts.map(p => p.views).filter(v => v != null);
  const allSaveRate = posts.map(p => p.save_rate).filter(v => v != null);
  const allShareRate = posts.map(p => p.share_rate).filter(v => v != null);

  const avgReach = avg(allReach);
  const avgEng = avg(allEng);
  const avgSaveR = avg(allSaveRate);
  const avgShareR = avg(allShareRate);
  const avgSaves_ = avg(allSaves);
  const avgShares_ = avg(allShares);
  const avgComments_ = avg(allComments);

  const reachPct = 100 - getPercentile(post.reach || 0, allReach);
  const engPct = 100 - getPercentile(post.engagement_rate || 0, allEng);
  const savePct = 100 - getPercentile(post.saves || 0, allSaves);
  const sharePct = 100 - getPercentile(post.shares || 0, allShares);

  const diags = [];

  // Reach analysis
  if (reachPct <= 5) {
    diags.push({ type: 'good', label: '도달 최상위', text: `도달 ${fmt(post.reach)} — 상위 ${reachPct}% (평균의 ${(post.reach/avgReach).toFixed(1)}배). 알고리즘이 강하게 추천한 콘텐츠입니다.` });
  } else if (reachPct <= 20) {
    diags.push({ type: 'good', label: '도달 우수', text: `도달 ${fmt(post.reach)} — 상위 ${reachPct}% (평균 ${fmt(Math.round(avgReach))}). 탐색 탭 노출 가능성이 높습니다.` });
  } else if (reachPct >= 70) {
    diags.push({ type: 'bad', label: '도달 부족', text: `도달 ${fmt(post.reach)} — 하위 ${100-reachPct}% (평균 ${fmt(Math.round(avgReach))}). 해시태그, 후킹 이미지, 업로드 시간대를 점검해보세요.` });
  }

  // Engagement analysis
  if (post.engagement_rate != null) {
    if (post.engagement_rate >= avgEng * 2) {
      diags.push({ type: 'good', label: '참여율 탁월', text: `참여율 ${post.engagement_rate.toFixed(1)}% — 평균(${avgEng.toFixed(1)}%)의 ${(post.engagement_rate/avgEng).toFixed(1)}배. 팔로워의 공감을 크게 이끈 콘텐츠입니다.` });
    } else if (post.engagement_rate < avgEng * 0.5) {
      diags.push({ type: 'bad', label: '참여율 저조', text: `참여율 ${post.engagement_rate.toFixed(1)}% — 평균(${avgEng.toFixed(1)}%)의 절반 이하. CTA 문구나 질문형 캡션 추가를 권장합니다.` });
    }
  }

  // Save rate (content value)
  if (post.save_rate != null) {
    if (post.save_rate >= avgSaveR * 2) {
      diags.push({ type: 'good', label: '저장율 높음 (콘텐츠 가치)', text: `저장율 ${post.save_rate.toFixed(1)}% — 평균(${avgSaveR.toFixed(1)}%)의 ${(post.save_rate/avgSaveR).toFixed(1)}배. 정보성/실용성이 뛰어난 콘텐츠입니다. 이 유형을 더 만들어보세요.` });
    } else if (post.save_rate < avgSaveR * 0.3) {
      diags.push({ type: 'warn', label: '저장율 낮음', text: `저장율 ${post.save_rate.toFixed(1)}% — 평균(${avgSaveR.toFixed(1)}%)보다 낮습니다. 정보 요약, 꿀팁, 체크리스트 등 "저장할 만한" 요소를 추가해보세요.` });
    }
  }

  // Share rate (viral potential)
  if (post.share_rate != null) {
    if (post.share_rate >= avgShareR * 2) {
      diags.push({ type: 'good', label: '공유율 높음 (바이럴)', text: `공유율 ${post.share_rate.toFixed(1)}% — 평균(${avgShareR.toFixed(1)}%)의 ${(post.share_rate/avgShareR).toFixed(1)}배. 바이럴 잠재력이 큰 콘텐츠입니다.` });
    } else if (post.share_rate < avgShareR * 0.3) {
      diags.push({ type: 'warn', label: '공유율 낮음', text: `공유율 ${post.share_rate.toFixed(1)}% — "친구 태그해!" 같은 공유 유도 CTA를 추가해보세요.` });
    }
  }

  // High reach but low engagement = hook problem
  if (reachPct <= 20 && engPct >= 60) {
    diags.push({ type: 'warn', label: '도달 대비 참여 부족', text: `도달은 높지만 참여가 낮습니다. 많은 사람에게 노출되었지만 반응을 이끌지 못했습니다. 캡션/CTA를 강화하거나, 댓글 유도 질문을 넣어보세요.` });
  }

  // Low reach but high engagement = loyal audience
  if (reachPct >= 60 && engPct <= 20) {
    diags.push({ type: 'warn', label: '참여는 높지만 노출 부족', text: `기존 팔로워의 반응은 좋지만 새로운 사람에게 도달하지 못했습니다. 트렌딩 해시태그나 릴스 형식 활용을 고려해보세요.` });
  }

  // Comments analysis
  if (post.comments != null && post.comments >= avgComments_ * 3) {
    diags.push({ type: 'good', label: '댓글 활발', text: `댓글 ${fmt(post.comments)}개 — 평균(${fmt(Math.round(avgComments_))})의 ${(post.comments/avgComments_).toFixed(1)}배. 소통이 활발한 게시물입니다.` });
  }

  // Overall summary
  const scores = [];
  if (reachPct <= 30) scores.push('도달');
  if (engPct <= 30) scores.push('참여');
  if (savePct <= 30) scores.push('저장');
  if (sharePct <= 30) scores.push('공유');

  if (scores.length >= 3) {
    diags.unshift({ type: 'good', label: '종합 우수 게시물', text: `${scores.join(', ')} 모두 상위권입니다. 이 게시물의 주제/형식을 참고하여 유사 콘텐츠를 제작해보세요.` });
  }

  if (diags.length === 0) {
    diags.push({ type: 'warn', label: '평균 수준', text: '대부분의 지표가 평균 범위 내에 있습니다. 눈에 띄는 강점이나 약점이 없는 안정적인 게시물입니다.' });
  }

  return { reachPct, engPct, savePct, sharePct, diags };
}

function showPostModal(post) {
  const { reachPct, engPct, savePct, sharePct, diags } = diagnosePost(post);

  document.getElementById('modal-title').textContent = post.title || '제목 없음';
  document.getElementById('modal-meta').textContent =
    `${post.upload_date} · ${typeLabel(post.media_type)} · ${post.category || '미분류'} · 종합순위 ${post.rank || '-'}위`;

  const statColor = pct => pct <= 20 ? 'var(--green)' : pct >= 70 ? 'var(--red)' : 'var(--text)';

  document.getElementById('modal-stats').innerHTML = [
    { label: '도달', value: fmt(post.reach), sub: `상위 ${reachPct}%`, color: statColor(reachPct) },
    { label: '참여율', value: fmtPct(post.engagement_rate), sub: `상위 ${engPct}%`, color: statColor(engPct) },
    { label: '저장', value: fmt(post.saves), sub: `상위 ${savePct}%`, color: statColor(savePct) },
    { label: '공유', value: fmt(post.shares), sub: `상위 ${sharePct}%`, color: statColor(sharePct) },
  ].map(s => `
    <div class="modal-stat">
      <div class="modal-stat-label">${s.label}</div>
      <div class="modal-stat-value" style="color:${s.color}">${s.value}</div>
      <div class="modal-stat-sub" style="color:${s.color}">${s.sub}</div>
    </div>
  `).join('');

  document.getElementById('modal-diagnosis').innerHTML = diags.map(d => `
    <div class="diag-item ${d.type}">
      <div class="diag-label">${d.label}</div>
      <div class="diag-text">${d.text}</div>
    </div>
  `).join('');

  document.getElementById('post-modal').style.display = 'flex';
}

// Close modal
document.addEventListener('click', e => {
  if (e.target.id === 'post-modal' || e.target.id === 'modal-close') {
    document.getElementById('post-modal').style.display = 'none';
  }
});

// ── Manual Update Button ──
const WORKER_URL = ''; // Cloudflare Worker URL을 여기에 설정

document.addEventListener('DOMContentLoaded', () => {
  init();

  const btn = document.getElementById('manual-update-btn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    if (!WORKER_URL) {
      // Fallback: Worker 미설정 시 GitHub Actions 페이지로 이동
      window.open('https://github.com/Flying-Japan/IG-INSIGHTS/actions/workflows/daily-insights.yml', '_blank');
      return;
    }

    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = '요청 중...';

    try {
      const res = await fetch(WORKER_URL, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        btn.textContent = '업데이트 시작됨 ✓';
        btn.style.background = 'linear-gradient(135deg, #00c853, #00e676)';
        setTimeout(() => {
          btn.textContent = original;
          btn.style.background = '';
          btn.disabled = false;
        }, 5000);
      } else {
        throw new Error(data.error || 'Failed');
      }
    } catch (e) {
      btn.textContent = '실패 - 다시 시도';
      btn.style.background = 'linear-gradient(135deg, #ff5252, #ff1744)';
      setTimeout(() => {
        btn.textContent = original;
        btn.style.background = '';
        btn.disabled = false;
      }, 3000);
    }
  });
});
