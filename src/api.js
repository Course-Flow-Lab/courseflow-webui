import { WEB_API_VERSION } from './version.js';

function apiError(message, code, status, cause) {
  return Object.assign(new Error(message, { cause }), { code, status });
}

export function assertWebApi(bootstrap) {
  if (bootstrap?.web_api_version !== WEB_API_VERSION) {
    throw apiError('界面与后端接口版本不兼容，请更新配套版本后刷新页面。', 'web_api_mismatch', 0);
  }
}

export function withAccount(path, accountId) {
  if (!accountId) return path;
  const [base, query = ''] = path.split('?');
  const params = new URLSearchParams(query);
  if (!params.has('account_id')) params.set('account_id', accountId);
  return base + '?' + params;
}

export function createApi(getCsrf, onUnauthorized = () => {}, getAccount = () => null) {
  return async function api(path, options = {}) {
    const platform = /^\/api\/platforms\/([^/?]+)(?:\/|\?|$)/.exec(path);
    if (platform) path = withAccount(path, getAccount(decodeURIComponent(platform[1])));
    const { download, ...requestOptions } = options;
    const headers = { ...options.headers };
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    if (options.method && options.method !== 'GET' && getCsrf()) {
      headers['x-courseflow-csrf'] = getCsrf();
    }
    let response;
    try {
      response = await fetch(path, {
        ...requestOptions,
        credentials: 'same-origin',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
    } catch (cause) {
      if (cause?.name === 'AbortError' || requestOptions.signal?.aborted) throw cause;
      throw apiError('无法连接后端，请检查服务是否启动或稍后重试。', 'backend_unavailable', 0, cause);
    }
    if (response.status === 401 && !path.startsWith('/api/auth/') && path !== '/api/me') onUnauthorized();
    if (download && response.ok) return { blob: await response.blob(), filename: /filename="([\w.-]+)"/.exec(response.headers.get('content-disposition') || '')?.[1] || 'courseflow.log' };
    let data;
    try { data = await response.json(); }
    catch (cause) {
      const gateway = [502, 503, 504].includes(response.status);
      throw apiError(gateway ? '后端暂时不可用或响应超时，请稍后重试。' : '接口返回了无法识别的内容，请检查前后端部署配置。', gateway ? 'backend_unavailable' : 'invalid_response', response.status, cause);
    }
    if (!response.ok) {
      const error = new Error(data?.error?.message || `请求失败（${response.status}）`);
      error.code = data?.error?.code;
      error.status = response.status;
      throw error;
    }
    if (path === '/api/bootstrap') assertWebApi(data);
    return data;
  };
}

export const platformPath = (id) => '/api/platforms/' + encodeURIComponent(id);
export const coursePath = (pid, course) => platformPath(pid) + '/courses/' +
  encodeURIComponent(course.id) + '/' + encodeURIComponent(course.recruit_id);
export const platformHref = (pid, accountId) => withAccount('#/platform/' + encodeURIComponent(pid), accountId);
export const courseHref = (pid, course, tab = '') => withAccount('#/platform/' + encodeURIComponent(pid) + '/course/' +
  encodeURIComponent(course.id) + '/' + encodeURIComponent(course.recruit_id) + (tab && tab !== 'study' ? '/' + encodeURIComponent(tab) : ''), course.account_id);

export function parseRoute(hash) {
  try {
    const [path, query = ''] = hash.split('?');
    const parts = path.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
    const accountId = new URLSearchParams(query).get('account_id');
    const account = accountId ? { accountId } : {};
    if (!parts[0] || parts[0] === 'courses') return { page: 'courses', pid: null };
    if (parts[0] === 'platform' && parts[1]) {
      if (parts[2] === 'course' && parts[3] && parts[4]) {
        return { page: 'course', pid: parts[1], id: parts[3], rid: parts[4], ...(parts[5] ? { tab: parts[5] } : {}), ...account };
      }
      return { page: 'courses', pid: parts[1], ...account };
    }
    if (parts[0] === 'admin') return { page: 'admin', tab: parts[1] || 'users' };
    if (['tasks', 'connections', 'modules', 'account', 'settings', 'logs', 'invitations', 'login', 'register'].includes(parts[0])) return { page: parts[0] };
  } catch { /* A malformed hash is an unknown page, never a broken application. */ }
  return { page: 'not-found' };
}
