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

// ── Milestone Filter ──
const MILESTONE_DATE = new Date(2025, 11, 26); // 2025-12-26
let milestoneFilter = 'all'; // 'all' | 'before' | 'after'

// upload_date "26.02.03(화)" → Date 객체 (여기서 미리 정의, 아래에서도 사용)
function parseUploadDate(str) {
  const m = str.match(/(\d{2})\.(\d{2})\.(\d{2})/);
  return m ? new Date(2000 + parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3])) : null;
}

function filterByMilestone(posts) {
  if (milestoneFilter === 'all') return posts;
  return posts.filter(p => {
    const d = parseUploadDate(p.upload_date);
    if (!d) return false;
    return milestoneFilter === 'before' ? d < MILESTONE_DATE : d >= MILESTONE_DATE;
  });
}

function filterDailyByMilestone(daily) {
  if (milestoneFilter === 'all') return daily;
  return daily.filter(d => {
    if (!d.date) return milestoneFilter === 'all';
    // daily_report date format: "2026-01-20" or similar
    const dt = new Date(d.date);
    if (isNaN(dt)) return milestoneFilter === 'all';
    return milestoneFilter === 'before' ? dt < MILESTONE_DATE : dt >= MILESTONE_DATE;
  });
}

function filterFollowersByMilestone(followers) {
  if (milestoneFilter === 'all') return followers;
  return followers.filter(f => {
    // follower date format: "26.01.20(월)" same as upload_date
    const d = parseUploadDate(f.date);
    if (!d) return milestoneFilter === 'all';
    return milestoneFilter === 'before' ? d < MILESTONE_DATE : d >= MILESTONE_DATE;
  });
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
    // 비율 필드 정규화: 0.059 형태(소수)를 5.9 형태(퍼센트)로 통일
    const rateFields = ['avg_engagement_rate', 'avg_save_rate', 'avg_share_rate'];
    daily.forEach(d => {
      rateFields.forEach(f => {
        if (d[f] != null && d[f] < 1) d[f] = +(d[f] * 100).toFixed(2);
      });
    });

    // 팔로우 전환율 계산 (follows / reach × 100)
    posts.forEach(p => {
      p.follow_rate = (p.follows != null && p.reach) ? +(p.follows / p.reach * 100).toFixed(2) : null;
    });
    // postsYesterday에도 동일 적용
    postsYesterday.forEach(p => {
      p.follow_rate = (p.follows != null && p.reach) ? +(p.follows / p.reach * 100).toFixed(2) : null;
    });

    DATA = { posts, followers, daily, meta, postsYesterday };
    document.getElementById('update-time').textContent = '업데이트: ' + meta.updated_at_ko;
    document.getElementById('loading').classList.add('hidden');

    setupTabs();
    setupMilestoneFilter();
    renderAll();
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

// ── Milestone Filter Setup ──
function setupMilestoneFilter() {
  const toggle = document.getElementById('milestone-toggle');
  if (!toggle) return;
  toggle.addEventListener('click', e => {
    const btn = e.target.closest('.milestone-btn');
    if (!btn || !btn.dataset.filter) return;
    milestoneFilter = btn.dataset.filter;
    toggle.querySelectorAll('.milestone-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    // Destroy existing charts & tables, then re-render everything
    destroyAllCharts();
    renderAll();
  });
}

// ── Destroy all charts before re-rendering ──
let chartInstances = [];
function trackChart(chart) { chartInstances.push(chart); return chart; }
function destroyAllCharts() {
  chartInstances.forEach(c => { try { c.destroy(); } catch(e) {} });
  chartInstances = [];
  if (dowChartInstance) { try { dowChartInstance.destroy(); } catch(e) {} dowChartInstance = null; }
  if (postTable) { try { postTable.destroy(); } catch(e) {} postTable = null; }
}

// ── Render All ──
function renderAll() {
  renderOverview();
  renderPostTable();
  renderFollowers();
  renderCategory();
  renderContent();
}

// ── KPI Stats (Unified with dropdown modes) ──
const statIds = ['posts','followers','reach','views','likes','saves','shares','comments','engagement','engagement_rate','save_rate','share_rate','follows','top_post'];
const statLabels = {
  posts: '게시물', followers: '팔로워', reach: '도달', views: '조회수',
  likes: '좋아요', saves: '저장', shares: '공유', comments: '댓글',
  engagement: '참여', engagement_rate: '참여율', save_rate: '저장율',
  share_rate: '공유율', follows: '팔로우 유입 (릴스제외)', top_post: 'TOP 게시물',
};
const statTooltips = {
  posts: '선택된 기간 내 업로드된 게시물의 총 개수',
  followers: '가장 최근 기록된 팔로워 수 (전일 대비 변화 포함)',
  reach: '게시물이 노출된 고유 계정 수의 합계 또는 평균',
  views: '게시물이 조회된 총 횟수 (중복 포함)',
  likes: '게시물에 달린 좋아요의 합계 또는 평균',
  saves: '사용자가 게시물을 저장한 횟수의 합계 또는 평균',
  shares: '게시물이 공유된 횟수의 합계 또는 평균',
  comments: '게시물에 달린 댓글의 합계 또는 평균',
  engagement: '좋아요 + 저장 + 공유 + 댓글의 합계 또는 평균',
  engagement_rate: '(참여 / 도달) × 100. 도달 대비 얼마나 반응했는지의 비율',
  save_rate: '(저장 / 도달) × 100. 콘텐츠를 저장할 만큼 가치를 느낀 비율',
  share_rate: '(공유 / 도달) × 100. 다른 사람에게 공유할 만큼 가치를 느낀 비율',
  follows: '게시물을 보고 팔로우한 수의 합계 또는 평균. Instagram API 특성상 릴스 데이터는 제외됨',
  top_post: '종합순위 1위 또는 도달 기준 가장 높은 게시물',
};

// ── Benchmark grading (Instagram industry averages) ──
// Each entry: { grades: [{min, label, cls}], unit, scaleNote }
// grades ordered from highest threshold downward
// 2025 Instagram benchmarks — 여행/관광 업종 기준
// Sources: Rival IQ 2025 Benchmark Report, Social Insider, Dash Social Travel Industry Report
const statBenchmarks = {
  engagement_rate: {
    grades: [
      { min: 3, label: '우수', cls: 'excellent' },
      { min: 1.2, label: '양호', cls: 'good' },
      { min: 0.5, label: '보통', cls: 'normal' },
      { min: 0, label: '미흡', cls: 'low' },
    ],
    unit: '%',
    scaleNote: '2025 IG 전체 평균 0.5%, 여행 업종 평균 약 1.2%. 3% 이상이면 매우 우수한 수준',
  },
  save_rate: {
    grades: [
      { min: 3, label: '우수', cls: 'excellent' },
      { min: 1, label: '양호', cls: 'good' },
      { min: 0.3, label: '보통', cls: 'normal' },
      { min: 0, label: '미흡', cls: 'low' },
    ],
    unit: '%',
    scaleNote: '캐러셀 평균 저장율 약 3.4%. 여행 콘텐츠는 저장율이 높은 편 (정보성 콘텐츠 +24%)',
  },
  share_rate: {
    grades: [
      { min: 1.5, label: '우수', cls: 'excellent' },
      { min: 0.5, label: '양호', cls: 'good' },
      { min: 0.2, label: '보통', cls: 'normal' },
      { min: 0, label: '미흡', cls: 'low' },
    ],
    unit: '%',
    scaleNote: '2025 IG 알고리즘이 DM 공유(Sends)를 최우선 순위로 반영. 공유율이 높을수록 도달 확대',
  },
};
// For marketer KPIs (not in statFields but rendered separately)
const marketerBenchmarks = {
  'kpi-avg-save-rate': statBenchmarks.save_rate,
  'kpi-avg-share-rate': statBenchmarks.share_rate,
  'kpi-avg-engagement-per-post': {
    grades: [
      { min: 300, label: '우수', cls: 'excellent' },
      { min: 100, label: '양호', cls: 'good' },
      { min: 30, label: '보통', cls: 'normal' },
      { min: 0, label: '미흡', cls: 'low' },
    ],
    unit: '',
    scaleNote: '팔로워 1만 이하 계정 기준. 팔로워 규모가 클수록 절대 수치는 높지만 비율은 낮아지는 경향',
  },
  'kpi-reach-rate': {
    grades: [
      { min: 150, label: '우수', cls: 'excellent' },
      { min: 50, label: '양호', cls: 'good' },
      { min: 20, label: '보통', cls: 'normal' },
      { min: 0, label: '미흡', cls: 'low' },
    ],
    unit: '%',
    scaleNote: '2025 IG 평균 도달율 약 20~30%. 50% 이상이면 양호, 100% 초과 시 비팔로워 유입 활발',
  },
};

function getGrade(benchmark, value) {
  if (value == null || !benchmark) return null;
  for (const g of benchmark.grades) {
    if (value >= g.min) return g;
  }
  return benchmark.grades[benchmark.grades.length - 1];
}

function gradeBadgeHtml(grade) {
  if (!grade) return '';
  return ` <span class="kpi-grade ${grade.cls}">${grade.label}</span>`;
}

function benchmarkScaleHtml(benchmark, currentValue) {
  if (!benchmark) return '';
  const grades = benchmark.grades;
  let html = '<div class="kpi-benchmark-scale">';
  html += '<div class="benchmark-title">여행 업종 기준 (2025)</div>';
  html += '<div class="benchmark-bar">';
  const colors = { excellent: '#00c853', good: '#448aff', normal: '#ffd600', low: '#ff5252' };
  const widths = [25, 25, 25, 25]; // equal width segments
  // Render segments (reversed: low→excellent, left to right)
  const reversed = [...grades].reverse();
  reversed.forEach((g, i) => {
    const nextMin = i < reversed.length - 1 ? reversed[i + 1].min : '';
    const label = g.min + (benchmark.unit || '') + (nextMin !== '' ? '' : '+');
    html += `<div class="benchmark-seg ${g.cls}" style="width:${widths[i]}%"><span class="seg-label">${g.label}</span></div>`;
  });
  html += '</div>';
  // Labels below
  html += '<div class="benchmark-labels">';
  reversed.forEach((g, i) => {
    html += `<span class="benchmark-val" style="width:${widths[i]}%">${g.min}${benchmark.unit}</span>`;
  });
  html += '</div>';
  if (benchmark.scaleNote) {
    html += `<div class="benchmark-note">${benchmark.scaleNote}</div>`;
  }
  html += '</div>';
  return html;
}

let visibleStats = new Set(statIds);
let currentKpiMode = 'total';

// Group posts by period helper
function groupPostsByPeriod(posts, mode, year, month, weekIdx) {
  if (mode === 'yearly') {
    const byYear = {};
    posts.forEach(p => {
      const d = parseUploadDate(p.upload_date);
      if (d) { const y = d.getFullYear(); if (!byYear[y]) byYear[y] = []; byYear[y].push(p); }
    });
    return year && byYear[year] ? byYear[year] : posts;
  }
  if (mode === 'monthly') {
    return posts.filter(p => {
      const d = parseUploadDate(p.upload_date);
      return d && d.getFullYear() === year && d.getMonth() === month;
    });
  }
  if (mode === 'weekly') {
    const weeks = getWeeksInMonth(year, month);
    const week = weeks[weekIdx];
    if (!week) return [];
    return posts.filter(p => {
      const d = parseUploadDate(p.upload_date);
      return d && d >= week.start && d <= week.endDate;
    });
  }
  if (mode === 'daily') {
    // Return posts for the specific day
    return posts.filter(p => {
      const d = parseUploadDate(p.upload_date);
      return d && d.getFullYear() === year && d.getMonth() === month && d.getDate() === weekIdx;
    });
  }
  return posts; // total, avg
}

function renderKpiStats(mode, periodPosts) {
  const posts = periodPosts || filterByMilestone(DATA.posts);
  const followers = filterFollowersByMilestone(DATA.followers);
  const daily = filterDailyByMilestone(DATA.daily);
  const isAvg = (mode === 'avg');
  const isTotal = (mode === 'total');
  const isPeriod = !isTotal && !isAvg; // yearly/monthly/weekly/daily

  // Build stat values
  const latestFollowers = followers.length ? followers[followers.length - 1].followers : null;
  const engRates = posts.map(p => p.engagement_rate).filter(v => v != null);
  const saveRates = posts.map(p => p.save_rate).filter(v => v != null);
  const shareRates = posts.map(p => p.share_rate).filter(v => v != null);

  const statFields = [
    { id: 'posts', val: posts.length, label: isPeriod ? '게시물 수' : '총 게시물' },
    { id: 'followers', val: latestFollowers, label: '현재 팔로워', noAvg: true },
    { id: 'reach',
      val: isAvg ? Math.round(avg(posts.map(p => p.reach).filter(v => v != null))) : sum(posts.map(p => p.reach)),
      label: isAvg ? '평균 도달' : '전체 도달', daily: 'total_reach' },
    { id: 'views',
      val: isAvg ? Math.round(avg(posts.map(p => p.views).filter(v => v != null))) : sum(posts.map(p => p.views)),
      label: isAvg ? '평균 조회수' : '전체 조회수', daily: 'total_views' },
    { id: 'likes',
      val: isAvg ? Math.round(avg(posts.map(p => p.likes).filter(v => v != null))) : sum(posts.map(p => p.likes)),
      label: isAvg ? '평균 좋아요' : '전체 좋아요', daily: 'total_likes' },
    { id: 'saves',
      val: isAvg ? Math.round(avg(posts.map(p => p.saves).filter(v => v != null))) : sum(posts.map(p => p.saves)),
      label: isAvg ? '평균 저장' : '전체 저장', daily: 'total_saves' },
    { id: 'shares',
      val: isAvg ? Math.round(avg(posts.map(p => p.shares).filter(v => v != null))) : sum(posts.map(p => p.shares)),
      label: isAvg ? '평균 공유' : '전체 공유', daily: 'total_shares' },
    { id: 'comments',
      val: isAvg ? Math.round(avg(posts.map(p => p.comments).filter(v => v != null))) : sum(posts.map(p => p.comments)),
      label: isAvg ? '평균 댓글' : '전체 댓글', daily: 'total_comments' },
    { id: 'engagement',
      val: isAvg ? Math.round(avg(posts.map(p => (p.likes||0)+(p.saves||0)+(p.shares||0)+(p.comments||0)))) : sum(posts.map(p => (p.likes||0)+(p.saves||0)+(p.shares||0)+(p.comments||0))),
      label: isAvg ? '평균 참여' : '전체 참여', daily: 'total_engagement' },
    { id: 'engagement_rate', val: engRates.length ? +avg(engRates).toFixed(1) : null, label: '평균 참여율', isPct: true, daily: 'avg_engagement_rate' },
    { id: 'save_rate', val: saveRates.length ? +avg(saveRates).toFixed(1) : null, label: '평균 저장율', isPct: true, daily: 'avg_save_rate' },
    { id: 'share_rate', val: shareRates.length ? +avg(shareRates).toFixed(1) : null, label: '평균 공유율', isPct: true, daily: 'avg_share_rate' },
    { id: 'follows',
      val: isAvg ? Math.round(avg(posts.map(p => p.follows || 0))) : sum(posts.map(p => p.follows || 0)),
      label: isAvg ? '평균 팔로우 유입 (릴스제외)' : '팔로우 유입 합계 (릴스제외)' },
    { id: 'top_post', val: null, label: 'TOP 게시물', isText: true },
  ];

  // Store for reference
  window._kpiStatFields = statFields;
  window._kpiDaily = daily;

  statFields.forEach(f => {
    const card = document.querySelector(`#kpi-stats-grid .kpi-card[data-stat="${f.id}"]`);
    const labelEl = document.getElementById(`kpi-stat-${f.id}-label`);
    const valueEl = document.getElementById(`kpi-total-${f.id}`);
    if (card) card.style.display = visibleStats.has(f.id) ? '' : 'none';
    if (labelEl) {
      const tooltip = statTooltips[f.id];
      const bm = statBenchmarks[f.id];
      const scaleHtml = benchmarkScaleHtml(bm, f.val);
      labelEl.innerHTML = f.label + (tooltip ? ` <span class="kpi-tooltip-wrap"><span class="kpi-tooltip-icon">ⓘ</span><span class="kpi-tooltip-text">${tooltip}${scaleHtml}</span></span>` : '');
    }

    if (f.id === 'top_post') {
      const top = posts.find(p => p.rank === 1) || (posts.length ? [...posts].sort((a,b) => (b.reach||0)-(a.reach||0))[0] : null);
      if (valueEl) valueEl.textContent = top ? top.title : '-';
      return;
    }
    if (f.id === 'followers') {
      if (valueEl) valueEl.textContent = fmt(f.val);
      // Show follower change
      const changeEl = document.getElementById('kpi-followers-change');
      if (changeEl && followers.length >= 2) {
        const change = (followers[followers.length - 1].followers || 0) - (followers[followers.length - 2].followers || 0);
        changeEl.textContent = (change >= 0 ? '+' : '') + fmt(change) + ' (전일 대비)';
        changeEl.className = 'kpi-sub ' + (change >= 0 ? 'positive' : 'negative');
      }
      return;
    }
    if (valueEl) {
      const formatted = f.isPct ? fmtPct(f.val) : fmt(f.val);
      const showChange = isTotal && f.daily;
      const bm = statBenchmarks[f.id];
      const grade = getGrade(bm, f.val);
      valueEl.innerHTML = formatted + gradeBadgeHtml(grade) + (showChange ? changeBadge(getDailyChange(daily, f.daily), f.isPct) : '');
    }
  });
}

// Period selector UI for dropdown modes
function updateKpiPeriodSelectors(mode) {
  const container = document.getElementById('kpi-period-selectors');
  container.innerHTML = '';
  if (mode === 'total' || mode === 'avg') return;

  const posts = filterByMilestone(DATA.posts);
  const yms = getAvailableYearMonths();
  if (!yms.length) return;

  const latest = yms[0].split('-');
  const years = [...new Set(yms.map(ym => ym.split('-')[0]))];

  // Year selector
  const yearSel = document.createElement('select');
  yearSel.id = 'kpi-year';
  years.forEach(y => { const o = document.createElement('option'); o.value = y; o.textContent = y + '년'; yearSel.appendChild(o); });
  yearSel.value = latest[0];
  container.appendChild(yearSel);

  if (mode === 'yearly') {
    yearSel.addEventListener('change', () => refreshKpiForPeriod());
    refreshKpiForPeriod();
    return;
  }

  // Month selector
  const monthSel = document.createElement('select');
  monthSel.id = 'kpi-month';
  const populateMonths = () => {
    monthSel.innerHTML = '';
    for (let m = 1; m <= 12; m++) {
      const key = `${yearSel.value}-${String(m).padStart(2,'0')}`;
      if (yms.includes(key)) { const o = document.createElement('option'); o.value = m; o.textContent = m + '월'; monthSel.appendChild(o); }
    }
    const lastOpt = monthSel.options[monthSel.options.length - 1];
    if (lastOpt) monthSel.value = lastOpt.value;
  };
  populateMonths();
  container.appendChild(monthSel);

  if (mode === 'weekly') {
    const addWeekSel = () => {
      const old = document.getElementById('kpi-week');
      if (old) old.remove();
      const y = parseInt(yearSel.value);
      const m = parseInt(monthSel.value) - 1;
      const weeks = getWeeksInMonth(y, m);
      const weekSel = document.createElement('select');
      weekSel.id = 'kpi-week';
      weeks.forEach((w, i) => { const o = document.createElement('option'); o.value = i; o.textContent = `${i+1}주 (${w.label})`; weekSel.appendChild(o); });
      weekSel.value = String(weeks.length - 1);
      container.appendChild(weekSel);
      weekSel.addEventListener('change', () => refreshKpiForPeriod());
    };
    addWeekSel();
    yearSel.addEventListener('change', () => { populateMonths(); addWeekSel(); refreshKpiForPeriod(); });
    monthSel.addEventListener('change', () => { addWeekSel(); refreshKpiForPeriod(); });
    refreshKpiForPeriod();
    return;
  }

  if (mode === 'daily') {
    const addDaySel = () => {
      const old = document.getElementById('kpi-day');
      if (old) old.remove();
      const y = parseInt(yearSel.value);
      const m = parseInt(monthSel.value) - 1;
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const daySel = document.createElement('select');
      daySel.id = 'kpi-day';
      const today = new Date();
      for (let d = 1; d <= daysInMonth; d++) {
        const dt = new Date(y, m, d);
        if (dt <= today) {
          const dayChar = ['일','월','화','수','목','금','토'][dt.getDay()];
          const o = document.createElement('option');
          o.value = d;
          o.textContent = `${d}일 (${dayChar})`;
          daySel.appendChild(o);
        }
      }
      const lastOpt = daySel.options[daySel.options.length - 1];
      if (lastOpt) daySel.value = lastOpt.value;
      container.appendChild(daySel);
      daySel.addEventListener('change', () => refreshKpiForPeriod());
    };
    addDaySel();
    yearSel.addEventListener('change', () => { populateMonths(); addDaySel(); refreshKpiForPeriod(); });
    monthSel.addEventListener('change', () => { addDaySel(); refreshKpiForPeriod(); });
    refreshKpiForPeriod();
    return;
  }

  // monthly
  yearSel.addEventListener('change', () => { populateMonths(); refreshKpiForPeriod(); });
  monthSel.addEventListener('change', () => refreshKpiForPeriod());
  refreshKpiForPeriod();
}

function refreshKpiForPeriod() {
  const mode = currentKpiMode;
  const posts = filterByMilestone(DATA.posts);
  const yearEl = document.getElementById('kpi-year');
  const monthEl = document.getElementById('kpi-month');
  const weekEl = document.getElementById('kpi-week');
  const dayEl = document.getElementById('kpi-day');
  const year = yearEl ? parseInt(yearEl.value) : null;
  const month = monthEl ? parseInt(monthEl.value) - 1 : null;
  let periodIdx = 0;
  if (mode === 'weekly') periodIdx = weekEl ? parseInt(weekEl.value) : 0;
  if (mode === 'daily') periodIdx = dayEl ? parseInt(dayEl.value) : 1;
  const filtered = groupPostsByPeriod(posts, mode, year, month, periodIdx);
  renderKpiStats(mode, filtered);
}

// Stats column toggle UI
function renderStatsToggle() {
  const container = document.getElementById('stats-toggle-list');
  if (!container) return;
  container.innerHTML = '';
  statIds.forEach(id => {
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = visibleStats.has(id);
    cb.addEventListener('change', () => {
      if (cb.checked) visibleStats.add(id);
      else visibleStats.delete(id);
      refreshKpiForPeriod();
    });
    label.appendChild(cb);
    label.appendChild(document.createTextNode(statLabels[id] || id));
    container.appendChild(label);
  });
}

// KPI dropdown binding
document.getElementById('kpi-mode-dropdown')?.addEventListener('change', function() {
  currentKpiMode = this.value;
  if (this.value === 'total' || this.value === 'avg') {
    document.getElementById('kpi-period-selectors').innerHTML = '';
    renderKpiStats(this.value, filterByMilestone(DATA.posts));
  } else {
    updateKpiPeriodSelectors(this.value);
  }
});

// Stats toggle panel show/hide
document.getElementById('stats-toggle-btn')?.addEventListener('click', () => {
  const panel = document.getElementById('stats-toggle-panel');
  const btn = document.getElementById('stats-toggle-btn');
  if (panel.style.display === 'none') {
    panel.style.display = 'block';
    btn.classList.add('active');
    renderStatsToggle();
  } else {
    panel.style.display = 'none';
    btn.classList.remove('active');
  }
});

// ── KPI Card Drag & Drop Reorder ──
function initKpiDragDrop() {
  const grid = document.getElementById('kpi-stats-grid');
  if (!grid) return;
  let dragEl = null;

  grid.addEventListener('dragstart', e => {
    const card = e.target.closest('.kpi-card');
    if (!card) return;
    dragEl = card;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
  });

  grid.addEventListener('dragend', e => {
    const card = e.target.closest('.kpi-card');
    if (card) card.classList.remove('dragging');
    grid.querySelectorAll('.kpi-card').forEach(c => c.classList.remove('drag-over'));
    dragEl = null;
    // Save order to localStorage
    const order = [...grid.querySelectorAll('.kpi-card')].map(c => c.dataset.stat);
    try { localStorage.setItem('kpi-card-order', JSON.stringify(order)); } catch(e) {}
  });

  grid.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const card = e.target.closest('.kpi-card');
    if (card && card !== dragEl) {
      grid.querySelectorAll('.kpi-card').forEach(c => c.classList.remove('drag-over'));
      card.classList.add('drag-over');
    }
  });

  grid.addEventListener('drop', e => {
    e.preventDefault();
    const target = e.target.closest('.kpi-card');
    if (!target || !dragEl || target === dragEl) return;
    // Determine position
    const cards = [...grid.querySelectorAll('.kpi-card')];
    const dragIdx = cards.indexOf(dragEl);
    const targetIdx = cards.indexOf(target);
    if (dragIdx < targetIdx) {
      target.after(dragEl);
    } else {
      target.before(dragEl);
    }
    target.classList.remove('drag-over');
  });

  // Make cards draggable & restore saved order
  grid.querySelectorAll('.kpi-card').forEach(c => c.setAttribute('draggable', 'true'));
  try {
    const saved = JSON.parse(localStorage.getItem('kpi-card-order'));
    if (saved && Array.isArray(saved)) {
      const cardMap = {};
      grid.querySelectorAll('.kpi-card').forEach(c => { cardMap[c.dataset.stat] = c; });
      saved.forEach(stat => {
        if (cardMap[stat]) grid.appendChild(cardMap[stat]);
      });
    }
  } catch(e) {}
}

