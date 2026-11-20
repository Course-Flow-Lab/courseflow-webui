import { createApi, platformPath, coursePath, parseRoute, platformHref, withAccount } from './api.js';
import * as view from './views.js';
import { applyPlatforms, selectAccount, roleName } from './accounts.js';
import * as features from './features.js';
import { captureQa, qaChange } from './qa.js';
import { adminView, loadAdmin, adminAction, adminFormIds, submitAdmin, adminTaskView, adminUsersList } from './admin.js';
import { rememberCourse } from './course-progress.js';
import { logsView, submitLogs } from './logs.js';
import { invitationsView, loadInvitations, invitationFormIds, submitInvitations, invitationAction } from './invitations.js';
import { WEBUI_VERSION } from './version.js';
import { canSelectStudyUnit, hasSelectedLockedChapter, toggleStudyPick } from './study-selection.js';

const $ = (selector) => document.querySelector(selector);
const state = {
  me: null, csrf: '', bootstrap: null, platforms: [], modules: [], tasks: [],
  courseLists: {}, courseErrors: {}, course: null, units: [], presentation: null,
  settings: null, feature: null, qaCourses: {}, studyPicks: new Set(), selected: new Set(), autoPrerequisiteQuizzes: false, captchaDragging: false, route: parseRoute(location.hash), loading: false,
  search: '', filter: 'all', taskFilter: 'all', modal: null, invitationAdmin: null, generatedInvitations: [], admin: null,
};
let routeGeneration = 0;
let sessionGeneration = 0;
let challengeGeneration = 0;
let challengeTimer;
let captchaTimer;
let captchaSession = 0;
let refreshTimer;
let toastTimer;
let refreshCount = 0;
let focusSearch = false;
const pending = new Set();
const api = createApi(() => state.csrf, expireSession, pid => state.accountSelection?.[pid]);

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('courseflow-theme', theme); } catch { /* Storage is optional. */ }
}
try {
  setTheme(localStorage.getItem('courseflow-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
} catch { setTheme('light'); }

function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4500);
}

function showError(error) {
  const box = $('#page-error');
  box.textContent = error.message || '请求失败，请稍后重试。';
  box.hidden = false;
}

function setConnection(online) {
  $('#connection-status').innerHTML = `<span class="status-dot${online ? '' : ' offline'}"></span>${online ? '已连接工作台' : '连接中断，正在重试'}`;
}

function expireSession() {
  sessionGeneration += 1;
  routeGeneration += 1;
  clearTimeout(refreshTimer);
  closeModal();
  Object.assign(state, { me: null, csrf: '', platforms: [], accountSelection: {}, accountQuota: null, modules: [], tasks: [], courseLists: {}, courseErrors: {}, course: null, units: [], settings: null, feature: null, qaCourses: {}, studyPicks: new Set(), selected: new Set(), autoPrerequisiteQuizzes: false, invitationAdmin: null, generatedInvitations: [], admin: null });
  $('#workspace').hidden = true;
  $('#page').replaceChildren();
  $('#auth').hidden = false;
  renderAuth();
}

function renderAuth() {
  const mode = parseRoute(location.hash).page;
  const register = !state.bootstrap?.setup_required && mode === 'register';
  $('#auth').innerHTML = view.authView(state.bootstrap, mode);
  $('#auth').setAttribute('aria-label', register ? '站点注册' : '站点登录');
  document.title = `${state.bootstrap?.setup_required ? '初始化工作台' : register ? '注册账号' : '登录工作台'} · Courseflow`;
}

function renderNavigation() {
  if (!state.me) return;
  $('#sidebar-nav').innerHTML = view.navigation(state);
  $('#account-link').innerHTML = `<span class="avatar">${view.esc([...state.me.user.username][0].toUpperCase())}</span><span><strong>${view.esc(state.me.user.username)}</strong><small>${roleName(state.me.user.role)}</small></span><span class="spacer"></span><span class="muted">⌄</span>`;
  $('#mobile-nav').innerHTML = [['courses', '课程', 'grid'], ['tasks', '任务', 'tasks'], ['connections', '连接', 'link'], ['account', '我的', 'user']].map(([page, label, icon]) => `<a href="#/${page}" class="${state.route.page === page || page === 'courses' && state.route.page === 'course' ? 'active' : ''}">${view.icon(icon)}<span>${label}</span></a>`).join('');
  const name = ({ courses: '所有课程', course: state.course?.name || '课程目录', tasks: '任务中心', connections: '平台连接', modules: '模块管理', account: '我的账号', settings: '模型与任务设置', logs: '日志导出', invitations: '注册与邀请', admin: '站点管理' })[state.route.page] || '页面不存在';
  const platform = state.platforms.find((p) => p.id === state.route.pid);
  $('#breadcrumb').innerHTML = `<a href="#/courses">工作台</a><span>/</span>${platform ? `<a href="#/platform/${encodeURIComponent(platform.id)}">${view.esc(platform.name)}</a><span>/</span>` : ''}<strong>${view.esc(state.route.page === 'courses' && platform ? '课程' : name)}</strong>`;
  document.title = `${state.route.page === 'courses' && platform ? platform.name : name} · Courseflow`;
}

