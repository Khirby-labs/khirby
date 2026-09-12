/** Re-exports the host API client for plugin ESM (import map → @khirby/web-api). */
const a = window.__KHIRBY__.webApi;
export const ApiError = a.ApiError;
export const apiClient = a.apiClient;
export const apiGet = a.apiGet;
export const apiPost = a.apiPost;
export const apiPatch = a.apiPatch;
export const apiPut = a.apiPut;
export const apiDelete = a.apiDelete;
export const apiPostStream = a.apiPostStream;
export const getSessionGeneration = a.getSessionGeneration;
export const invalidateSessionRequests = a.invalidateSessionRequests;
export default a;
