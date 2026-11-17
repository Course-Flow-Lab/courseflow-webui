import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPlatforms, selectAccount, accountMatchesTask } from '../src/accounts.js';
import { connectionsView, courseView, accountView } from '../src/views.js';
import { adminView, adminUsersList } from '../src/admin.js';
import { createApi, withAccount, courseHref, platformHref, parseRoute } from '../src/api.js';
import { loadQa } from '../src/qa.js';
import { courseContent } from '../src/features.js';
import { scoreView } from '../src/score.js';

const accounts = [{ id: 'pa_甲/1', label: '甲同学', connected: true, display_name: '平台甲' }, { id: 'pa_乙/2', label: '<乙同学>', connected: true, display_name: '平台乙' }];
const platform = () => ({ id: 'zhs', name: '智慧树', short: '智慧', login: ['qr', 'password'], operations: ['study'], module: { healthy: true, version: '1.0.0' }, accounts: structuredClone(accounts) });
const state = () => ({ me: { user: { id: 'team', role: 'team', username: '团队' } }, courseLists: {}, courseErrors: {}, qaCourses: {}, platforms: [], tasks: [], route: { page: 'connections' }, bootstrap: { quiet_hours: { active: false }, capabilities: { jobs: ['study'] } }, loading: false });
const data = (p = platform()) => ({ platforms: [p], account_quota: { limit: 2, used: 2, remaining: 0 } });

test('团队绑定界面展示同平台多个账号和全局配额，达到上限禁止新增，平台文本正确转义', () => {
  const s = state(); applyPlatforms(s, data());
  const html = connectionsView(s);
  assert.match(html, /已使用 2 \/ 2/); assert.match(html, /所有平台合并计算/);
  assert.match(html, /甲同学/); assert.match(html, /&lt;乙同学&gt;/); assert.doesNotMatch(html, /<乙同学>/);
  assert.match(html, /data-action="add-platform-account"[^>]+disabled/);
  assert.match(html, /移除绑定/); assert.match(html, /断开登录/);
  assert.match(html, /account_id=pa_%E7%94%B2%2F1/);
  assert.match(accountView(s), /团队账号/);
  s.accountQuota.remaining = 1; s.accountQuota.limit = 3;
  assert.doesNotMatch(connectionsView(s), /data-action="add-platform-account"[^>]+disabled/);
});

test('切换账号清空旧课程缓存，刷新保留当前选择，移除选中绑定后切换到可用账号', () => {
  const s = state(); applyPlatforms(s, data());
  s.courseLists.zhs = [{ name: '旧课程' }]; s.courseErrors.zhs = '旧错误';
  selectAccount(s, 'zhs', accounts[1].id);
  assert.equal(s.courseLists.zhs, undefined); assert.equal(s.courseErrors.zhs, undefined);
  assert.equal(s.platforms[0].display_name, '平台乙');
  applyPlatforms(s, data()); assert.equal(s.platforms[0].account_id, accounts[1].id);
  const p = platform(); p.accounts.pop(); applyPlatforms(s, data(p));
  assert.equal(s.platforms[0].account_id, accounts[0].id);
  assert.throws(() => selectAccount(s, 'zhs', 'other-user-account'), /找不到/);
  p.accounts = []; applyPlatforms(s, data(p)); assert.equal(s.platforms[0].connected, false); assert.equal(s.accountSelection.zhs, undefined);
});

