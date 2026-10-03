import { create } from 'axios';

import { API_BASE_URL } from './config';

export const apiClient = create({
  baseURL: API_BASE_URL,
  timeout: 10_000,
});