// Init drag after DOM ready
document.addEventListener('DOMContentLoaded', () => {
  // Small delay to let cards render first
  setTimeout(initKpiDragDrop, 500);
});

// ══════════════════════════════════════════════════
// TAB 1: Overview
// ══════════════════════════════════════════════════
function renderContribution() {
  const allPosts = DATA.posts;
  const afterPosts = allPosts.filter(p => {
    const d = parseUploadDate(p.upload_date);
    return d && d >= MILESTONE_DATE;
  });

  const metrics = [
    { key: 'comments', label: '댓글', color: '#ffd600' },
    { key: 'follows', label: '팔로우', color: '#E040FB' },
    { key: 'shares', label: '공유', color: '#F77737' },
    { key: 'saves', label: '저장', color: '#00c853' },
    { key: 'reach', label: '도달', color: '#448aff' },
    { key: 'likes', label: '좋아요', color: '#ff5252' },
    { key: 'views', label: '조회수', color: '#7c4dff' },
  ];

  const container = document.getElementById('contribution-grid');
  if (!container) return;
  container.innerHTML = '';

  // 기여도 계산
  const contribData = metrics.map(m => {
    const totalAll = sum(allPosts.map(p => p[m.key] || 0));
    const totalAfter = sum(afterPosts.map(p => p[m.key] || 0));
    const pct = totalAll > 0 ? (totalAfter / totalAll * 100) : 0;
    return { ...m, totalAll, totalAfter, pct };
  });

  // 상위 3개 강조
  const sortedByPct = [...contribData].sort((a, b) => b.pct - a.pct);
  const top3Keys = new Set(sortedByPct.slice(0, 3).map(d => d.key));

  // 상위 그룹(top3)과 나머지 그룹 분리
  const topGroup = contribData.filter(d => top3Keys.has(d.key)).sort((a, b) => b.pct - a.pct);
  const restGroup = contribData.filter(d => !top3Keys.has(d.key));

  // 상위 3개 큰 도넛
  const topRow = document.createElement('div');
  topRow.className = 'contrib-row contrib-row-top';
  container.appendChild(topRow);

  // 나머지 작은 도넛
  const restRow = document.createElement('div');
  restRow.className = 'contrib-row contrib-row-rest';
  container.appendChild(restRow);

  function renderDonut(d, parentEl, isTop) {
    const item = document.createElement('div');
    item.className = 'contrib-item' + (isTop ? ' contrib-highlight' : '');
    const chartId = `contrib-chart-${d.key}`;
    const rankIdx = sortedByPct.findIndex(s => s.key === d.key) + 1;
    const rankBadge = isTop ? `<span class="contrib-badge top">${rankIdx}위</span>` : '';

    item.innerHTML = `
      <div class="contrib-label">${d.label}</div>
      <div class="contrib-chart" id="${chartId}"></div>
      <div class="contrib-detail">${fmt(d.totalAfter)} / ${fmt(d.totalAll)}</div>
      ${rankBadge}
    `;
    parentEl.appendChild(item);

    const afterPct = +d.pct.toFixed(1);
    const beforePct = +(100 - afterPct).toFixed(1);
    const chartH = isTop ? 160 : 120;
    const fontSize = isTop ? '22px' : '16px';

    trackChart(new ApexCharts(document.getElementById(chartId), {
      series: [afterPct, beforePct],
      chart: { type: 'donut', height: chartH, sparkline: { enabled: true } },
      labels: ['담당 이후', '담당 이전'],
      colors: [d.color, 'rgba(46,50,71,0.4)'],
      plotOptions: {
        pie: {
          donut: {
            size: '72%',
            labels: {
              show: true,
              name: { show: false },
              value: { show: true, fontSize, fontWeight: 700,
                color: isTop ? d.color : '#e4e6f0',
                formatter: () => afterPct + '%'
              },
              total: { show: true, showAlways: true,
                fontSize, fontWeight: 700,
                color: isTop ? d.color : '#e4e6f0',
                formatter: () => afterPct + '%'
              }
            }
          }
        }
      },
      stroke: { show: false },
      tooltip: { enabled: true, theme: 'dark', y: { formatter: v => v + '%' } },
      legend: { show: false },
      states: { hover: { filter: { type: 'none' } }, active: { filter: { type: 'none' } } }
    })).render();
  }

  topGroup.forEach(d => renderDonut(d, topRow, true));
  restGroup.forEach(d => renderDonut(d, restRow, false));
}

