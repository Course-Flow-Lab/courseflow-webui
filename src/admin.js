import { esc, icon, dateText, empty, badge, progress, modalFrame } from './views.js';
import { operationNames } from './features.js';

const active = task => ['queued', 'running', 'paused'].includes(task.state);
const tabs = [['users', '用户管理'], ['tasks', '全站任务'], ['settings', '站点设置']];
const button = (label, action, id = '', extra = '') => `<button class="button small" data-action="admin-${action}" data-id="${esc(id)}" ${extra}>${label}</button>`;
const errorBox = '<p class="form-error" role="alert" hidden></p>';
const userPath = id => '/api/admin/users/' + encodeURIComponent(id);
const taskPath = id => '/api/admin/tasks/' + encodeURIComponent(id);
const loading = '<div class="loading-state"><span class="spinner"></span>正在读取站点管理…</div>';

export async function loadAdmin(state, api, current = () => true) {
  if (state.me?.user.role !== 'admin') return;
  const revision = state.adminRevision = (state.adminRevision || 0) + 1;
  const data = state.admin ||= { search: '', owner: '', taskState: '', offset: 0, edit: null };
  const tab = state.route.tab || 'users';
  const query = new URLSearchParams({ offset: String(data.offset), ...(data.owner ? { owner: data.owner } : {}), ...(data.taskState ? { state: data.taskState } : {}) });
  const [overview, users, content] = await Promise.all([api('/api/admin/overview'), api('/api/admin/users'),
    tab === 'tasks' ? api('/api/admin/tasks?' + query) : tab === 'settings' ? api('/api/admin/settings') : null]);
  if (!current() || state.me?.user.role !== 'admin' || revision !== state.adminRevision) return;
  Object.assign(data, { overview, users: users.users, defaultLimit: users.default_task_limit, ...(tab === 'tasks' ? { tasks: content } : tab === 'settings' ? { settings: content.settings } : {}) });
}

export function adminView(state) {
  if (state.me.user.role !== 'admin') return empty('此页面仅管理员可用', '请使用管理员账号登录。', '<a class="button" href="#/courses">返回课程</a>', 'user');
  const tab = state.route.tab || 'users', data = state.admin;
  const head = `<header class="page-heading"><div><div class="eyebrow">工作台管理</div><h1>站点管理</h1><p class="muted">管理成员账号、全站任务与任务资源分配。</p></div>${button(`${icon('refresh')}刷新`, 'refresh')}</header>
    <nav class="detail-tabs admin-tabs" aria-label="站点管理">${tabs.map(([key, label]) => `<a href="#/admin/${key}" class="${key === tab ? 'active' : ''}"${key === tab ? ' aria-current="page"' : ''}>${label}</a>`).join('')}<a href="#/invitations">注册与邀请</a><a href="#/modules">平台模块</a><a href="#/logs">日志导出</a></nav>`;
  if (state.loading || !data?.overview) return head + loading;
  const overview = data.overview;
  const stats = `<div class="stats-strip admin-stats">${[['启用用户', overview.users.enabled], ['运行任务', overview.tasks.running], ['排队任务', overview.tasks.queued], ['暂停任务', overview.tasks.paused]].map(([label, count]) => `<div><span class="stat-value">${count}</span><span>${label}</span></div>`).join('')}</div>`;
  if (tab === 'users') return head + stats + usersView(state);
  if (tab === 'tasks') return head + stats + tasksView(state);
  if (tab === 'settings') return head + stats + settingsView(state);
  return head + empty('管理页面不存在', '请从上方选择管理功能。');
}

function usersView(state) {
  const data = state.admin;
  return `<div class="admin-users-layout"><section class="panel feature-panel"><div class="section-heading"><h2>用户账号 <span class="muted">${data.users.length} 人</span></h2></div><label class="admin-search">搜索用户<input id="admin-user-search" type="search" value="${esc(data.search)}" placeholder="用户名" autocomplete="off"></label><div id="admin-user-list">${adminUsersList(state)}</div></section>
    <section class="panel feature-panel"><h2>创建用户</h2><p class="muted">由管理员直接创建，无需邀请码。请将初始密码交给对应成员。</p><form id="admin-create-user-form"><label>用户名<input name="username" minlength="2" maxlength="32" autocomplete="off" required></label><label>初始密码<input name="password" type="password" minlength="12" autocomplete="new-password" required></label><label>角色<select name="role"><option value="user">成员</option><option value="admin">管理员</option></select></label>${errorBox}<button class="button primary" type="submit">创建用户</button></form></section></div>`;
}

