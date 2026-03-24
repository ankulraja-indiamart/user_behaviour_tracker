# Repository Context

Last updated: 2026-03-22

## Purpose
This project is a user behavior tracker UI for IndiaMART activity logs.
It fetches log data from backend API, transforms activity events, and displays timeline plus audit summary.

## Current Data Files
- `src/activityList.txt`: Master activity ID to title list (all platforms/sources).
- `src/activityLabels.js`: Merges base labels with parsed labels from `activityList.txt`.
- `src/activityTypes.txt`: High-level type/category list (Android, IOS, DIR, EXPORT, etc.).

## Current Preview UX
- Product-related actions show an inline product preview card in timeline.
- Search-related actions show an inline search-page preview card in timeline.
- Product preview and search preview use different visual styles so they are easy to distinguish.
- Search preview query/city must be dynamic from each user's request URL (no fixed sample query text).
- Search preview should show result item names and images when available from fetched page content.

## Backend Endpoints
- `POST /api/behavior`: fetches raw activity logs from external source.
- `GET /api/product-preview`: fetches and summarizes product page content.
- `GET /api/search-preview`: fetches and summarizes search page content.
- `GET /api/health`: health check.

## User Requirements Captured
- Keep activity map outside `App.jsx` to reduce load and keep code cleaner.
- Add activities in batches from multiple sources: Seller MY, IOS, IMOB, MY, Android.
- Maintain separate file for activity categories/types.
- Show rich preview UI directly in timeline, not only on hover.
- Show search-page content preview for search actions using IndiaMART search URL.
- Keep search vs viewed-product visuals clearly different.

## Update Process
When requirements change:
1. Update this file with date and summary of the change.
2. If new activity IDs are provided, append/update `src/activityList.txt`.
3. If rendering behavior changes, note affected components/endpoints.

## Notes For Future Model Changes
If the model/agent changes, keep these checks:
1. Preserve `activityList.txt` parsing contract (`id: title` per line).
2. Do not move activity labels back into `App.jsx`.
3. Ensure `npm run build` passes after any UI/backend change.
4. Keep preview cards distinct for search and product flows.
