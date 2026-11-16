export function courseProgress(course, units) {
  const summary = Array.isArray(units) ? {
    completed: units.filter(unit => unit.state === 'completed').length,
    total: units.length,
    unknown: units.filter(unit => !['completed', 'not_started', 'in_progress'].includes(unit.state)).length,
  } : course.unit_progress;
  let value = typeof course.progress === 'number' && Number.isFinite(course.progress) ? Math.max(0, Math.min(100, course.progress)) : null;
  let derived = course.progress_source === 'units';
  if ((value === null || derived) && summary) {
    value = summary.total > 0 && summary.unknown === 0 ? 100 * summary.completed / summary.total : null;
    derived = value !== null;
  }
  if (value !== null) return { value, label: derived ? '目录完成度' : '学习进度', text: Math.round(value) + '%' };
  if (summary) return { value: null, label: '目录完成情况', text: summary.total === 0 ? '暂无学习单元' : summary.unknown === summary.total ? '单元状态待核对' : `${summary.completed} / ${summary.total} 单元已完成` };
  return { value: null, label: '学习进度', text: course.outline_available ? '进入课程后读取' : '暂无进度数据' };
}

export function rememberCourse(state, pid, course) {
  if (!state.courseLists?.[pid]) return;
  state.courseLists[pid] = state.courseLists[pid].map(previous => previous.id === course.id && previous.recruit_id === course.recruit_id ? { ...previous, ...course } : previous);
}