export function adminUsersList(state) {
  const data = state.admin, query = data.search.trim().toLocaleLowerCase();
  const users = data.users.filter(user => user.username.toLocaleLowerCase().includes(query));
  return users.map(user => {
    const self = user.id === state.me.user.id;
    const edit = data.edit?.id === user.id ? data.edit.kind : '';
    const editor = !edit ? '' : `<form id="admin-edit-user-form" class="admin-user-editor" data-id="${esc(user.id)}" data-kind="${esc(edit)}"><label>${({ password: '新密码', limit: '并发任务上限', role: '用户角色' })[edit]}${edit === 'password' ? '<input name="value" type="password" minlength="12" autocomplete="new-password" required><small class="muted">保存后撤销此用户的全部站点登录会话。</small>' : edit === 'limit' ? `<input name="value" type="number" min="1" max="8" step="1" value="${user.task_limit ?? ''}" placeholder="站点默认：${data.defaultLimit}"><small class="muted">留空恢复站点默认；实际并发还受用户自己的任务偏好限制。</small>` : `<select name="value"><option value="user"${user.role === 'user' ? ' selected' : ''}>成员</option><option value="admin"${user.role === 'admin' ? ' selected' : ''}>管理员</option></select>`}</label>${errorBox}<div class="actions">${button('取消', 'edit-cancel')}<button class="button primary small" type="submit">保存</button></div></form>`;
    return `<article class="admin-user"><div class="admin-user-header"><span class="avatar">${esc([...user.username][0].toUpperCase())}</span><div class="admin-user-info"><h3>${esc(user.username)} ${self ? '<small class="muted">你</small>' : ''}</h3><p class="muted">注册于 ${dateText(user.created_at)} · ${user.running_tasks} 项运行 / ${user.active_tasks} 项未结束</p></div><span class="badge${user.disabled ? '' : ' state-running'}">${user.disabled ? '已停用' : user.role === 'admin' ? '管理员' : '成员'}</span></div><p class="muted">任务上限：${user.task_limit ?? data.defaultLimit}${user.task_limit === null ? '（站点默认）' : '（单独设置）'} · 当前有效并发：${user.effective_concurrency}</p><div class="actions admin-user-actions">${button('查看任务', 'user-tasks', user.id)}${button('任务上限', 'edit', user.id, 'data-kind="limit"')}${button('重置密码', 'edit', user.id, 'data-kind="password"')}${!self ? button('角色', 'edit', user.id, 'data-kind="role"') + button(user.disabled ? '启用' : '停用', 'user-status', user.id, `data-disabled="${!user.disabled}"`) : ''}${user.active_tasks ? button('暂停全部', 'user-pause-tasks', user.id) + button('停止全部', 'user-stop-tasks', user.id) : ''}</div>${editor}</article>`;
  }).join('') || '<p class="muted">没有匹配的用户。</p>';
}

export function adminTaskActions(task) {
  return `${['queued', 'running'].includes(task.state) ? button('暂停', 'task-pause', task.id) : ''}${task.state === 'paused' ? button('继续', 'task-resume', task.id) : ''}${active(task) ? button('停止', 'task-stop', task.id) : ''}${task.state === 'queued' ? button('上移', 'task-move', task.id, 'data-direction="up"') + button('下移', 'task-move', task.id, 'data-direction="down"') : ''}`;
}