function renderQuiet() {
  const quiet = state.bootstrap?.quiet_hours;
  $('#quiet-banner').hidden = !quiet?.active;
  $('#quiet-banner').textContent = '夜间暂停中 · 北京时间 23:00–07:00 暂停学习任务，课程与账号仍可查看。';
}

function renderTasks() {
  const content = view.taskbarView(state);
  $('#taskbar').hidden = !content;
  $('#taskbar').innerHTML = content;
  if (state.route.page === 'tasks' && $('#task-list')) $('#task-list').innerHTML = view.taskList(state);
}

function renderPage() {
  if (!state.me) return;
  const render = ({ courses: view.coursesView, course: (s) => view.courseView(s, features.courseContent(s)), tasks: view.tasksView,
    connections: view.connectionsView, modules: view.modulesView, account: view.accountView, settings: features.settingsView, logs: logsView, invitations: invitationsView, admin: adminView })[state.route.page];
  $('#page').innerHTML = render ? render(state) : view.empty('这个页面不存在', '从课程工作台继续浏览。', '<a class="button primary" href="#/courses">返回课程</a>');
  renderNavigation();
  renderTasks();
  renderQuiet();
  if (focusSearch && !state.loading) { $('#course-search')?.focus(); focusSearch = false; }
}

async function loadWorkspace() {
  const generation = ++sessionGeneration;
  state.bootstrap = await api('/api/bootstrap');
  let me;
  try { me = await api('/api/me'); } catch (error) {
    if (error.status !== 401) throw error;
    if (generation === sessionGeneration) expireSession();
    return;
  }
  if (generation !== sessionGeneration) return;
  state.me = me;
  state.csrf = me.csrf;
  const [platforms, tasks, modules] = await Promise.all([
    api('/api/platforms'), api('/api/tasks'), me.user.role === 'admin' ? api('/api/modules') : { modules: [] },
  ]);
  if (generation !== sessionGeneration) return;
  applyPlatforms(state, platforms);
  state.tasks = tasks.tasks;
  state.modules = modules.modules; state.builtinModules = modules.builtins || [];
  $('#auth').hidden = true;
  $('#workspace').hidden = false;
  $('#version').textContent = `界面 v${WEBUI_VERSION} · 后端 v${state.bootstrap.version}`;
  setConnection(true);
  if (['login', 'register'].includes(parseRoute(location.hash).page)) history.replaceState(null, '', '#/courses');
  await loadRoute();
  scheduleRefresh();
}

async function loadCourses(platforms, force = false) {
  const generation = sessionGeneration;
  const targets = platforms.filter((p) => p.connected && (force || !state.courseLists[p.id] || state.courseErrors[p.id]));
  const selections = targets.map(p => p.account_id);
  const results = await Promise.allSettled(targets.map((p) => api(platformPath(p.id) + '/courses')));
  if (generation !== sessionGeneration) return;
  for (let index = 0; index < targets.length; index += 1) {
    const pid = targets[index].id;
    if (selections[index] !== state.accountSelection?.[pid]) { if (targets[index].accounts) continue; }
    const result = results[index];
    if (result.status === 'fulfilled') {
      state.courseLists[pid] = result.value.courses.map(course => ({ ...course, ...(targets[index].account_id ? { account_id: targets[index].account_id } : {}) }));
      delete state.courseErrors[pid];
    } else {
      state.courseErrors[pid] = result.reason.message;
    }
  }
}

async function loadRoute(force = false) {
  const generation = ++routeGeneration;
  closeModal();
  captureQa(state);
  state.route = parseRoute(location.hash);
  $('.page-scroll').scrollTop = 0;
  state.course = null;
  state.units = [];
  state.presentation = null;
  state.studyPicks = new Set();
  state.selected = new Set();
  state.autoPrerequisiteQuizzes = false;
  $('#page-error').hidden = true;
  state.loading = ['courses', 'course', 'settings', 'invitations', 'admin'].includes(state.route.page);
  renderPage();
  try {
    if (state.route.accountId) selectAccount(state, state.route.pid, state.route.accountId);
    if (state.route.page === 'admin') {
      await loadAdmin(state, api, () => generation === routeGeneration && Boolean(state.me));
    } else if (state.route.page === 'courses') {
      await loadCourses(state.platforms.filter((p) => !state.route.pid || state.route.pid === p.id), force);
    } else if (state.route.page === 'course') {
      const route = { ...state.route };
      const platform = state.platforms.find((p) => p.id === route.pid);
      if (!platform?.connected) throw new Error('平台账号尚未连接，请先在「平台连接」中连接账号。');
      await loadCourses([platform], force);
      if (generation !== routeGeneration) return;
      if (state.courseErrors[route.pid]) throw new Error(state.courseErrors[route.pid]);
      const course = state.courseLists[route.pid]?.find((c) => c.id === route.id && c.recruit_id === route.rid);
      if (!course) throw new Error('找不到这门课程，请刷新课程列表后重试。');
      if (course.outline_available) {
        const result = await api(coursePath(route.pid, course) + '/units');
        if (generation !== routeGeneration) return;
        state.course = { ...result.course, ...(platform.account_id ? { account_id: platform.account_id } : {}) };
        state.units = result.units;
        state.presentation = result.ui;
      } else { const result = await api(coursePath(route.pid, course) + '/details'); if (generation !== routeGeneration) return; state.course = { ...(result.course ?? course), ...(platform.account_id ? { account_id: platform.account_id } : {}) }; state.presentation = result.ui; }
      rememberCourse(state, route.pid, state.course);
      await features.load(state, api, () => generation === routeGeneration && Boolean(state.me), () => { if (generation === routeGeneration && state.me) { state.loading = false; renderPage(); } });
    } else if (state.route.page === 'settings') await features.load(state, api, () => generation === routeGeneration && Boolean(state.me), () => { if (generation === routeGeneration && state.me) { state.loading = false; renderPage(); } });
    else if (state.route.page === 'invitations' && state.me.user.role === 'admin') await loadInvitations(state, api, () => generation === routeGeneration && Boolean(state.me));
  } catch (error) {
    if (generation === routeGeneration && state.me) showError(error);
  } finally {
    if (generation === routeGeneration && state.me) { state.loading = false; renderPage(); }
  }
}

