import test from 'node:test';
import assert from 'node:assert/strict';
import { adminView, loadAdmin, adminAction, adminTaskView } from '../src/admin.js';
import { accountView, navigation } from '../src/views.js';
import { taskDetail, courseContent } from '../src/features.js';
import { parseRoute } from '../src/api.js';

function state() {
  return { me: { user: { id: 'admin', role: 'admin', username: '管理员' } }, route: { page: 'admin', tab: 'users' }, platforms: [], tasks: [],
    admin: { search: '', owner: '', offset: 0, taskState: '', overview: { users: { enabled: 2 }, tasks: { running: 1, queued: 2, paused: 3 }, modules: [] },
      users: [{ id: 'admin', username: '管理员', role: 'admin', created_at: 1, disabled: 0, task_limit: null, effective_concurrency: 1, active_tasks: 0, running_tasks: 0 },
        { id: 'member', username: '<unsafe-member>', role: 'user', created_at: 1, disabled: 0, task_limit: 2, effective_concurrency: 1, active_tasks: 3, running_tasks: 1 }], defaultLimit: 8 } };
}
const task = { id: 'task/中文', owner: 'member', username: '<unsafe-member>', platform: 'zhs', operation: 'meeting', course_name: '<unsafe-course>', state: 'paused', detail: '等待处理', units: ['1'], completed: [], progress: 0, updated_at: 1 };

test('管理员从桌面和个人页进入用户管理，成员不渲染管理数据', () => {
  const s = state();
  assert.deepEqual(parseRoute('#/admin/tasks'), { page: 'admin', tab: 'tasks' });
  assert.match(navigation(s), /href="#\/admin\/users"/); assert.match(accountView(s), /站点管理/);
  const html = adminView(s);
  assert.match(html, /创建用户/); assert.match(html, /重置密码/); assert.match(html, /全站任务/); assert.match(html, /&lt;unsafe-member&gt;/);
  assert.doesNotMatch(html, /<unsafe-member>/);
  s.me.user.role = 'user';
  assert.doesNotMatch(navigation(s), /href="#\/admin/); assert.doesNotMatch(accountView(s), /站点管理/);
  assert.doesNotMatch(adminView(s), /unsafe|admin-create-user-form|admin-user-status/);
});

test('全站任务操作使用管理员接口，详情与日志保留不透明任务标识', async () => {
  const s = state(); s.route.tab = 'tasks'; s.admin.tasks = { tasks: [task], total: 1, offset: 0, limit: 100 };
  const html = adminView(s), detail = adminTaskView({ task, events: [{ detail: '<unsafe-event>', created_at: 1 }] });
  assert.match(html, /admin-task-resume/); assert.doesNotMatch(html, /data-action="task-resume"/);
  assert.match(detail, /\/api\/admin\/tasks\/task%2F%E4%B8%AD%E6%96%87\/logs/);
  assert.match(detail, /&lt;unsafe-event&gt;/);
  const calls = [];
  await adminAction({ dataset: { action: 'admin-task-pause', id: task.id } }, { state: s, api: async (path, options) => {
    calls.push([path, options]);
    if (options) return { task };
    return path.endsWith('/overview') ? s.admin.overview : path.endsWith('/users') ? { users: s.admin.users } : { tasks: [], total: 0, limit: 100, offset: 0 };
  }, renderPage: () => {}, toast: () => {} });
  assert.equal(calls[0][0], '/api/admin/tasks/task%2F%E4%B8%AD%E6%96%87/pause'); assert.equal(calls[0][1].method, 'POST');
});

test('退出登录或后到的刷新不能写回管理数据', async () => {
  const s = state(), old = s.admin.overview;
  const gate = Promise.withResolvers();
  const pending = loadAdmin(s, () => gate.promise);
  s.me = null;
  gate.resolve({ users: [], tasks: [] }); await pending;
  assert.equal(s.admin.overview, old);
  const next = state(), first = Promise.withResolvers();
  const slow = loadAdmin(next, () => first.promise);
  await loadAdmin(next, async path => path.endsWith('/overview') ? { version: 'new' } : { users: [] });
  first.resolve({ version: 'old', users: [] }); await slow;
  assert.equal(next.admin.overview.version, 'new');
});

test('任务详情和课程执行记录只提供纯文本日志，课程导出使用当前课程过滤条件', () => {
  const html = taskDetail({ task, events: [], workflow: null }, false);
  assert.match(html, /\/logs/); assert.doesNotMatch(html, /Markdown|CSV|JSON|Word|format=/);
  const s = { route: { page: 'course', tab: 'records', pid: 'zhs' }, course: { id: '课程/1', recruit_id: '班级/2' }, bootstrap: { quiet_hours: { active: false } }, platforms: [], tasks: [] };
  const records = courseContent(s);
  assert.match(records, /导出纯文本日志/); assert.match(records, /course=%E8%AF%BE%E7%A8%8B%2F1/);
  assert.doesNotMatch(records, /format=|CSV|JSON/);
});