function renderOverview() {
  const posts = filterByMilestone(DATA.posts);
  const followers = filterFollowersByMilestone(DATA.followers);
  const daily = filterDailyByMilestone(DATA.daily);

  // Unified KPI Stats
  const mode = currentKpiMode;
  if (mode === 'total' || mode === 'avg') {
    renderKpiStats(mode, posts);
  } else {
    updateKpiPeriodSelectors(mode);
  }

  // Follower trend chart (last 30 days from daily report or follower data)
  document.getElementById('chart-follower-trend').innerHTML = '';
  if (followers.length > 0) {
    trackChart(new ApexCharts(document.getElementById('chart-follower-trend'), {
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
    })).render();
  }

  // Content type distribution donut
  const typeCounts = {};
  posts.forEach(p => { typeCounts[p.media_type] = (typeCounts[p.media_type] || 0) + 1; });
  document.getElementById('chart-type-dist').innerHTML = '';
  trackChart(new ApexCharts(document.getElementById('chart-type-dist'), {
    ...chartTheme,
    series: Object.values(typeCounts),
    chart: { ...chartTheme.chart, type: 'donut', height: 250 },
    labels: Object.keys(typeCounts).map(typeLabel),
    colors: [chartColors.accent, chartColors.blue, chartColors.green, chartColors.yellow],
    legend: { position: 'bottom', labels: { colors: '#9499b3' } },
    plotOptions: { pie: { donut: { size: '55%' } } },
  })).render();

  // Day-of-week reach & engagement (replaces daily chart)
  renderDowChart('all');

  // ── Marketer KPIs ──
  const mSaveRates = posts.map(p => p.save_rate).filter(v => v != null);
  const mShareRates = posts.map(p => p.share_rate).filter(v => v != null);
  const avgSaveRate = avg(mSaveRates);
  const avgShareRate = avg(mShareRates);
  document.getElementById('kpi-avg-save-rate').innerHTML = fmtPct(avgSaveRate) + gradeBadgeHtml(getGrade(marketerBenchmarks['kpi-avg-save-rate'], avgSaveRate)) + changeBadge(getDailyChange(daily, 'avg_save_rate'), true);
  document.getElementById('kpi-avg-share-rate').innerHTML = fmtPct(avgShareRate) + gradeBadgeHtml(getGrade(marketerBenchmarks['kpi-avg-share-rate'], avgShareRate)) + changeBadge(getDailyChange(daily, 'avg_share_rate'), true);

  const avgEngPerPost = posts.length ? Math.round(sum(posts.map(p => (p.likes||0)+(p.saves||0)+(p.shares||0)+(p.comments||0))) / posts.length) : 0;
  const engPerPostChange = daily.length >= 2 ? (() => {
    const d1 = daily[daily.length - 1], d0 = daily[daily.length - 2];
    if (d1.total_engagement && d1.post_count && d0.total_engagement && d0.post_count) {
      return { change: Math.round(d1.total_engagement / d1.post_count - d0.total_engagement / d0.post_count) };
    }
    return null;
  })() : null;
  document.getElementById('kpi-avg-engagement-per-post').innerHTML = fmt(avgEngPerPost) + gradeBadgeHtml(getGrade(marketerBenchmarks['kpi-avg-engagement-per-post'], avgEngPerPost)) + changeBadge(engPerPostChange);

  const mReaches = posts.map(p => p.reach).filter(v => v != null);
  const mLatestFollowers = followers.length ? followers[followers.length - 1].followers : null;
  const reachRate = mLatestFollowers ? (avg(mReaches) / mLatestFollowers * 100) : 0;
  document.getElementById('kpi-reach-rate').innerHTML = fmtPct(reachRate) + gradeBadgeHtml(getGrade(marketerBenchmarks['kpi-reach-rate'], reachRate));

  // ── Contribution Analysis (운영 기여도) ──
  renderContribution();

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

  document.getElementById('chart-type-compare').innerHTML = '';
  trackChart(new ApexCharts(document.getElementById('chart-type-compare'), {
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
  })).render();
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
  follows:    () => ({ title: '팔로우', field: 'follows', width: 80, hozAlign: 'right', sorter: 'number',
    formatter: cell => fmtWithChange(cell.getValue(), 'follows', cell.getRow().getData()) }),
  follow_rate: () => ({ title: '팔로우 전환율', field: 'follow_rate', width: 105, hozAlign: 'right', sorter: 'number',
    formatter: cell => {
      const v = cell.getValue();
      if (v == null) return '-';
      const color = v >= 1 ? '#00c853' : v >= 0.3 ? '#ffd600' : '#9499b3';
      return `<span style="color:${color}">${v.toFixed(2)}%</span>`;
    }}),
  composite_score: () => ({ title: '점수', field: 'composite_score', width: 65, hozAlign: 'right', sorter: 'number',
    formatter: cell => { const v = cell.getValue(); return v != null ? v.toFixed(1) : '-'; }}),
};