function tasksView(state) {
  const data = state.admin, result = data.tasks;
  if (!result) return loading;
  return `<section class="panel feature-panel admin-task-filters"><form id="admin-task-filter-form"><label>用户<select name="owner"><option value="">全部用户</option>${data.users.map(user => `<option value="${esc(user.id)}"${data.owner === user.id ? ' selected' : ''}>${esc(user.username)}</option>`).join('')}</select></label><label>状态<select name="state"><option value="">全部状态</option>${[['queued', '排队中'], ['running', '执行中'], ['paused', '已暂停'], ['completed', '已完成'], ['failed', '失败'], ['cancelled', '已停止']].map(([value, label]) => `<option value="${value}"${data.taskState === value ? ' selected' : ''}>${label}</option>`).join('')}</select></label>${errorBox}<button class="button primary" type="submit">筛选任务</button></form></section>
    <div class="section-heading"><h2>全站任务</h2><span class="muted">共 ${result.total} 项 · 队列顺序在各用户内部调整</span></div><div class="task-list">${result.tasks.map(task => `<article class="task-card admin-task"><div class="task-main"><div class="task-title"><button class="title-button" data-action="admin-task-detail" data-id="${esc(task.id)}">${esc(task.course_name || '课程任务')}</button>${badge(task.state)}</div><p class="muted">${esc(task.username)} · ${esc(operationNames[task.operation] || task.operation)} · ${esc(task.platform)}</p><p>${esc(task.detail)}</p>${progress(task.progress)}<div class="task-meta"><span>${task.completed.length} / ${task.units.length} 单元</span><time>${dateText(task.updated_at)}</time></div></div><div class="actions">${adminTaskActions(task)}${button('详情', 'task-detail', task.id)}<a class="button small" href="${taskPath(task.id)}/logs" download>日志</a></div></article>`).join('') || empty('没有匹配的任务', '调整用户或任务状态后再查看。')}</div><div class="admin-pagination">${button('上一页', 'task-page', '', `data-offset="${Math.max(0, result.offset - result.limit)}"${result.offset === 0 ? ' disabled' : ''}`)}<span class="muted">${result.total ? result.offset + 1 : 0}–${Math.min(result.offset + result.limit, result.total)} / ${result.total}</span>${button('下一页', 'task-page', '', `data-offset="${result.offset + result.limit}"${result.offset + result.limit >= result.total ? ' disabled' : ''}`)}</div>`;
}

function settingsView(state) {
  const data = state.admin;
  if (!data.settings) return loading;
  return `<div class="feature-grid"><section class="panel feature-panel"><h2>站点任务策略</h2><form id="admin-settings-form"><label>默认每人并发任务上限<input name="max_concurrency" type="number" min="1" max="8" step="1" value="${data.settings.max_concurrency}" required></label><label class="check-label"><input name="parallel_study" type="checkbox"${data.settings.parallel_study ? ' checked' : ''}>允许用户开启跨课程并行学习</label><p class="muted">用户仍需在个人偏好中开启并行学习。实际并发取个人偏好与管理员上限的较小值；单独设置的用户上限优先于站点默认。修改影响后续调度，已运行任务可在全站任务中暂停。</p>${errorBox}<button class="button primary" type="submit">保存站点策略</button></form></section><section class="panel feature-panel"><h2>站点资源</h2>${data.overview.modules.map(module => `<div class="settings-row"><span>${esc(module.id)} · v${esc(module.version)}</span><span class="badge${module.running ? ' state-running' : ''}">${module.enabled ? module.running ? '运行中' : '待启动' : '已停用'}</span></div>`).join('')}<div class="settings-row"><span>新用户注册策略</span><a class="button" href="#/invitations">注册与邀请</a></div><div class="settings-row"><span>运行及操作记录</span><a class="button" href="#/logs">纯文本日志导出</a></div><div class="settings-row"><span>已安装的平台模块</span><a class="button" href="#/modules">管理模块</a></div></section></div>`;
}

export function adminTaskView({ task, events }) {
  return modalFrame('站点任务详情', `<div class="task-detail-title"><h3>${esc(task.course_name || '课程任务')}</h3>${badge(task.state)}</div><p class="muted">${esc(task.username)} · ${esc(operationNames[task.operation] || task.operation)}</p><p>${esc(task.detail)}</p>${progress(task.progress)}<div class="actions">${adminTaskActions(task)}<a class="button" href="${taskPath(task.id)}/logs" download>${icon('download')}导出纯文本日志</a></div><h3 class="section-title">执行记录</h3><div class="event-list">${events.map(event => `<div class="event-row"><span class="event-dot"></span><div><p>${esc(event.detail)}</p><time class="muted">${dateText(event.created_at)}</time></div></div>`).join('') || '<p class="muted">暂无执行记录。</p>'}</div>`, true);
}

