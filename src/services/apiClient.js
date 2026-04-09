import { buildApiUrl } from '../config/api'

export const apiFetch = (path, options = {}) => {
  return fetch(buildApiUrl(path), options)
}