test('平台请求、登录挑战、深链和导出保留绑定编号与原有查询条件', async t => {
  const account = accounts[0].id, course = { id: '课程/一', recruit_id: '班级?二', account_id: account };
  assert.equal(parseRoute(platformHref('zhs', account)).accountId, account);
  assert.deepEqual(parseRoute(courseHref('zhs', course, 'qa')), { page: 'course', pid: 'zhs', id: course.id, rid: course.recruit_id, tab: 'qa', accountId: account });
  assert.equal(new URLSearchParams(withAccount('/export?format=csv', account).split('?')[1]).get('format'), 'csv');
  let selected = account; const urls = [];
  t.mock.method(globalThis, 'fetch', async path => { urls.push(path); return Response.json({ ok: true }); });
  const api = createApi(() => 'csrf', () => {}, () => selected);
  await api('/api/platforms/zhs/courses/id/rid/catalog/score?part=interaction');
  selected = accounts[1].id;
  await api(withAccount('/api/platforms/zhs/login/challenge/poll', account), { method: 'POST' });
  await api('/api/tasks');
  assert.equal(new URLSearchParams(urls[0].split('?')[1]).get('account_id'), account);
  assert.equal(new URLSearchParams(urls[0].split('?')[1]).get('part'), 'interaction');
  assert.equal(new URLSearchParams(urls[1].split('?')[1]).get('account_id'), account);
  assert.equal(urls[2], '/api/tasks');
});

test('相同课程的问答草稿、执行记录及导出按账号区分，课程功能链接不会拼到查询参数后面', async () => {
  const s = state(); applyPlatforms(s, data());
  s.route = { page: 'course', pid: 'zhs', tab: 'qa' }; s.course = { id: '课程/一', recruit_id: '班级/甲', account_id: accounts[0].id };
  const api = async path => path === '/api/settings' ? { preferences: {} } : {};
  await loadQa(s, api, () => true); s.feature.drafts = ['甲的草稿'];
  s.course.account_id = accounts[1].id; await loadQa(s, api, () => true);
  assert.deepEqual(s.feature.drafts, []); s.feature.drafts = ['乙的草稿'];
  s.course.account_id = accounts[0].id; await loadQa(s, api, () => true);
  assert.deepEqual(s.feature.drafts, ['甲的草稿']);
  s.units = []; s.selected = new Set(); s.presentation = { tabs: [{ id: 'qa', label: '问答' }] };
  const html = courseView(s, '模拟内容');
  assert.match(html, /\/qa\?account_id=/); assert.doesNotMatch(html, /account_id=[^"\s]*\/qa/);
  s.route.tab = 'records'; s.tasks = accounts.map((a, i) => ({ id: a.id, account_id: a.id, platform: 'zhs', course_id: s.course.id, recruit_id: s.course.recruit_id, detail: `执行记录${i}`, operation: 'study', state: 'completed', updated_at: 1 }));
  const records = courseContent(s); assert.match(records, /执行记录0/); assert.doesNotMatch(records, /执行记录1/); assert.match(records, /account_id=/);
  s.feature = { sections: [] };
  const score = scoreView(s); assert.match(score, /format=json&amp;account_id=|format=json&account_id=/);
});

test('原有默认任务仍归原有绑定，其他账号任务不会混入，管理界面支持创建和调整团队配额', () => {
  assert.equal(accountMatchesTask({ accounts: [], account_id: 'legacy', legacy: true }, { account_id: null }), true);
  assert.equal(accountMatchesTask({ accounts: [], account_id: 'new', legacy: false }, { account_id: null }), false);
  const s = state(); s.me.user.role = 'admin'; s.route = { page: 'admin', tab: 'users' };
  s.admin = { search: '', defaultLimit: 8, defaultTeamLimit: 10, overview: { users: { enabled: 1 }, tasks: {} }, users: [{ id: 'team-id', username: '团队', role: 'team', account_quota: { used: 2, limit: 5 }, task_limit: null, effective_concurrency: 1, created_at: 1 }] };
  assert.match(adminView(s), /value="team">团队账号/); assert.match(adminView(s), /name="platform_account_limit"/);
  assert.match(adminUsersList(s), /已用 2 \/ 5/); assert.match(adminUsersList(s), /平台账号上限/);
  s.admin.edit = { id: 'team-id', kind: 'platform-account-limit' };
  assert.match(adminUsersList(s), /value="5"/); assert.match(adminUsersList(s), /降低上限会保留现有绑定/);
});