async function refreshConnections() {
  const generation = sessionGeneration;
  const [platforms, modules, me] = await Promise.all([
    api('/api/platforms'), state.me.user.role === 'admin' ? api('/api/modules') : { modules: [] }, api('/api/me'),
  ]);
  if (generation !== sessionGeneration) return;
  const previousAccount = state.accountSelection?.[state.route.pid];
  state.me.user = me.user;
  applyPlatforms(state, platforms);
  state.modules = modules.modules; state.builtinModules = modules.builtins || [];
  for (const pid of Object.keys(state.courseLists)) {
    if (!state.platforms.some((p) => p.id === pid && p.connected)) {
      delete state.courseLists[pid];
      delete state.courseErrors[pid];
    }
  }
  renderNavigation();
  if (state.route.pid && previousAccount !== state.accountSelection?.[state.route.pid]) await loadRoute(true);
}

async function refreshTasks() {
  const generation = sessionGeneration;
  const [result, bootstrap] = await Promise.all([api('/api/tasks'), api('/api/bootstrap')]);
  if (generation !== sessionGeneration) return;
  const changed = JSON.stringify(state.tasks) !== JSON.stringify(result.tasks);
  const quietChanged = state.bootstrap.quiet_hours.active !== bootstrap.quiet_hours.active;
  state.tasks = result.tasks;
  state.bootstrap = bootstrap;
  if (changed || quietChanged) { renderTasks(); renderNavigation(); }
  if (quietChanged) {
    renderQuiet();
    updateSelection();
  }
  if (changed && state.modal?.kind === 'task') {
    const current = state.tasks.find((t) => t.id === state.modal.id);
    if (current && (current.state !== state.modal.taskState || JSON.stringify(current.module_update) !== JSON.stringify(state.modal.moduleUpdate))) await showTask(current.id);
  }
  setConnection(true);
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  if (!state.me) return;
  refreshTimer = setTimeout(async () => {
    try {
      if (!document.hidden) {
        await refreshTasks();
        refreshCount += 1;
        if (state.route.page === 'admin' && state.route.tab === 'tasks' && !state.modal && !document.activeElement?.closest('form')) {
          const generation = routeGeneration, who = state.me;
          const current = () => generation === routeGeneration && state.me === who;
          await loadAdmin(state, api, current);
          if (current()) renderPage();
        }
        if (state.me && refreshCount % 5 === 0) {
          await refreshConnections();
          if (['connections', 'modules', 'account'].includes(state.route.page) && !state.modal) renderPage();
        }
      }
    } catch (error) {
      setConnection(false);
      if (error.code === 'web_api_mismatch') showError(error);
    }
    scheduleRefresh();
  }, 4000);
}

function updateSelection() {
  document.querySelectorAll('[data-unit]').forEach((input) => { input.checked = state.selected.has(input.dataset.unit); });
  const autoQuiz = $('#auto-prerequisite-quizzes');
  if (autoQuiz) autoQuiz.disabled = !hasSelectedLockedChapter(state.units, state.selected);
  const count = $('#selection-count');
  if (count) count.textContent = `已选择 ${state.selected.size} 个`;
  const button = $('#study-button');
  const platform = state.platforms.find((p) => p.id === state.route.pid);
  if (button) button.disabled = !state.selected.size || state.bootstrap.quiet_hours.active ||
    !state.bootstrap.capabilities.jobs.includes('study') || !platform?.operations.includes('study');
  const all = $('#select-all');
  if (all) {
    const pendingUnits = state.units.filter((u) => canSelectStudyUnit(u, state.bootstrap.capabilities));
    all.checked = pendingUnits.length > 0 && pendingUnits.every((u) => state.selected.has(u.id));
    all.indeterminate = state.selected.size > 0 && !all.checked;
  }
}

function openModal(kind, content, extra = {}) {
  state.modal = { kind, ...extra };
  $('#modal-body').innerHTML = content;
  if (!$('#modal').open) $('#modal').showModal();
}

function closeModal() {
  const closingTest = state.modal?.kind === 'captcha-test';
  challengeGeneration += 1;
  captchaSession += 1;
  clearTimeout(challengeTimer);
  clearInterval(captchaTimer);
  stopCaptchaLive();
  captchaPointerQueue = Promise.resolve();
  state.modal = null;
  state.captchaGeo = null;
  state.captchaDrag = null;
  state.captchaDragging = false;
  if (closingTest) void api('/api/admin/captcha-test', { method: 'DELETE' }).catch(() => {});
  if ($('#modal').open) $('#modal').close();
}