function currentPage(state, who, tab) { return state.me === who && state.route.page === 'admin' && (state.route.tab || 'users') === tab; }
export const adminFormIds = ['admin-create-user-form', 'admin-edit-user-form', 'admin-settings-form', 'admin-task-filter-form'];

export async function submitAdmin(form, ctx) {
  const { state, api, renderPage, toast, expireSession } = ctx;
  const who = state.me, tab = state.route.tab || 'users', current = () => currentPage(state, who, tab);
  const body = Object.fromEntries(new FormData(form));
  let message = '设置已保存。';
  if (form.id === 'admin-create-user-form') { await api('/api/admin/users', { method: 'POST', body }); message = '用户已创建。'; }
  else if (form.id === 'admin-edit-user-form') {
    const { id, kind } = form.dataset;
    const payload = kind === 'limit' ? { limit: body.value === '' ? null : Number(body.value) } : { [kind]: body.value };
    await api(userPath(id) + '/' + kind, { method: 'POST', body: payload });
    if (kind === 'password' && id === who.user.id) { if (state.me === who) { expireSession(); toast('密码已更新，请使用新密码登录。'); } return; }
    if (current()) state.admin.edit = null;
    message = kind === 'password' ? '密码已重置，旧登录会话已撤销。' : '用户设置已保存。';
  } else if (form.id === 'admin-settings-form') await api('/api/admin/settings', { method: 'POST', body: { max_concurrency: Number(body.max_concurrency), parallel_study: form.elements.parallel_study.checked } });
  else { state.admin.owner = body.owner; state.admin.taskState = body.state; state.admin.offset = 0; }
  if (!current()) return;
  if (form.id !== 'admin-task-filter-form') toast(message);
  await loadAdmin(state, api, current);
  if (current()) renderPage();
}

export async function adminAction(target, ctx) {
  const { state, api, renderPage, toast, showAdminTask } = ctx;
  const action = target.dataset.action;
  if (!action?.startsWith('admin-')) return false;
  if (state.me?.user.role !== 'admin') return true;
  const who = state.me, tab = state.route.tab || 'users', current = () => currentPage(state, who, tab);
  const { id } = target.dataset, data = state.admin;
  if (action === 'admin-edit') { data.edit = { id, kind: target.dataset.kind }; renderPage(); return true; }
  if (action === 'admin-edit-cancel') { data.edit = null; renderPage(); return true; }
  if (action === 'admin-user-tasks') { data.owner = id; data.taskState = ''; data.offset = 0; location.hash = '#/admin/tasks'; return true; }
  if (action === 'admin-task-detail') { await showAdminTask(id); return true; }
  if (action === 'admin-task-page') data.offset = Number(target.dataset.offset);
  else if (action === 'admin-user-status') {
    const disabled = target.dataset.disabled === 'true';
    if (disabled && !confirm('停用后此用户将退出登录，未结束任务会暂停。继续停用？')) return true;
    await api(userPath(id) + '/status', { method: 'POST', body: { disabled } });
    if (current()) toast(disabled ? '用户已停用，任务已暂停。' : '用户已启用；任务可按需继续。');
  } else if (action === 'admin-user-pause-tasks' || action === 'admin-user-stop-tasks') {
    const stop = action === 'admin-user-stop-tasks';
    if (stop && !confirm('停止此用户的全部未结束任务？停止后不能继续这些任务。')) return true;
    await api(userPath(id) + (stop ? '/stop-tasks' : '/pause-tasks'), { method: 'POST' });
    if (current()) toast(stop ? '用户任务已全部停止。' : '用户任务已全部暂停。');
  } else if (action.startsWith('admin-task-')) {
    const operation = action.slice('admin-task-'.length);
    if (operation === 'stop' && !confirm('停止此任务？停止后不能继续此任务。')) return true;
    await api(taskPath(id) + '/' + operation, { method: 'POST', ...(operation === 'move' ? { body: { direction: target.dataset.direction } } : {}) });
    if (current() && state.modal?.kind === 'admin-task') await showAdminTask(id);
  }
  if (!current()) return true;
  await loadAdmin(state, api, current);
  if (current()) renderPage();
  return true;
}