// Default column order
const defaultOrder = ['rank','upload_date','media_type','category','title','reach','views','likes','saves','shares','comments','follows','follow_rate','engagement_rate','composite_score'];

// Column toggle (visible columns)
const colLabels = {
  rank: '순위', upload_date: '업로드일', media_type: '유형', category: '카테고리',
  title: '제목', reach: '도달', views: '조회수', likes: '좋아요',
  saves: '저장', shares: '공유', comments: '댓글',
  follows: '팔로우', follow_rate: '팔로우 전환율',
  engagement_rate: '참여율', composite_score: '점수',
};
// title is always visible (non-toggleable)
let visibleColumns = new Set(defaultOrder);

// Build columns with the sort-target field moved right after title
function buildColumns(sortField) {
  let order = [...defaultOrder].filter(key => visibleColumns.has(key));
  const metricsFields = ['reach','views','likes','saves','shares','comments','follows','follow_rate','engagement_rate'];
  if (metricsFields.includes(sortField) && order.includes(sortField)) {
    const idx = order.indexOf(sortField);
    const titleIdx = order.indexOf('title');
    if (titleIdx >= 0 && idx > titleIdx + 1) {
      order.splice(idx, 1);
      order.splice(titleIdx + 1, 0, sortField);
    }
  }
  return order.map(key => colDef[key]());
}

