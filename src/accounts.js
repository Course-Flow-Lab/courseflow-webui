export const roleName = role => ({ admin: '管理员', team: '团队账号', user: '成员' })[role] || '成员';

export function selectAccount(state, pid, id) {
  const platform = state.platforms.find(p => p.id === pid);
  const account = platform?.accounts?.find(a => a.id === id);
  if (!account) throw new Error('找不到此平台账号，请刷新平台连接后重试。');
  state.accountSelection ||= {};
  if (state.accountSelection[pid] !== id) {
    delete state.courseLists[pid];
    delete state.courseErrors[pid];
  }
  state.accountSelection[pid] = id;
  Object.assign(platform, { account_id: id, account_label: account.label, legacy: account.legacy, connected: account.connected, display_name: account.display_name, connected_at: account.connected_at });
}

export function applyPlatforms(state, data) {
  state.platforms = data.platforms;
  state.accountQuota = data.account_quota ?? null;
  state.accountSelection ||= {};
  for (const p of state.platforms) {
    if (!p.accounts) continue;
    const selected = p.accounts.find(a => a.id === state.accountSelection[p.id]) || p.accounts.find(a => a.connected) || p.accounts[0];
    if (selected) selectAccount(state, p.id, selected.id);
    else {
      delete state.accountSelection[p.id];
      delete state.courseLists[p.id];
      delete state.courseErrors[p.id];
      Object.assign(p, { connected: false, display_name: null, connected_at: null, account_id: null });
    }
  }
}

export const accountMatchesTask = (platform, task) => !platform?.accounts || task.account_id === platform.account_id || (!task.account_id && platform.legacy);