function captchaHint(message) {
  const hint = $('#captcha-hint');
  if (hint) hint.textContent = message;
}

let captchaLiveTimer;
let captchaPointerQueue = Promise.resolve();
let captchaLastMove = 0;

function captchaEndpoint(test, id, input = false) {
  return test
    ? (input ? '/api/admin/captcha-test/input' : '/api/admin/captcha-test')
    : '/api/tasks/' + encodeURIComponent(id) + '/captcha';
}

function drawCaptcha(challenge) {
  const canvas = $('#captcha-canvas');
  if (!canvas) return;
  state.captchaGeo = {
    x: Number(challenge.x), y: Number(challenge.y),
    width: Number(challenge.width), height: Number(challenge.height),
  };
  const image = new Image();
  image.onload = () => {
    if (!canvas.isConnected) return;
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext('2d').drawImage(image, 0, 0);
    canvas.hidden = false;
    const loading = $('#captcha-loading');
    if (loading) loading.hidden = true;
  };
  image.src = 'data:' + challenge.mime + ';base64,' + challenge.image;
}

function queueCaptchaPointer(action) {
  const modal = state.modal;
  if (!modal || !['captcha', 'captcha-test'].includes(modal.kind)) return;
  const test = modal.kind === 'captcha-test';
  const path = captchaEndpoint(test, modal.id, true);
  captchaPointerQueue = captchaPointerQueue.then(() => {
    const current = state.modal;
    if (!current || current.kind !== modal.kind || current.id !== modal.id) return;
    return api(path, { method: 'POST', body: action });
  }).catch((error) => {
    captchaHint(error.message || '验证码操作失败，请重试。');
  });
}

function stopCaptchaLive() {
  clearInterval(captchaLiveTimer);
  captchaLiveTimer = undefined;
}

function startCaptchaLive(test, id, generation) {
  stopCaptchaLive();
  captchaLiveTimer = setInterval(() => {
    if (!state.captchaDragging || generation !== captchaSession) return;
    void liveCaptchaFrame(test, id, generation);
  }, 120);
}

async function liveCaptchaFrame(test, id, generation) {
  try {
    const challenge = await api(captchaEndpoint(test, id));
    if (!state.captchaDragging || generation !== captchaSession) return;
    const modal = state.modal;
    if (!modal || (test ? modal.kind !== 'captcha-test' : modal.kind !== 'captcha' || modal.id !== id)) return;
    if (challenge.state === 'ready') drawCaptcha(challenge);
  } catch { /* A frame can race with the popup closing. */ }
}

async function refreshCaptcha(id, generation) {
  if (generation !== captchaSession || state.modal?.kind !== 'captcha' || state.modal.id !== id) return;
  if (state.captchaDragging) return;
  try {
    const [challenge, snapshot] = await Promise.all([
      api('/api/tasks/' + encodeURIComponent(id) + '/captcha'),
      api('/api/tasks/' + encodeURIComponent(id)),
    ]);
    if (generation !== captchaSession || state.modal?.kind !== 'captcha' || state.modal.id !== id) return;
    if (!snapshot.task.manual_captcha) {
      closeModal();
      toast('验证已完成，任务会继续执行。');
      await refreshTasks();
      return;
    }
    if (challenge.state === 'unavailable') {
      captchaHint('验证码已结束，任务会继续执行。');
      return;
    }
    if (challenge.state !== 'ready') {
      const loading = $('#captcha-loading');
      if (loading) loading.hidden = false;
      captchaHint('正在等待官方验证码加载…');
      return;
    }
    drawCaptcha(challenge);
    captchaHint('请拖动图片底部左侧的滑块（不要拖动上方拼图块）；点选验证请直接点击目标。');
  } catch (error) {
    if (generation === captchaSession) captchaHint(error.message || '读取验证码失败，请刷新重试。');
  }
}

async function refreshCaptchaTest(generation) {
  if (generation !== captchaSession || state.modal?.kind !== 'captcha-test') return;
  if (state.captchaDragging) return;
  try {
    const challenge = await api('/api/admin/captcha-test');
    if (generation !== captchaSession || state.modal?.kind !== 'captcha-test') return;
    if (challenge.state !== 'ready') {
      const loading = $('#captcha-loading');
      if (loading) loading.hidden = false;
      captchaHint('正在等待官方验证码加载…');
      return;
    }
    drawCaptcha(challenge);
    captchaHint('测试页面：请拖动底部左侧滑块，或点击点选目标。');
  } catch (error) {
    if (generation === captchaSession) captchaHint(error.message || '读取测试验证码失败。');
  }
}