// Column toggle UI
function renderColumnToggle() {
  const container = document.getElementById('col-toggle-list');
  if (!container) return;
  container.innerHTML = '';
  defaultOrder.forEach(key => {
    if (key === 'title') return; // title은 항상 표시
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = visibleColumns.has(key);
    cb.dataset.col = key;
    cb.addEventListener('change', () => {
      if (cb.checked) visibleColumns.add(key);
      else visibleColumns.delete(key);
      if (postTable) {
        postTable.setColumns(buildColumns(currentSortField));
      }
    });
    label.appendChild(cb);
    label.appendChild(document.createTextNode(colLabels[key] || key));
    container.appendChild(label);
  });
}

// Toggle panel show/hide
document.getElementById('col-toggle-btn')?.addEventListener('click', () => {
  const panel = document.getElementById('col-toggle-panel');
  const btn = document.getElementById('col-toggle-btn');
  if (panel.style.display === 'none') {
    panel.style.display = 'block';
    btn.classList.add('active');
    renderColumnToggle();
  } else {
    panel.style.display = 'none';
    btn.classList.remove('active');
  }
});

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

// ── Day-of-Week Chart ──
let dowChartInstance = null;
let dowCurrentMode = 'all';

// 게시물에서 사용 가능한 연도/월 목록 추출
function getAvailableYearMonths() {
  const ym = new Set();
  filterByMilestone(DATA.posts).forEach(p => {
    const d = parseUploadDate(p.upload_date);
    if (d) ym.add(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  });
  return [...ym].sort().reverse(); // 최신순
}

// ISO 주차 계산
function getWeekNumber(date) {
  const d = new Date(date); d.setHours(0,0,0,0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

// 특정 월의 주차 목록 생성
function getWeeksInMonth(year, month) {
  const weeks = new Map();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let i = 1; i <= daysInMonth; i++) {
    const dt = new Date(year, month, i);
    const wn = getWeekNumber(dt);
    if (!weeks.has(wn)) {
      const dayChar = ['일','월','화','수','목','금','토'][dt.getDay()];
      weeks.set(wn, { weekNum: wn, start: dt, label: `${i}일~` });
    }
  }
  // 라벨 보정: 시작일~종료일
  const result = [...weeks.values()];
  for (let i = 0; i < result.length; i++) {
    const next = i < result.length - 1 ? result[i + 1].start : new Date(year, month + 1, 0);
    const endDay = i < result.length - 1 ? new Date(next.getTime() - 86400000).getDate() : new Date(year, month + 1, 0).getDate();
    result[i].label = `${result[i].start.getDate()}일~${endDay}일`;
    result[i].endDate = new Date(year, month, endDay, 23, 59, 59);
  }
  return result;
}

// 셀렉터 UI 업데이트
function updateDowSelectors(mode, keepValues) {
  const container = document.getElementById('dow-selectors');
  const prevYear = keepValues ? document.getElementById('dow-year')?.value : null;
  const prevMonth = keepValues ? document.getElementById('dow-month')?.value : null;
  container.innerHTML = '';
  if (mode === 'all') return;

  const yms = getAvailableYearMonths();
  if (!yms.length) return;

  const latest = yms[0].split('-');
  const defYear = prevYear || latest[0];
  const years = [...new Set(yms.map(ym => ym.split('-')[0]))];

  // 년도 셀렉터
  const yearSel = document.createElement('select');
  yearSel.id = 'dow-year';
  years.forEach(y => { const o = document.createElement('option'); o.value = y; o.textContent = y + '년'; yearSel.appendChild(o); });
  yearSel.value = years.includes(defYear) ? defYear : years[0];
  container.appendChild(yearSel);

  // 월 셀렉터
  const monthSel = document.createElement('select');
  monthSel.id = 'dow-month';
  const populateMonths = () => {
    monthSel.innerHTML = '';
    for (let m = 1; m <= 12; m++) {
      const key = `${yearSel.value}-${String(m).padStart(2,'0')}`;
      if (yms.includes(key)) { const o = document.createElement('option'); o.value = m; o.textContent = m + '월'; monthSel.appendChild(o); }
    }
  };
  populateMonths();
  if (prevMonth && [...monthSel.options].some(o => o.value === prevMonth)) {
    monthSel.value = prevMonth;
  } else {
    // 기본: 해당 년도의 최신 월
    const lastOpt = monthSel.options[monthSel.options.length - 1];
    if (lastOpt) monthSel.value = lastOpt.value;
  }
  container.appendChild(monthSel);

  // 주별: 주차 셀렉터 추가
  const addWeekSelector = () => {
    const oldWeek = document.getElementById('dow-week');
    if (oldWeek) oldWeek.remove();
    if (mode !== 'week') return;
    const weeks = getWeeksInMonth(parseInt(yearSel.value), parseInt(monthSel.value) - 1);
    const weekSel = document.createElement('select');
    weekSel.id = 'dow-week';
    weeks.forEach((w, i) => { const o = document.createElement('option'); o.value = i; o.textContent = `${i+1}주 (${w.label})`; weekSel.appendChild(o); });
    weekSel.value = String(weeks.length - 1);
    container.appendChild(weekSel);
    weekSel.addEventListener('change', () => renderDowChartData());
  };
  addWeekSelector();

  // 이벤트
  yearSel.addEventListener('change', () => {
    populateMonths();
    addWeekSelector();
    renderDowChartData();
  });
  monthSel.addEventListener('change', () => {
    addWeekSelector();
    renderDowChartData();
  });
}

// 실제 차트 데이터 렌더링
function renderDowChartData() {
  const posts = filterByMilestone(DATA.posts);
  const mode = dowCurrentMode;
  if (dowChartInstance) dowChartInstance.destroy();

  const yearEl = document.getElementById('dow-year');
  const monthEl = document.getElementById('dow-month');
  const selYear = yearEl ? parseInt(yearEl.value) : null;
  const selMonth = monthEl ? parseInt(monthEl.value) - 1 : null; // 0-indexed

  // ── 일별 모드: 해당 월 전체 날짜별 ──
  if (mode === 'daily') {
    const monthPosts = posts.filter(p => {
      const d = parseUploadDate(p.upload_date);
      return d && d.getFullYear() === selYear && d.getMonth() === selMonth;
    });
    const daysInMonth = new Date(selYear, selMonth + 1, 0).getDate();
    const allDays = [];
    for (let i = 1; i <= daysInMonth; i++) {
      const dt = new Date(selYear, selMonth, i);
      const dayChar = ['일','월','화','수','목','금','토'][dt.getDay()];
      allDays.push({ date: dt, label: `${String(i).padStart(2,'0')}(${dayChar})`, reach: [], eng: [] });
    }
    monthPosts.forEach(p => {
      const d = parseUploadDate(p.upload_date);
      if (d) { const idx = d.getDate() - 1; if (allDays[idx]) { if (p.reach) allDays[idx].reach.push(p.reach); if (p.engagement_rate) allDays[idx].eng.push(p.engagement_rate); } }
    });
    const today = new Date();
    const entries = allDays.filter(d => d.date <= today);
    const titleLabel = `${selYear}년 ${selMonth+1}월`;

    dowChartInstance = new ApexCharts(document.getElementById('chart-daily-reach'), {
      ...chartTheme,
      series: [
        { name: '총 도달', type: 'bar', data: entries.map(e => sum(e.reach)) },
        { name: '평균 참여율', type: 'line', data: entries.map(e => e.eng.length ? +avg(e.eng).toFixed(1) : 0) },
      ],
      chart: { ...chartTheme.chart, type: 'line', height: 300 },
      xaxis: { categories: entries.map(e => e.label), labels: { style: { fontSize: '10px' }, rotate: -45, rotateAlways: true } },
      yaxis: [
        { title: { text: '총 도달', style: { color: '#9499b3' } }, labels: { formatter: v => fmt(v) } },
        { opposite: true, title: { text: '참여율(%)', style: { color: '#9499b3' } }, labels: { formatter: v => v.toFixed(1) + '%' }, min: 0 },
      ],
      colors: [chartColors.blue, chartColors.green],
      plotOptions: { bar: { borderRadius: 2, columnWidth: '70%' } },
      stroke: { width: [0, 2] }, markers: { size: [0, 3] }, grid: chartTheme.grid,
      tooltip: { ...chartTheme.tooltip, shared: true, custom: ({ dataPointIndex }) => {
        const e = entries[dataPointIndex]; const cnt = e.reach.length;
        return `<div style="padding:10px;font-size:12px"><strong>${titleLabel} ${e.label}</strong>${cnt ? ` (${cnt}개)` : ' (없음)'}<br>총 도달: <b>${fmt(sum(e.reach))}</b><br>참여율: <b>${e.eng.length ? avg(e.eng).toFixed(1) : 0}%</b></div>`;
      }},
    });
    dowChartInstance.render();
    return;
  }

  // ── 요일별 평균 모드 (전체 / 월별 / 주별) ──
  const dayOrder = ['월', '화', '수', '목', '금', '토', '일'];
  let filtered = posts;
  let modeLabel = '전체';

  if (mode === 'month') {
    filtered = posts.filter(p => { const d = parseUploadDate(p.upload_date); return d && d.getFullYear() === selYear && d.getMonth() === selMonth; });
    modeLabel = `${selYear}년 ${selMonth+1}월`;
  } else if (mode === 'week') {
    const weeks = getWeeksInMonth(selYear, selMonth);
    const weekEl = document.getElementById('dow-week');
    const wi = weekEl ? parseInt(weekEl.value) : weeks.length - 1;
    const week = weeks[wi];
    if (week) {
      filtered = posts.filter(p => {
        const d = parseUploadDate(p.upload_date);
        return d && d >= week.start && d <= week.endDate;
      });
      modeLabel = `${selYear}년 ${selMonth+1}월 ${wi+1}주차 (${week.label})`;
    }
  }

  const dayMap = {};
  dayOrder.forEach(d => { dayMap[d] = { reach: [], eng: [], count: 0 }; });
  filtered.forEach(p => {
    const m = p.upload_date.match(/\((.)\)/);
    if (m && dayMap[m[1]]) { dayMap[m[1]].count++; if (p.reach) dayMap[m[1]].reach.push(p.reach); if (p.engagement_rate) dayMap[m[1]].eng.push(p.engagement_rate); }
  });
  const stats = dayOrder.map(d => ({ day: d, count: dayMap[d].count, avgReach: avg(dayMap[d].reach), avgEng: avg(dayMap[d].eng) }));

  dowChartInstance = new ApexCharts(document.getElementById('chart-daily-reach'), {
    ...chartTheme,
    series: [
      { name: '평균 도달', type: 'bar', data: stats.map(s => Math.round(s.avgReach)) },
      { name: '평균 참여율', type: 'line', data: stats.map(s => +s.avgEng.toFixed(1)) },
    ],
    chart: { ...chartTheme.chart, type: 'line', height: 300 },
    xaxis: { categories: stats.map(s => s.day + '요일'), labels: { style: { fontSize: '12px' } } },
    yaxis: [
      { title: { text: '평균 도달', style: { color: '#9499b3' } }, labels: { formatter: v => fmt(v) } },
      { opposite: true, title: { text: '참여율(%)', style: { color: '#9499b3' } }, labels: { formatter: v => v.toFixed(1) + '%' }, min: 0 },
    ],
    colors: [chartColors.blue, chartColors.green],
    plotOptions: { bar: { borderRadius: 4, columnWidth: '55%' } },
    stroke: { width: [0, 3] }, markers: { size: [0, 5] }, grid: chartTheme.grid,
    tooltip: { ...chartTheme.tooltip, shared: true, custom: ({ dataPointIndex }) => {
      const s = stats[dataPointIndex];
      return `<div style="padding:10px;font-size:12px"><strong>${s.day}요일</strong> [${modeLabel}] (${s.count}개)<br>평균 도달: <b>${fmt(Math.round(s.avgReach))}</b><br>참여율: <b>${s.avgEng.toFixed(1)}%</b></div>`;
    }},
    annotations: { xaxis: [{
      x: stats.reduce((best, s) => s.avgReach > best.avgReach && s.count > 0 ? s : best, stats[0]).day + '요일',
      borderColor: chartColors.accent3,
      label: { text: '최적 업로드 요일', style: { background: chartColors.accent3, color: '#fff', fontSize: '11px', padding: { left: 6, right: 6, top: 2, bottom: 2 } } },
    }]},
  });
  dowChartInstance.render();
}

// 모드 전환 진입점
function renderDowChart(mode) {
  dowCurrentMode = mode;
  document.querySelectorAll('#dow-toggle .toggle-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));
  updateDowSelectors(mode);
  renderDowChartData();
}

// 토글 이벤트 바인딩
document.getElementById('dow-toggle')?.addEventListener('click', e => {
  const btn = e.target.closest('.toggle-btn');
  if (btn && btn.dataset.mode) renderDowChart(btn.dataset.mode);
});

function renderPostTable() {
  const posts = filterByMilestone(DATA.posts);
  buildYesterdayMap();

  // Populate category filter
  const categories = [...new Set(posts.map(p => p.category).filter(Boolean))].sort();
  const catSelect = document.getElementById('filter-category');
  catSelect.innerHTML = '<option value="">전체 카테고리</option>';
  categories.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    catSelect.appendChild(opt);
  });

  // Initial data with original rank
  const initialData = recalcRankedData(posts, 'rank', 'asc');

  document.getElementById('post-table').innerHTML = '';
  postTable = new Tabulator('#post-table', {
    data: initialData,
    layout: 'fitColumns',
    height: '600px',
    pagination: false,
    columns: buildColumns('rank'),
  });

  // Row click → diagnosis modal
  postTable.on('rowClick', (e, row) => {
    if (e.target.tagName === 'A') return;
    showPostModal(row.getData());
  });

  // Bind event listeners only once
  if (!renderPostTable._bound) {
    renderPostTable._bound = true;
    document.getElementById('sort-select').addEventListener('change', function() {
      const [field, dir] = this.value.split('|');
      currentSortField = field;
      const rankedData = recalcRankedData(filterByMilestone(DATA.posts), field, dir);
      postTable.setColumns(buildColumns(field));
      postTable.replaceData(rankedData);
      applyFilters();
    });
    document.getElementById('filter-category').addEventListener('change', applyFilters);
    document.getElementById('filter-type').addEventListener('change', applyFilters);
    document.getElementById('filter-search').addEventListener('input', applyFilters);
  }
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
  const followers = filterFollowersByMilestone(DATA.followers);
  if (!followers.length) {
    document.getElementById('kpi-total-growth').textContent = '-';
    document.getElementById('kpi-avg-growth').textContent = '-';
    document.getElementById('kpi-current-followers').textContent = '-';
    document.getElementById('kpi-best-day').textContent = '-';
    document.getElementById('chart-follower-full').innerHTML = '';
    document.getElementById('chart-follower-change').innerHTML = '';
    return;
  }

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
  document.getElementById('chart-follower-full').innerHTML = '';
  trackChart(new ApexCharts(document.getElementById('chart-follower-full'), {
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
  })).render();

  // Daily change bar chart
  document.getElementById('chart-follower-change').innerHTML = '';
  trackChart(new ApexCharts(document.getElementById('chart-follower-change'), {
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
  })).render();
}

// ══════════════════════════════════════════════════
// TAB 4: Category Analysis
// ══════════════════════════════════════════════════
function renderCategory() {
  const posts = filterByMilestone(DATA.posts);
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
  document.getElementById('chart-cat-engagement').innerHTML = '';
  trackChart(new ApexCharts(document.getElementById('chart-cat-engagement'), {
    ...chartTheme,
    series: [{ name: '평균 참여율', data: catStats.map(c => +c.avgEngagement.toFixed(1)) }],
    chart: { ...chartTheme.chart, type: 'bar', height: 300 },
    xaxis: { categories: catStats.map(c => c.category), labels: { style: { fontSize: '12px' } } },
    yaxis: { labels: { formatter: v => v + '%' } },
    colors: [chartColors.accent],
    plotOptions: { bar: { borderRadius: 4, horizontal: true } },
    grid: chartTheme.grid,
    tooltip: { ...chartTheme.tooltip, y: { formatter: v => v + '%' } },
  })).render();

  // Reach bar chart
  document.getElementById('chart-cat-reach').innerHTML = '';
  trackChart(new ApexCharts(document.getElementById('chart-cat-reach'), {
    ...chartTheme,
    series: [{ name: '평균 도달', data: catStats.map(c => Math.round(c.avgReach)) }],
    chart: { ...chartTheme.chart, type: 'bar', height: 300 },
    xaxis: { categories: catStats.map(c => c.category), labels: { style: { fontSize: '12px' } } },
    yaxis: { labels: { formatter: v => fmt(v) } },
    colors: [chartColors.blue],
    plotOptions: { bar: { borderRadius: 4, horizontal: true } },
    grid: chartTheme.grid,
    tooltip: { ...chartTheme.tooltip, y: { formatter: v => fmt(v) } },
  })).render();

  // Save/Share grouped bar
  document.getElementById('chart-cat-save-share').innerHTML = '';
  trackChart(new ApexCharts(document.getElementById('chart-cat-save-share'), {
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
  })).render();

  // Category summary table
  document.getElementById('cat-summary-table').innerHTML = '';
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
  const posts = filterByMilestone(DATA.posts);
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

  // ── 지표별 TOP 3 챔피언 카드 ──
  const metrics = [
    { key: 'reach', label: '도달', icon: '📡', fmt: v => fmt(v) },
    { key: 'views', label: '조회수', icon: '👁', fmt: v => fmt(v) },
    { key: 'likes', label: '좋아요', icon: '❤️', fmt: v => fmt(v) },
    { key: 'saves', label: '저장', icon: '🔖', fmt: v => fmt(v) },
    { key: 'shares', label: '공유', icon: '🔗', fmt: v => fmt(v) },
    { key: 'comments', label: '댓글', icon: '💬', fmt: v => fmt(v) },
    { key: 'engagement_rate', label: '참여율', icon: '🔥', fmt: v => fmtPct(v) },
  ];
  const typeIcon = t => ({ 'CAROUSEL_ALBUM': '🎠', 'VIDEO': '🎬', 'IMAGE': '📸' }[t] || '📄');
  let champHtml = '';
  metrics.forEach(m => {
    const sorted = [...posts].filter(p => p[m.key] != null).sort((a, b) => b[m.key] - a[m.key]);
    const top3 = sorted.slice(0, 3);
    if (!top3.length) return;
    const first = top3[0];
    const titleLink = (p, maxLen = 28) => {
      const t = (p.title || '제목 없음').length > maxLen ? p.title.slice(0, maxLen) + '…' : (p.title || '제목 없음');
      return p.url ? `<a href="${p.url}" target="_blank" rel="noopener">${t}</a>` : t;
    };
    champHtml += `<div class="champion-card">`;
    champHtml += `<h4>${m.icon} ${m.label} TOP</h4>`;
    champHtml += `<div class="champion-first">`;
    champHtml += `<span class="type-icon">${typeIcon(first.media_type)}</span>`;
    champHtml += `<div class="champion-title">${titleLink(first, 40)}</div>`;
    champHtml += `<div class="champion-value">${m.fmt(first[m.key])}</div>`;
    if (first.category) champHtml += `<span class="champion-category">${first.category}</span>`;
    champHtml += `</div>`;
    // 2·3위
    top3.slice(1).forEach((p, i) => {
      champHtml += `<div class="champion-runner">`;
      champHtml += `<span class="runner-rank">${i + 2}</span>`;
      champHtml += `<span class="runner-title">${titleLink(p, 22)}</span>`;
      champHtml += `<span class="runner-value">${m.fmt(p[m.key])}</span>`;
      champHtml += `</div>`;
    });
    champHtml += `</div>`;
  });
  document.getElementById('metric-champions').innerHTML = champHtml;

  // Content type comparison grouped bar
  document.getElementById('chart-content-compare').innerHTML = '';
  trackChart(new ApexCharts(document.getElementById('chart-content-compare'), {
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
  })).render();

  // Scatter: Reach vs Engagement Rate
  const scatterSeries = Object.entries(typeMap).map(([type, items]) => ({
    name: typeLabel(type),
    data: items.filter(p => p.reach && p.engagement_rate).map(p => ({
      x: p.reach,
      y: p.engagement_rate,
      title: p.title,
    })),
  }));
  document.getElementById('chart-scatter').innerHTML = '';
  trackChart(new ApexCharts(document.getElementById('chart-scatter'), {
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
  })).render();

  // Top 10 table
  const top10 = [...posts].sort((a, b) => (a.rank || 999) - (b.rank || 999)).slice(0, 10);
  document.getElementById('top10-table').innerHTML = '';
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
  const posts = filterByMilestone(DATA.posts);
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
