import test from 'node:test';
import assert from 'node:assert/strict';
import { courseProgress, rememberCourse } from '../src/course-progress.js';
import { courseCards, courseView } from '../src/views.js';

const course = { id: '课程/甲', recruit_id: '班级/甲', name: '合成课程', kind: 'shared', outline_available: true, progress: null };
const platform = { id: 'zhs', name: '合成平台', operations: ['study'] };
const view = (opened, units) => courseView({ loading: false, route: { pid: 'zhs' }, course: opened, platforms: [platform], units, presentation: {}, selected: new Set(), bootstrap: { quiet_hours: { active: false }, capabilities: { jobs: ['study'] } } });

test('首次目录读取直接显示完成度，返回列表后保留相同课程和班级的进度', () => {
  const units = Array.from({ length: 66 }, (_, index) => ({ id: String(index), name: '合成单元', state: 'completed', kind: 'video' }));
  assert.match(view(course, units), /100%/); assert.doesNotMatch(view(course, units), /平台未提供/);
  const loaded = { ...course, progress: 100, progress_source: 'units', unit_progress: { completed: 66, total: 66, unknown: 0 } };
  const other = { ...course, recruit_id: '另一班级' };
  const state = { courseLists: { zhs: [course, other], cx: [{ ...course }] } };
  rememberCourse(state, 'zhs', loaded);
  assert.equal(state.courseLists.zhs[0].progress, 100);
  assert.equal(state.courseLists.zhs[1].progress, null); assert.equal(state.courseLists.cx[0].progress, null);
  const html = courseCards([{ ...state.courseLists.zhs[0], platform }], 1);
  assert.match(html, /目录完成度/); assert.match(html, /100%/);
});

test('未读取进度不冒充平台缺失或零，部分未知时仍展示已完成数量', () => {
  const unread = courseCards([{ ...course, platform }], 1);
  assert.match(unread, /进入课程后读取/); assert.doesNotMatch(unread, /平台未提供|<progress/);
  const partial = { ...course, unit_progress: { completed: 3, total: 5, unknown: 1 } };
  const html = courseCards([{ ...partial, platform }], 1);
  assert.match(html, /3 \/ 5 单元已完成/); assert.doesNotMatch(html, /<progress|0%/);
  assert.match(view(course, []), /暂无学习单元/);
});

test('平台明确给出的零进度优先，目录推算值随新状态重新计算', () => {
  const completed = [{ state: 'completed' }];
  assert.deepEqual(courseProgress({ ...course, progress: 0 }, completed), { value: 0, label: '学习进度', text: '0%' });
  assert.equal(courseProgress({ ...course, progress: 50, progress_source: 'units' }, completed).value, 100);
  assert.equal(courseProgress({ ...course, progress: 50, progress_source: 'units' }, [{ state: 'unknown' }]).value, null);
  assert.match(courseCards([{ ...course, platform, progress: 0 }], 1), /value="0"/);
});