function bindCaptchaCanvas(id, generation) {
  const canvas = $('#captcha-canvas');
  if (!canvas) return;
  const point = (event) => {
    const geo = state.captchaGeo;
    const rect = canvas.getBoundingClientRect();
    if (!geo || !rect.width || !rect.height) return null;
    return {
      x: geo.x + (event.clientX - rect.left) * geo.width / rect.width,
      y: geo.y + (event.clientY - rect.top) * geo.height / rect.height,
    };
  };
  canvas.addEventListener('pointerdown', (event) => {
    if (!state.captchaGeo || canvas.hidden) return;
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    state.captchaDragging = true;
    state.captchaDrag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY };
    captchaLastMove = 0;
    canvas.classList.add('dragging');
    const position = point(event);
    if (!position) return;
    queueCaptchaPointer({ type: 'press', x: position.x, y: position.y });
    startCaptchaLive(state.modal?.kind === 'captcha-test', state.modal?.id, generation);
    captchaHint('正在实时同步滑块位置…');
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!state.captchaDrag || event.pointerId !== state.captchaDrag.pointerId) return;
    event.preventDefault();
    const now = Date.now();
    if (now - captchaLastMove < 60) return;
    captchaLastMove = now;
    const position = point(event);
    if (position) queueCaptchaPointer({ type: 'move', x: position.x, y: position.y });
  });
  const finish = (event) => {
    const drag = state.captchaDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const test = state.modal?.kind === 'captcha-test';
    const modalId = state.modal?.id;
    const position = point(event);
    state.captchaDrag = null;
    state.captchaDragging = false;
    canvas.classList.remove('dragging');
    stopCaptchaLive();
    if (position) queueCaptchaPointer({ type: 'release', x: position.x, y: position.y });
    captchaHint('已松开，正在确认验证码…');
    setTimeout(() => {
      if (test) void refreshCaptchaTest(generation);
      else if (modalId) void refreshCaptcha(modalId, generation);
    }, 350);
  };
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);
}

async function openCaptchaTest() {
  const generation = ++captchaSession;
  clearInterval(captchaTimer);
  stopCaptchaLive();
  captchaPointerQueue = Promise.resolve();
  state.captchaGeo = null;
  state.captchaDrag = null;
  state.captchaDragging = false;
  openModal('captcha-test', view.captchaModalView({}, true), { id: 'test' });
  bindCaptchaCanvas('test', generation);
  try {
    await api('/api/admin/captcha-test', { method: 'POST' });
  } catch (error) {
    captchaHint(error.message || '启动验证码测试失败。');
    return;
  }
  await refreshCaptchaTest(generation);
  captchaTimer = setInterval(() => {
    if (generation === captchaSession && state.modal?.kind === 'captcha-test') void refreshCaptchaTest(generation);
  }, 1500);
}

async function openCaptcha(id) {
  const task = state.tasks.find((item) => item.id === id);
  const generation = ++captchaSession;
  clearInterval(captchaTimer);
  stopCaptchaLive();
  captchaPointerQueue = Promise.resolve();
  state.captchaGeo = null;
  state.captchaDrag = null;
  state.captchaDragging = false;
  openModal('captcha', view.captchaModalView(task || { id }), { id });
  bindCaptchaCanvas(id, generation);
  await refreshCaptcha(id, generation);
  captchaTimer = setInterval(() => {
    if (generation === captchaSession && state.modal?.kind === 'captcha') void refreshCaptcha(id, generation);
  }, 1500);
}

async function connect(pid, method, accountId) {
  if (accountId) selectAccount(state, pid, accountId);
  const platform = state.platforms.find((p) => p.id === pid);
  const methods = Array.isArray(platform?.login) ? platform.login : [];
  const chosen = method || (methods.includes('qr') ? 'qr' : methods.includes('password') ? 'password' : '');
  if (!chosen) { toast('该平台没有可用的登录方式。'); return; }
  if (chosen === 'password') return connectPassword(pid);
  return connectQr(pid);
}

async function connectQr(pid) {
  const accountId = state.accountSelection?.[pid];
  closeModal();
  const generation = challengeGeneration;
  const result = await api(withAccount(platformPath(pid) + '/login', accountId), { method: 'POST', body: { method: 'qr' } });
  if (generation !== challengeGeneration || !state.me) return;
  const challenge = result.challenge;
  const name = state.platforms.find((p) => p.id === pid)?.name || pid;
  const image = typeof challenge.image === 'string' && /^(data:image\/(png|jpeg|gif|webp|svg\+xml)[;,]|https:\/\/)/i.test(challenge.image) ? challenge.image : '';
  openModal('login', view.modalFrame(`连接${name}`, `<div class="qr-area">${image ? `<img class="qr" src="${view.esc(image)}" alt="${view.esc(name)}登录二维码">` : '<p>平台尚未提供二维码，请稍后重试。</p>'}<p>使用平台官方应用扫码，并在手机上确认登录。</p><span id="challenge-status" class="badge">等待扫码</span></div>`), { pid, accountId });
  const handle = challenge.session || challenge.id;
  challengeTimer = setTimeout(() => void pollChallenge(pid, handle, generation, accountId), 1500);
}

