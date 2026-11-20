import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, courseHref, coursePath } from '../src/api.js';
import { courseCards, courseView } from '../src/views.js';
import { canSelectStudyUnit, toggleStudyPick } from '../src/study-selection.js';

test('course URLs preserve opaque identifiers, including slashes and Unicode', () => {
  const course = { id: '课程/1', recruit_id: 'term?1#2' };
  const href = courseHref('example', course);
  assert.deepEqual(parseRoute(href), { page: 'course', pid: 'example', id: course.id, rid: course.recruit_id });
  assert.equal(coursePath('example', course), '/api/platforms/example/courses/%E8%AF%BE%E7%A8%8B%2F1/term%3F1%232');
  assert.deepEqual(parseRoute('#/platform/%zz'), { page: 'not-found' });
});

test('module-provided text is escaped and progress stays within native progress bounds', () => {
  const html = courseCards([{
    id: 'id', recruit_id: 'rid', name: '<img src=x onerror=alert(1)>', kind: 'video', progress: 999,
    platform: { id: 'example', name: '<script>platform</script>' },
  }], 1);
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('value="100"'));
  assert.ok(!html.includes('style='), 'CSP must not need inline progress styles');
});

test('course feature tabs navigate and completed units cannot be selected', () => {
  const html = courseView({
    loading: false, route: { pid: 'example' },
    course: { name: 'Course', outline_available: true, kind: 'shared' },
    platforms: [{ id: 'example', name: 'Platform', operations: ['study'] }],
    units: [{ id: 'done', name: 'Done', state: 'completed', selectable: true, kind: 'video' }],
    presentation: { tabs: [{ id: 'answer', label: '答题' }] }, selected: new Set(),
    bootstrap: { quiet_hours: { active: false }, capabilities: { jobs: ['study'] } },
  });
  assert.match(html, /href="[^"]*\/answer"/);
  assert.ok(!html.includes('待接入'));
  assert.match(html, /data-unit="done" disabled/);
});

test('短时试跑只在管理员的课程页显示', () => {
  const state = {
    loading: false, route: { pid: 'example' }, me: { user: { role: 'user' } },
    course: { name: '合成课程', outline_available: true, kind: 'shared' },
    platforms: [{ id: 'example', name: '合成平台', operations: ['study', 'trial'] }],
    units: [{ id: 'pending', name: '未完成视频', state: 'not_started', selectable: true, kind: 'video' }],
    presentation: { actions: [{ id: 'trial' }] }, selected: new Set(['pending']),
    bootstrap: { quiet_hours: { active: false }, capabilities: { jobs: ['study', 'trial'] } },
  };
  assert.doesNotMatch(courseView(state), /data-operation="trial"/);
  assert.match(courseView(state), /id="study-button"/);
  state.me.user.role = 'admin';
  assert.match(courseView(state), /data-operation="trial"/);
  assert.match(courseView(state), /管理员诊断/);
});

test('超星全选包含有前置任务的章节，定时开放章节仍不可选', () => {
  const state = {
    route: { pid: 'cx' },
    course: { name: '合成课程', outline_available: true },
    platforms: [{ id: 'cx', name: '超星', operations: ['study'] }],
    units: [
      { id: 'ready', name: '可学单元', state: 'not_started', selectable: true, kind: 'video' },
      { id: 'locked:2', name: '后续章节', state: 'not_started', selectable: false, selectable_after_unlock: true, kind: 'empty' },
      { id: 'locked:3', name: '定时开放', state: 'not_started', selectable: false, kind: 'empty' },
      { id: 'done', name: '已完成单元', state: 'completed', selectable: true, kind: 'video' },
    ],
    selected: new Set(),
    bootstrap: { quiet_hours: { active: false }, capabilities: { jobs: ['study'], deferred_study: true } },
  };
  const available = state.units.filter(unit => canSelectStudyUnit(unit, state.bootstrap.capabilities));
  assert.deepEqual(available.map(unit => unit.id), ['ready', 'locked:2']);
  state.selected = new Set(available.map(unit => unit.id));
  assert.match(courseView(state), /id="select-all" type="checkbox" checked/);
  assert.match(courseView(state), /data-unit="locked:2" checked aria-label/);
  assert.match(courseView(state), /data-unit="locked:3" disabled/);
  assert.doesNotMatch(courseView(state), /data-action="study-chain"/);
});

test('勾选待解锁章节补选所有前序单元，取消前置单元时同步取消依赖项', () => {
  const units = [
    { id: 'video', chapter_order: 1, selectable: true },
    { id: 'locked:2', chapter_order: 2, selectable_after_unlock: true },
    { id: 'locked:3', chapter_order: 3, selectable_after_unlock: true },
    { id: 'document', chapter_order: 1, selectable: true },
    { id: 'completed', chapter_order: 0, selectable: true, state: 'completed' },
    { id: 'timed', chapter_order: 0, selectable: false },
    { id: 'later', chapter_order: 4, selectable: true },
  ];
  const available = units.filter(unit => canSelectStudyUnit(unit, { deferred_study: true }));
  const picks = new Set(['later']);
  assert.deepEqual([...toggleStudyPick(available, picks, 'locked:3', true)], ['video', 'locked:2', 'locked:3', 'document', 'later']);
  assert.deepEqual([...toggleStudyPick(available, picks, 'video', false)], ['later']);
});

test('自动提交前置测验需有配套模块且已选待解锁章节', () => {
  const state = {
    route: { pid: 'cx' },
    course: { name: '合成课程', outline_available: true },
    platforms: [{ id: 'cx', name: '超星', operations: ['study'] }],
    units: [{ id: 'locked:2', name: '后续章节', state: 'not_started', selectable_after_unlock: true, kind: 'empty' }],
    selected: new Set(),
    bootstrap: { quiet_hours: { active: false }, capabilities: { jobs: ['study'], deferred_study: true, auto_prerequisite_quizzes: true } },
  };
  assert.doesNotMatch(courseView(state), /auto-prerequisite-quizzes/);
  state.presentation = { actions: [{ id: 'auto_prerequisite_quizzes', label: '模型自动作答并提交前置测验' }] };
  assert.match(courseView(state), /id="auto-prerequisite-quizzes" type="checkbox" disabled/);
  state.selected.add('locked:2');
  assert.match(courseView(state), /id="auto-prerequisite-quizzes" type="checkbox">/);
  state.autoPrerequisiteQuizzes = true;
  assert.match(courseView(state), /id="auto-prerequisite-quizzes" type="checkbox" checked/);
});
