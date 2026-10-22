import axios from 'axios';

// VITE_API_URL is the production setting. Keep the older variable as a
// compatibility fallback for existing local setups.
const configuredBaseUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || '/api';
const apiBaseUrl = configuredBaseUrl.replace(/\/api\/?$/, '');
const apiClient = axios.create({
  baseURL: apiBaseUrl.replace(/\/+$/, ''),
  withCredentials: true,
  headers: {
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/json'
  }
});

let refreshRequest;

function sessionExpired() {
  window.dispatchEvent(new CustomEvent('sawmill:session-expired'));
}

function explainApiError(error) {
  const status = error.response?.status;
  const body = error.response?.data || {};
  const message = body.message || body.error;
  if (message && /insufficient (inventory|stock).*fulfillment/i.test(message)) {
    return 'Not enough wood is available for this order.';
  }
  if (message && /invalid input parameters/i.test(message)) {
    return 'Please check the details you entered.';
  }
  if (message && /transaction successfully processed/i.test(message)) {
    return 'Payment saved successfully.';
  }
  if (message && /outstanding invoice balance/i.test(message)) {
    return 'Money is still to be paid on this invoice.';
  }
  if (message) return message;
  if (status === 401) return 'Please log in again to continue.';
  if (status === 403) return 'You do not have permission to do this.';
  if (status === 404) return 'We could not find this record.';
  if (status === 409) return 'This record has changed. Refresh the page and try again.';
  if (status === 422) return 'Please check the details you entered.';
  if (status >= 500) return 'Something went wrong. Please try again later.';
  if (!error.response) return 'Could not connect to the server. Check your connection and try again.';
  return 'The request could not be completed.';
}

apiClient.interceptors.response.use(
  response => response,
  async error => {
    const request = error.config;
    const isAuthEndpoint = /\/v1\/auth\/(login|logout|refresh)(?:\?|$)/.test(request?.url || '');
    if (error.response?.status === 401 && error.response.data?.code !== 'NO_TOKEN' &&
        request && !request._retry && !request.skipAuthRefresh && !isAuthEndpoint) {
      request._retry = true;
      try {
        if (!refreshRequest) {
          refreshRequest = apiClient.post('/api/v1/auth/refresh', {}, { skipAuthRefresh: true })
            .finally(() => { refreshRequest = null; });
        }
        await refreshRequest;
        return apiClient(request);
      } catch (refreshError) {
        sessionExpired();
        refreshError.message = explainApiError(refreshError);
        throw refreshError;
      }
    }
    error.message = explainApiError(error);
    throw error;
  }
);

export function apiRequest(config) {
  return apiClient(config).then(response => response.data);
}

export { apiClient, explainApiError };