async function connectPassword(pid) {
  const accountId = state.accountSelection?.[pid];
  closeModal();
  const generation = challengeGeneration;
  const result = await api(withAccount(platformPath(pid) + '/login', accountId), { method: 'POST', body: { method: 'password' } });
  if (generation !== challengeGeneration || !state.me) return;
  const challenge = result.challenge;
  const name = state.platforms.find((p) => p.id === pid)?.name || pid;
  const handle = challenge.session || challenge.id;
  const fields = Array.isArray(challenge.fields) && challenge.fields.length ? challenge.fields : [
    { name: 'username', label: '账号', type: 'text', required: true, autocomplete: 'username' },
    { name: 'password', label: '密码', type: 'password', required: true, autocomplete: 'current-password' },
  ];
  const inputs = fields.map((field) => {
    const type = field.type === 'password' ? 'password' : field.type === 'email' ? 'email' : field.type === 'tel' ? 'tel' : 'text';
    const required = field.required === false ? '' : ' required';
    const autocomplete = field.autocomplete ? ` autocomplete="${view.esc(field.autocomplete)}"` : '';
    const placeholder = field.placeholder ? ` placeholder="${view.esc(field.placeholder)}"` : '';
    return `<label>${view.esc(field.label || field.name)}<input name="${view.esc(field.name)}" type="${type}"${required}${autocomplete}${placeholder}></label>`;
  }).join('');
  openModal('login', view.modalFrame(`连接${name}`, `<form id="login-form" data-pid="${view.esc(pid)}" data-challenge="${view.esc(handle)}">${inputs}<p class="form-error" role="alert" hidden></p><div class="actions"><button class="button primary" type="submit">登录</button><button class="button" type="button" data-action="modal-close">取消</button></div></form><p><span id="challenge-status" class="badge">等待登录</span></p>`), { pid, accountId });
  challengeTimer = setTimeout(() => void pollChallenge(pid, handle, generation, accountId), 1500);
}

async function pollChallenge(pid, handle, generation, accountId) {
  if (generation !== challengeGeneration || !state.me) return;
  try {
    const result = await api(withAccount(platformPath(pid) + '/login/' + encodeURIComponent(handle) + '/poll', accountId), { method: 'POST' });
    if (generation !== challengeGeneration) return;
    if (result.state === 'connected') {
      closeModal();
      delete state.courseLists[pid];
      delete state.courseErrors[pid];
      await refreshConnections();
      toast('平台已连接，可以查看课程了。');
      location.hash = platformHref(pid, accountId);
      if (state.route.pid === pid) await loadRoute(true);
      return;
    }
    const terminal = ['expired', 'failed'].includes(result.state);
    $('#challenge-status').textContent = ({ waiting: '等待平台确认', scanned: '已扫码，等待手机确认', expired: '登录已过期，请关闭后重新连接', failed: '连接失败，请关闭后重试' })[result.state] || '等待平台确认';
    if (!terminal) challengeTimer = setTimeout(() => void pollChallenge(pid, handle, generation, accountId), 2000);
  } catch (error) {
    if (generation === challengeGeneration && $('#challenge-status')) {
      $('#challenge-status').textContent = error.message;
      if ([502, 503, 504].includes(error.status) || error.code === 'backend_unavailable') {
        challengeTimer = setTimeout(() => void pollChallenge(pid, handle, generation, accountId), 3000);
      }
    }
  }
}

function featureContext() { return { state, api, openModal, closeModal, renderPage, refreshTasks, showTask, showAdminTask, expireSession, toast, loadRoute }; }

async function showTask(id) {
  const modalVersion = challengeGeneration;
  const generation = sessionGeneration;
  const route = routeGeneration;
  const result = await api('/api/tasks/' + encodeURIComponent(id));
  if (generation !== sessionGeneration || route !== routeGeneration || modalVersion !== challengeGeneration) return;
  openModal('task', features.taskDetail(result, state.bootstrap.quiet_hours.active), { id, taskState: result.task.state, moduleUpdate: result.task.module_update });
}

async function showAdminTask(id) {
  const modalVersion = challengeGeneration, generation = sessionGeneration, route = routeGeneration;
  const result = await api('/api/admin/tasks/' + encodeURIComponent(id));
  if (generation !== sessionGeneration || route !== routeGeneration || modalVersion !== challengeGeneration || state.me?.user.role !== 'admin') return;
  openModal('admin-task', adminTaskView(result), { id });
}

function renderCourseSearch() {
  const query = state.search.trim().toLocaleLowerCase();
  const courses = state.platforms.filter((p) => !state.route.pid || p.id === state.route.pid)
    .flatMap((p) => (state.courseLists[p.id] || []).map((c) => ({ ...c, platform: p })));
  const filtered = courses.filter((c) => (!query || `${c.name} ${c.platform.name}`.toLocaleLowerCase().includes(query)) &&
    (state.filter === 'all' || (state.filter === 'completed' ? c.progress != null && c.progress >= 100 : c.progress == null || c.progress < 100)));
  if ($('#course-results')) $('#course-results').innerHTML = view.courseCards(filtered, courses.length);
}

document.addEventListener('input', (event) => {
  if (event.target.matches('[data-draft]')) qaChange({ name: 'draft-selected' }, state);
  if (event.target.id === 'admin-user-search') { state.admin.search = event.target.value; $('#admin-user-list').innerHTML = adminUsersList(state); }
  if (event.target.id === 'course-search') { state.search = event.target.value; renderCourseSearch(); }
});

