(() => {
  'use strict';

  const SAMPLE_URL = './sample-routine.json';
  const STORAGE_SCHEDULE = 'routineWidget.schedule.v1';
  const STORAGE_SOURCE = 'routineWidget.source.v1';
  const STORAGE_WEATHER = 'routineWidget.weather.v1';
  const SEOUL = { latitude: 37.5665, longitude: 126.9780 };
  const DAY_LABELS = [
    { value: 1, label: '월' }, { value: 2, label: '화' }, { value: 3, label: '수' },
    { value: 4, label: '목' }, { value: 5, label: '금' }, { value: 6, label: '토' },
    { value: 0, label: '일' }
  ];

  const state = {
    schedule: { version: 1, days: {} },
    sourceName: 'sample-routine.json',
    sourceStatus: '내장 샘플',
    selectedWeekday: new Date().getDay(),
    displayedMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    weather: null,
    toastTimer: null
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    todayLabel: $('todayLabel'), weekdayTabs: $('weekdayTabs'), importButton: $('importButton'),
    menuButton: $('menuButton'), popupMenu: $('popupMenu'), importMenuButton: $('importMenuButton'),
    weatherRefreshButton: $('weatherRefreshButton'), restoreSampleButton: $('restoreSampleButton'),
    routineFileInput: $('routineFileInput'), calendarTitle: $('calendarTitle'), calendarDays: $('calendarDays'),
    prevMonthButton: $('prevMonthButton'), nextMonthButton: $('nextMonthButton'), todayMonthButton: $('todayMonthButton'),
    weatherUpdated: $('weatherUpdated'), weatherSymbol: $('weatherSymbol'), weatherTemp: $('weatherTemp'),
    weatherDescription: $('weatherDescription'), weatherHumidity: $('weatherHumidity'), weatherError: $('weatherError'),
    progressPercent: $('progressPercent'), progressCount: $('progressCount'), progressFill: $('progressFill'),
    currentClock: $('currentClock'), currentRoutineHeadline: $('currentRoutineHeadline'), currentRoutineTitle: $('currentRoutineTitle'),
    routineList: $('routineList'), sourceStatus: $('sourceStatus'), sourceName: $('sourceName'),
    lastUpdate: $('lastUpdate'), toast: $('toast')
  };

  const pad2 = (n) => String(n).padStart(2, '0');
  const minutesNow = (date) => date.getHours() * 60 + date.getMinutes();
  const formatMinute = (value) => {
    const safe = Math.max(0, Math.min(1439, Number(value) || 0));
    return `${pad2(Math.floor(safe / 60))}:${pad2(safe % 60)}`;
  };
  const formatClock = (date, seconds = false) => seconds
    ? `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
    : `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

  function normalizeSchedule(input) {
    const root = input && typeof input === 'object' ? input : {};
    const days = root.days && typeof root.days === 'object' ? root.days : root;
    const normalized = { version: Number(root.version) || 1, days: {} };
    for (let day = 0; day <= 6; day++) {
      const rows = Array.isArray(days[String(day)]) ? days[String(day)] : [];
      normalized.days[String(day)] = rows.map((item, index) => {
        const start = Number(item?.start);
        const end = Number(item?.end);
        if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > 1440) {
          throw new Error(`${day}요일 ${index + 1}번째 루틴의 시간이 올바르지 않습니다.`);
        }
        const title = String(item?.title ?? '').trim();
        if (!title) throw new Error(`${day}요일 ${index + 1}번째 루틴의 제목이 없습니다.`);
        const tasks = Array.isArray(item?.tasks) ? item.tasks.map(v => String(v).trim()).filter(Boolean) : [];
        return { start: Math.round(start), end: Math.round(end), title, tasks };
      }).sort((a, b) => a.start - b.start || a.end - b.end);
    }
    return normalized;
  }

  async function loadInitialSchedule() {
    const saved = localStorage.getItem(STORAGE_SCHEDULE);
    if (saved) {
      try {
        state.schedule = normalizeSchedule(JSON.parse(saved));
        const source = JSON.parse(localStorage.getItem(STORAGE_SOURCE) || '{}');
        state.sourceName = source.name || 'routine_schedule.html';
        state.sourceStatus = source.status || '저장된 루틴';
        return;
      } catch (_) {
        localStorage.removeItem(STORAGE_SCHEDULE);
        localStorage.removeItem(STORAGE_SOURCE);
      }
    }
    await restoreSample(false);
  }

  async function restoreSample(showMessage = true) {
    const response = await fetch(SAMPLE_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error('샘플 루틴을 읽지 못했습니다.');
    state.schedule = normalizeSchedule(await response.json());
    state.sourceName = 'sample-routine.json';
    state.sourceStatus = '내장 샘플';
    localStorage.removeItem(STORAGE_SCHEDULE);
    localStorage.removeItem(STORAGE_SOURCE);
    renderAll();
    closeMenu();
    if (showMessage) showToast('내장 샘플 루틴으로 복원했습니다.');
  }

  function saveImportedSchedule(name, status) {
    localStorage.setItem(STORAGE_SCHEDULE, JSON.stringify(state.schedule));
    localStorage.setItem(STORAGE_SOURCE, JSON.stringify({ name, status }));
  }

  function selectedItems() {
    return state.schedule.days[String(state.selectedWeekday)] || [];
  }

  function statusFor(item, now) {
    if (state.selectedWeekday !== now.getDay()) return { kind: 'waiting', progress: 0 };
    const minute = minutesNow(now);
    if (minute >= item.end) return { kind: 'done', progress: 1 };
    if (minute >= item.start && minute < item.end) {
      return { kind: 'active', progress: Math.min(1, Math.max(0, (minute - item.start) / Math.max(1, item.end - item.start))) };
    }
    return { kind: 'waiting', progress: 0 };
  }

  function activeItem(now) {
    if (state.selectedWeekday !== now.getDay()) return null;
    const minute = minutesNow(now);
    return selectedItems().find(item => minute >= item.start && minute < item.end) || null;
  }

  function nextItem(now) {
    const items = selectedItems();
    if (state.selectedWeekday !== now.getDay()) return items[0] || null;
    const minute = minutesNow(now);
    return items.find(item => item.start > minute) || null;
  }

  function dayProgress(now) {
    if (state.selectedWeekday !== now.getDay()) return { progress: 0, reached: 0, total: selectedItems().length };
    const items = selectedItems();
    const totalMinutes = items.reduce((sum, item) => sum + Math.max(0, item.end - item.start), 0);
    const minute = minutesNow(now);
    let elapsed = 0;
    let reached = 0;
    for (const item of items) {
      if (minute >= item.start) reached++;
      const duration = Math.max(0, item.end - item.start);
      if (minute >= item.end) elapsed += duration;
      else if (minute > item.start) elapsed += Math.min(duration, minute - item.start);
    }
    return { progress: totalMinutes ? Math.min(1, Math.max(0, elapsed / totalMinutes)) : 0, reached, total: items.length };
  }

  function renderWeekdays() {
    els.weekdayTabs.replaceChildren(...DAY_LABELS.map(day => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `weekday-tab${state.selectedWeekday === day.value ? ' active' : ''}`;
      button.textContent = day.label;
      button.setAttribute('aria-pressed', state.selectedWeekday === day.value ? 'true' : 'false');
      button.addEventListener('click', () => {
        state.selectedWeekday = day.value;
        renderWeekdays();
        renderDynamic(new Date());
      });
      return button;
    }));
  }

  function renderCalendar() {
    const date = state.displayedMonth;
    const year = date.getFullYear();
    const month = date.getMonth();
    els.calendarTitle.textContent = `${year}년 ${month + 1}월`;
    const first = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    const cells = [];
    for (let i = 0; i < first.getDay(); i++) cells.push(null);
    for (let day = 1; day <= lastDay; day++) cells.push(day);
    els.calendarDays.replaceChildren(...cells.map(day => {
      const cell = document.createElement('div');
      cell.className = 'calendar-day';
      const span = document.createElement('span');
      if (day == null) {
        cell.classList.add('empty');
        span.textContent = '0';
      } else {
        span.textContent = String(day);
        if (today.getFullYear() === year && today.getMonth() === month && today.getDate() === day) cell.classList.add('today');
      }
      cell.append(span);
      return cell;
    }));
  }

  function renderHeader(now) {
    const formatter = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' });
    els.todayLabel.textContent = formatter.format(now);
    els.currentClock.textContent = formatClock(now);
    const active = activeItem(now);
    if (active) {
      els.currentRoutineHeadline.textContent = '현재 루틴 진행 중';
      els.currentRoutineTitle.textContent = active.title;
    } else {
      const next = nextItem(now);
      if (next) {
        els.currentRoutineHeadline.textContent = '현재는 루틴 사이 시간이에요';
        els.currentRoutineTitle.textContent = `다음 ${formatMinute(next.start)} · ${next.title}`;
      } else {
        els.currentRoutineHeadline.textContent = selectedItems().length ? '오늘 루틴이 끝났어요' : '등록된 루틴이 없습니다';
        els.currentRoutineTitle.textContent = selectedItems().length ? '오늘도 수고했어요.' : '동기화에서 HTML 또는 JSON을 불러올 수 있어요.';
      }
    }
  }

  function renderProgress(now) {
    const result = dayProgress(now);
    els.progressPercent.textContent = `${Math.round(result.progress * 100)}%`;
    els.progressCount.textContent = `${result.reached} / ${result.total}`;
    els.progressFill.style.width = `${Math.round(result.progress * 1000) / 10}%`;
  }

  function createCard(item, status) {
    const card = document.createElement('div');
    card.className = `routine-card${status.kind === 'active' ? ' active' : ''}`;

    const grid = document.createElement('div');
    grid.className = 'card-grid';

    const time = document.createElement('div');
    time.className = 'card-time';
    time.textContent = `${formatMinute(item.start)} – ${formatMinute(item.end)}`;

    const copy = document.createElement('div');
    copy.className = 'card-copy';
    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = item.title;
    copy.append(title);
    if (item.tasks.length) {
      const tasks = document.createElement('div');
      tasks.className = 'card-tasks';
      tasks.textContent = item.tasks.join(' · ');
      copy.append(tasks);
    }
    if (status.kind === 'active') {
      const track = document.createElement('div');
      track.className = 'card-progress';
      const fill = document.createElement('div');
      fill.style.width = `${status.progress * 100}%`;
      track.append(fill);
      copy.append(track);
    }

    const pill = document.createElement('div');
    pill.className = `status-pill ${status.kind}`;
    pill.textContent = status.kind === 'done' ? '완료' : status.kind === 'active' ? '진행중' : '대기';

    grid.append(time, copy, pill);
    card.append(grid);
    return card;
  }

  function createTimelineNode(status) {
    const node = document.createElement('div');
    node.className = `timeline-node ${status.kind}`;
    if (status.kind === 'done') node.textContent = '✓';
    return node;
  }

  function addNowPointer(timeCell, status, now) {
    if (status.kind !== 'active') return;
    const pointer = document.createElement('div');
    pointer.className = 'now-pointer';
    const tag = document.createElement('div'); tag.className = 'now-tag'; tag.textContent = formatClock(now);
    const line = document.createElement('div'); line.className = 'now-line';
    const dot = document.createElement('div'); dot.className = 'now-dot';
    pointer.append(tag, line, dot);
    timeCell.append(pointer);

    requestAnimationFrame(() => {
      const h = Math.max(86, timeCell.getBoundingClientRect().height);
      const minY = 50;
      const maxY = Math.max(minY + 4, h - 18);
      pointer.style.top = `${minY + (maxY - minY) * status.progress}px`;
    });
  }

  function createGap(current, next) {
    const gap = Math.max(0, next.start - current.end);
    if (gap <= 0) return null;
    const row = document.createElement('div'); row.className = 'gap-row';
    const left = document.createElement('div'); left.className = 'gap-left';
    const end = document.createElement('div'); end.className = 'gap-time'; end.textContent = formatMinute(current.end);
    left.append(end);
    const text = document.createElement('div'); text.className = 'gap-text';
    if (gap < 60) text.textContent = `${gap}분 휴식`;
    else if (gap % 60 === 0) text.textContent = `다음 루틴까지 ${gap / 60}시간`;
    else text.textContent = `다음 루틴까지 ${Math.floor(gap / 60)}시간 ${gap % 60}분`;
    row.append(left, text);
    return row;
  }

  function renderRoutines(now) {
    const items = selectedItems();
    els.routineList.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = '이 요일에는 등록된 루틴이 없습니다.';
      els.routineList.append(empty);
      return;
    }

    items.forEach((item, index) => {
      const status = statusFor(item, now);
      const row = document.createElement('div'); row.className = 'routine-row';
      const timeCell = document.createElement('div'); timeCell.className = 'time-cell';
      const label = document.createElement('div'); label.className = 'time-label'; label.textContent = formatMinute(item.start);
      timeCell.append(label, createTimelineNode(status));
      const card = createCard(item, status);
      row.append(timeCell, card);
      els.routineList.append(row);
      addNowPointer(timeCell, status, now);

      if (index < items.length - 1) {
        const gap = createGap(item, items[index + 1]);
        if (gap) els.routineList.append(gap);
      }
    });
  }

  function renderSource(now) {
    els.sourceStatus.textContent = state.sourceStatus;
    els.sourceName.textContent = state.sourceName;
    els.lastUpdate.textContent = `마지막 업데이트 ${formatClock(now, true)}`;
  }

  function renderDynamic(now) {
    renderHeader(now);
    renderProgress(now);
    renderRoutines(now);
    renderSource(now);
  }

  function renderAll() {
    renderWeekdays();
    renderCalendar();
    renderDynamic(new Date());
  }

  function cleanImportedText(value) {
    const holder = document.createElement('textarea');
    holder.innerHTML = String(value ?? '').replace(/<[^>]+>/g, '');
    return holder.value.replace(/\s+/g, ' ').trim();
  }

  function scheduleFromHtml(htmlText) {
    const doc = new DOMParser().parseFromString(String(htmlText || ''), 'text/html');
    const dayPanels = [...doc.querySelectorAll('section.day-panel[id^="day-"]')];
    if (!dayPanels.length) throw new Error('요일별 시간표 구조(section.day-panel)를 찾지 못했습니다.');

    const schedule = { version: 1, days: {} };
    for (let day = 0; day <= 6; day++) schedule.days[String(day)] = [];

    for (const panel of dayPanels) {
      const match = panel.id.match(/^day-(\d)$/);
      if (!match) continue;
      const day = Number(match[1]);
      if (day < 0 || day > 6) continue;

      for (const article of panel.querySelectorAll('article.routine')) {
        const start = Number(article.getAttribute('data-start'));
        const end = Number(article.getAttribute('data-end'));
        const heading = article.querySelector('h3');
        const title = cleanImportedText(heading?.innerHTML || heading?.textContent || '');
        if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > 1440 || !title) continue;

        const tasks = [...article.querySelectorAll('label.task span')]
          .map(span => cleanImportedText(span.innerHTML || span.textContent || '').replace(/,+$/, '').trim())
          .filter(Boolean);

        schedule.days[String(day)].push({ start, end, title, tasks });
      }
    }

    const count = Object.values(schedule.days).reduce((sum, rows) => sum + rows.length, 0);
    if (!count) throw new Error('HTML에서 루틴(article.routine)을 찾지 못했습니다.');
    return normalizeSchedule(schedule);
  }

  async function importRoutineFile(file) {
    if (!file) return;
    if (file.size > 5_000_000) throw new Error('루틴 파일이 너무 큽니다. 5MB 이하 파일을 사용해 주세요.');
    const text = await file.text();
    const lower = (file.name || '').toLowerCase();
    const looksJson = lower.endsWith('.json') || (file.type || '').includes('json');

    if (looksJson) {
      state.schedule = normalizeSchedule(JSON.parse(text));
      state.sourceStatus = 'JSON 연동됨';
    } else {
      state.schedule = scheduleFromHtml(text);
      state.sourceStatus = 'HTML 연동됨';
    }

    state.sourceName = file.name || (looksJson ? 'routine.json' : 'routine_schedule.html');
    saveImportedSchedule(state.sourceName, state.sourceStatus);
    renderAll();
    showToast(`${state.sourceName}을 적용했습니다.`);
  }

  function weatherDescription(code) {
    if (code === 0) return ['맑음', '☀️'];
    if ([1,2].includes(code)) return ['대체로 맑음', '🌤️'];
    if (code === 3) return ['흐림', '☁️'];
    if ([45,48].includes(code)) return ['안개', '🌫️'];
    if ([51,53,55,56,57].includes(code)) return ['이슬비', '🌦️'];
    if ([61,63,65,66,67,80,81,82].includes(code)) return ['비', '🌧️'];
    if ([71,73,75,77,85,86].includes(code)) return ['눈', '🌨️'];
    if ([95,96,99].includes(code)) return ['뇌우', '⛈️'];
    return ['날씨', '☁️'];
  }

  function renderWeather() {
    const w = state.weather;
    if (!w) return;
    const [description, symbol] = weatherDescription(w.weatherCode);
    els.weatherTemp.textContent = `${Math.round(w.temperature)}°C`;
    els.weatherDescription.textContent = description;
    els.weatherHumidity.textContent = `습도 ${Math.round(w.humidity)}%`;
    els.weatherSymbol.textContent = symbol;
    els.weatherUpdated.textContent = `${w.updatedText || '--:--'} 갱신`;
  }

  async function refreshWeather(showSuccess = false) {
    els.weatherError.hidden = true;
    try {
      const url = new URL('https://api.open-meteo.com/v1/forecast');
      url.searchParams.set('latitude', String(SEOUL.latitude));
      url.searchParams.set('longitude', String(SEOUL.longitude));
      url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,weather_code');
      url.searchParams.set('timezone', 'Asia/Seoul');
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!data.current) throw new Error('현재 날씨 데이터가 없습니다.');
      const now = new Date();
      state.weather = {
        temperature: Number(data.current.temperature_2m),
        humidity: Number(data.current.relative_humidity_2m),
        weatherCode: Number(data.current.weather_code),
        updatedText: formatClock(now),
        savedAt: now.toISOString()
      };
      localStorage.setItem(STORAGE_WEATHER, JSON.stringify(state.weather));
      renderWeather();
      if (showSuccess) showToast('날씨를 새로고침했습니다.');
    } catch (error) {
      if (!state.weather) {
        const cached = localStorage.getItem(STORAGE_WEATHER);
        if (cached) {
          try { state.weather = JSON.parse(cached); renderWeather(); } catch (_) {}
        }
      }
      els.weatherError.textContent = state.weather ? '네트워크에 연결되지 않아 마지막 날씨를 표시합니다.' : `날씨를 불러오지 못했습니다: ${error.message}`;
      els.weatherError.hidden = false;
    }
  }

  function showToast(message) {
    clearTimeout(state.toastTimer);
    els.toast.textContent = message;
    els.toast.hidden = false;
    state.toastTimer = setTimeout(() => { els.toast.hidden = true; }, 2600);
  }

  function openFilePicker() {
    closeMenu();
    els.routineFileInput.value = '';
    els.routineFileInput.click();
  }
  function closeMenu() { els.popupMenu.hidden = true; els.menuButton.setAttribute('aria-expanded', 'false'); }
  function toggleMenu() {
    const willOpen = els.popupMenu.hidden;
    els.popupMenu.hidden = !willOpen;
    els.menuButton.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  }

  function bindEvents() {
    els.importButton.addEventListener('click', openFilePicker);
    els.importMenuButton.addEventListener('click', openFilePicker);
    els.menuButton.addEventListener('click', (event) => { event.stopPropagation(); toggleMenu(); });
    document.addEventListener('click', (event) => {
      if (!els.popupMenu.hidden && !els.popupMenu.contains(event.target) && event.target !== els.menuButton) closeMenu();
    });
    els.weatherRefreshButton.addEventListener('click', () => { closeMenu(); refreshWeather(true); });
    els.restoreSampleButton.addEventListener('click', () => restoreSample(true).catch(error => showToast(error.message)));
    els.routineFileInput.addEventListener('change', () => {
      importRoutineFile(els.routineFileInput.files?.[0]).catch(error => showToast(`불러오기 실패: ${error.message}`));
    });
    els.prevMonthButton.addEventListener('click', () => {
      state.displayedMonth = new Date(state.displayedMonth.getFullYear(), state.displayedMonth.getMonth() - 1, 1);
      renderCalendar();
    });
    els.nextMonthButton.addEventListener('click', () => {
      state.displayedMonth = new Date(state.displayedMonth.getFullYear(), state.displayedMonth.getMonth() + 1, 1);
      renderCalendar();
    });
    els.todayMonthButton.addEventListener('click', () => { const now = new Date(); state.displayedMonth = new Date(now.getFullYear(), now.getMonth(), 1); renderCalendar(); });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) { renderDynamic(new Date()); refreshWeather(false); }
    });
    window.addEventListener('resize', () => renderRoutines(new Date()));
  }

  async function init() {
    bindEvents();
    const cachedWeather = localStorage.getItem(STORAGE_WEATHER);
    if (cachedWeather) {
      try { state.weather = JSON.parse(cachedWeather); renderWeather(); } catch (_) {}
    }
    await loadInitialSchedule();
    renderAll();
    refreshWeather(false);

    setInterval(() => renderDynamic(new Date()), 30_000);
    setInterval(() => refreshWeather(false), 30 * 60_000);

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  init().catch(error => {
    console.error(error);
    showToast(`초기화 오류: ${error.message}`);
  });
})();