document.addEventListener('change', (event) => {
  const target = event.target;
  if (target.matches('#admin-create-user-form [name="role"]')) {
    const field = $('#admin-team-account-limit');
    field.hidden = target.value !== 'team';
    field.querySelector('input').disabled = field.hidden;
    return;
  }
  if (qaChange(target, state)) return;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.id === 'auto-prerequisite-quizzes') state.autoPrerequisiteQuizzes = target.checked;
  if (target.dataset.unit || target.id === 'select-all') {
    const available = state.units.filter((u) => canSelectStudyUnit(u, state.bootstrap.capabilities));
    if (target.dataset.unit) {
      state.selected = toggleStudyPick(available, state.studyPicks, target.dataset.unit, target.checked);
    } else {
      state.studyPicks = new Set(target.checked ? available.map(unit => unit.id) : []);
      state.selected = new Set(state.studyPicks);
    }
    updateSelection();
  }
});

document.addEventListener('submit', async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || ![...features.formIds, ...invitationFormIds, ...adminFormIds, 'auth-form', 'install-form', 'config-form', 'login-form', 'logs-form', 'platform-account-form'].includes(form.id)) return;
  event.preventDefault();
  if (pending.has(form.id)) return;
  pending.add(form.id);
  const submit = event.submitter || form.querySelector('[type="submit"]');
  const errorBox = form.querySelector('.form-error');
  errorBox.hidden = true;
  if (submit) submit.disabled = true;
  const data = Object.fromEntries(new FormData(form));
  try {
    if (form.id === 'logs-form') await submitLogs(form, api, toast);
    else if (adminFormIds.includes(form.id)) await submitAdmin(form, featureContext());
    else if (invitationFormIds.includes(form.id)) await submitInvitations(form, featureContext());
    else if (features.formIds.includes(form.id)) await features.submit(form, featureContext());
    else if (form.id === 'auth-form') {
      const mode = form.dataset.mode;
      if (mode === 'register' && data.password !== data.password_confirmation) throw new Error('两次输入的密码不一致。');
      delete data.password_confirmation;
      const path = '/api/auth/' + mode;
      await api(path, { method: 'POST', body: data });
      await loadWorkspace();
    } else if (form.id === 'platform-account-form') {
      const who = state.me, pid = form.dataset.pid;
      const result = await api(platformPath(pid) + '/accounts', { method: 'POST', body: { label: data.label } });
      if (state.me !== who) return;
      closeModal();
      await refreshConnections();
      if (state.me !== who) return;
      selectAccount(state, pid, result.account.id);
      renderPage();
      toast('账号位已添加，选择登录方式完成连接。');
    } else if (form.id === 'install-form') {
      await api('/api/modules/install', { method: 'POST', body: { path: data.path.trim() } });
      closeModal();
      await refreshConnections();
      await refreshTasks();
      renderPage();
      toast('模块已安装。旧任务的迁移状态可在任务详情查看。');
    } else if (form.id === 'login-form') {
      const pid = form.dataset.pid;
      const challenge = form.dataset.challenge;
      const generation = challengeGeneration, accountId = state.modal?.accountId;
      const fields = {};
      for (const [key, value] of Object.entries(data)) if (!key.startsWith('__')) fields[key] = String(value);
      const result = await api(withAccount(platformPath(pid) + '/login/' + encodeURIComponent(challenge) + '/submit', accountId), { method: 'POST', body: { fields } });
      if (generation !== challengeGeneration || !state.me) return;
      if (result.state === 'failed') throw new Error(result.message || '登录失败，请检查账号密码。');
      if (result.state === 'expired') throw new Error('登录已过期，请重新连接。');
      challengeTimer = setTimeout(() => void pollChallenge(pid, challenge, generation, accountId), 800);
    } else {
      const settings = JSON.parse(data.settings);
      if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('模块设置必须是 JSON 对象。');
      await api('/api/modules/' + encodeURIComponent(state.modal.id) + '/config', { method: 'POST', body: { settings } });
      closeModal();
      await refreshConnections();
      renderPage();
      toast('模块设置已保存。');
    }
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.hidden = false;
  } finally { if (submit) submit.disabled = false; pending.delete(form.id); }
});

document.addEventListener('click', async (event) => {
  const target = event.target instanceof Element ? event.target.closest('[data-action]') : null;
  if (!target || target.disabled) return;
  const action = target.dataset.action;
  const id = target.dataset.id;
  const key = action + ':' + (id || '');
  if (pending.has(key)) return;
  pending.add(key);
  target.disabled = true;
  try {
    if (action === 'admin-captcha-test') { await openCaptchaTest(); return; }
    if (await adminAction(target, featureContext())) return;
    if (await features.action(target, featureContext())) return;
    if (await invitationAction(target, featureContext())) return;
    if (action === 'theme') setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    else if (action === 'find') {
      focusSearch = true;
      if (state.route.page === 'courses') { $('#course-search')?.focus(); focusSearch = false; }
      else location.hash = '#/courses';
    } else if (action === 'logout') {
      await api('/api/auth/logout', { method: 'POST' });
      expireSession();
    } else if (action === 'refresh-courses' || action === 'refresh-course') await loadRoute(true);
    else if (action === 'refresh-tasks') { await refreshTasks(); toast('任务状态已更新。'); }
    else if (action === 'filter') {
      state.filter = target.dataset.value;
      document.querySelectorAll('[data-action="filter"]').forEach((b) => { const active = b.dataset.value === state.filter; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); });
      renderCourseSearch();
    } else if (action === 'clear-search') { state.search = ''; state.filter = 'all'; renderPage(); }
    else if (action === 'task-filter') { state.taskFilter = target.dataset.value; renderPage(); }
    else if (action === 'connect') await connect(id, target.dataset.method, target.dataset.accountId);
    else if (action === 'add-platform-account') {
      openModal('add-account', view.modalFrame('添加平台账号', `<p class="muted">每个账号位占用一个跨平台配额，移除后释放。</p><form id="platform-account-form" data-pid="${view.esc(id)}"><label>账号备注<input name="label" maxlength="60" placeholder="例如：张同学 · 本学期" required></label><p class="form-error" role="alert" hidden></p><div class="actions"><button class="button primary" type="submit">添加账号位</button><button class="button" type="button" data-action="modal-close">取消</button></div></form>`));
    } else if (action === 'remove-platform-account') {
      if (!confirm('移除此绑定并停止它的未结束任务？平台上的学习记录会保留，账号名额将释放。')) return;
      await api(platformPath(id) + '/accounts/' + encodeURIComponent(target.dataset.accountId), { method: 'DELETE' });
      delete state.courseLists[id];
      await refreshConnections();
      await refreshTasks();
      renderPage();
      toast('绑定已移除，名额已释放。');
    } else if (action === 'disconnect') {
      if (target.dataset.accountId) selectAccount(state, id, target.dataset.accountId);
      await api(withAccount(platformPath(id) + '/disconnect', target.dataset.accountId), { method: 'POST' });
      delete state.courseLists[id];
      await refreshConnections();
      renderPage();
      toast('平台账号已断开。');
    } else if (action === 'task-captcha') {
      await openCaptcha(id);
    } else if (action === 'captcha-refresh') {
      if (state.modal?.kind === 'captcha') await refreshCaptcha(state.modal.id, captchaSession);
    } else if (['task-pause', 'task-resume', 'task-stop', 'task-migrate'].includes(action)) {
      const migration = action === 'task-migrate';
      const modal = state.modal;
      await api('/api/tasks/' + encodeURIComponent(id) + '/' + action.slice(5), { method: 'POST', ...(migration ? { body: { to_version: target.dataset.version } } : {}) });
      await refreshTasks();
      if (state.modal === modal && modal?.kind === 'task') await showTask(id);
      if (migration) toast('已迁移，保留了原任务进度。');
    } else if (action === 'task-detail') await showTask(id);
    else if (action === 'module-enable' || action === 'module-disable') {
      await api('/api/modules/' + encodeURIComponent(id) + '/' + action.slice(7), { method: 'POST' });
      await refreshConnections();
      renderPage();
      toast(action === 'module-enable' ? '模块已启用。' : '模块已停用。');
    } else if (action === 'install') {
      openModal('install', view.modalFrame('添加平台模块', `<p class="muted">填写服务器上的模块目录或 .tgz 安装包路径。</p><form id="install-form"><label>模块路径<input name="path" placeholder="/path/to/courseflow-module" autocomplete="off" required></label><p class="form-error" role="alert" hidden></p><div class="actions"><button class="button primary" type="submit">安装模块</button><button class="button" type="button" data-action="modal-close">取消</button></div></form>`));
    } else if (action === 'configure') {
      const module = state.modules.find((m) => m.id === id);
      openModal('config', view.modalFrame(`${module.name || id} · 模块设置`, `<p class="muted">保存后重新加载模块。平台账号通过「平台连接」管理。</p><form id="config-form"><label>模块选项（JSON）<textarea name="settings" spellcheck="false" required>${view.esc(JSON.stringify(module.settings, null, 2))}</textarea></label><p class="form-error" role="alert" hidden></p><div class="actions"><button class="button primary" type="submit">保存设置</button><button class="button" type="button" data-action="modal-close">取消</button></div></form>`), { id });
    } else if (action === 'modal-close') closeModal();
  } catch (error) {
    if (state.modal) toast(error.message); else if (state.me) showError(error);
  } finally {
    if (target.isConnected) target.disabled = false;
    if (action === 'study') updateSelection();
    pending.delete(key);
  }
});

$('#modal').addEventListener('cancel', (event) => { event.preventDefault(); closeModal(); });
window.addEventListener('hashchange', () => {
  if (location.hash === '#page') return;
  if (state.me) { $('#page-scroll').scrollTop = 0; void loadRoute(); }
  else if (state.bootstrap) renderAuth();
});
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && state.me) {
    event.preventDefault();
    if ($('#modal').open) return;
    focusSearch = true;
    if (state.route.page === 'courses') { $('#course-search')?.focus(); focusSearch = false; }
    else location.hash = '#/courses';
  }
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.me) { void refreshTasks().catch(() => setConnection(false)); scheduleRefresh(); }
});

loadWorkspace().catch((error) => {
  $('#auth').innerHTML = view.modalFrame('暂时无法打开工作台', `<p class="form-error" role="alert">${view.esc(error.message)}</p><p class="muted">请检查服务连接后刷新页面。</p><button class="button" data-action="reload">重新加载</button>`);
  document.querySelector('[data-action="reload"]')?.addEventListener('click', () => location.reload());
});
