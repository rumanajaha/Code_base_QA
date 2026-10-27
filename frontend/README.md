# Codebase frontend

A React + TypeScript frontend for the Major Project's explainable, adaptive repository Q&A assistant. The design takes inspiration from Google's notebook workspace: three calm panels, contextual sources, rounded controls, pastel accents, and accessible light and dark themes. This project implements the frontend only.

## Run locally

Requires Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. For a production build:

```sh
npm run build
npm run preview
```

## Connect the backend

Copy `.env.example` to `.env.local` and set your FastAPI origin, then restart Vite:

```env
VITE_API_URL=http://localhost:8000
```

`VITE_API_URL` is a public build-time frontend setting; do not put secrets in it. The backend must allow the frontend's origin through CORS. Production frontends need an HTTPS-accessible API.

With no API URL, the application runs in clearly labeled demo mode. The bundled sample repository contains illustrative authentication code; connecting a URL simulates indexing and does not fetch GitHub. Responses come from local fixtures rather than an LLM. Set `VITE_API_URL` to turn off demo mode entirely; API failures never silently fall back to fabricated demo answers.

## API integration

All HTTP calls live in `src/api.ts`, and the shared data contracts live in `src/types.ts`.

| Endpoint                                 | Frontend behavior                                                          |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| `GET /repos`                             | Loads the repository list; accepts an array or `{ repos: [...] }`          |
| `POST /repos`                            | Sends `{ url, branch? }`; expects the repository object                    |
| `GET /repos/{id}/status`                 | Polls every 2 seconds until ready or failed                                |
| `POST /query`                            | Sends `{ repo_id, question, mode }`; consumes the supplied Answer contract |
| `GET /repos/{id}/code?file=&start=&end=` | Loads the cited range with surrounding context                             |
| `POST /repos/{id}/reindex`               | Restarts indexing and temporarily disables chat                            |

The status response uses `status`, `files`, `chunks`, `graph_nodes`, `graph_edges`, and `unresolved_calls`, with optional `progress` (0–100), `stage`, and `error`. When progress is absent, the frontend shows an indeterminate progress indicator.

The code response uses `{ file_path, content, start_line, end_line }`. `start_line` is the number of the first returned line, so numbered lines remain accurate for partial-file responses. If the endpoint returns a JSON string instead, it is treated as the requested excerpt. If your backend uses a different response envelope or request field, adapt the small API functions rather than UI components.

## Interface behavior

- Repositories have queued, ingesting, ready, and failed states, plus file/chunk/graph counts and unresolved calls.
- Separate conversations are retained per repository in browser local storage.
- Adaptive (default), Hybrid, Semantic, and Baseline modes are sent with each query.
- Enter sends; Shift+Enter inserts a new line. The send button also submits.
- Query errors preserve the question and its original mode for retry.
- Citation chips open exact source ranges, scroll them into view, and highlight them. Invalid citations display a warning.
- Grounding badges expand to show unsupported items and token counts.
- Retrieval shows rank, file and line range, chunk name, semantic score, or graph predecessor. Every item opens source code.
- Re-index, conversation export, new conversation, repository search, and the quick guide are functional.
- The evidence panel becomes an overlay drawer below 1150px. The repository sidebar becomes a drawer below 620px.
- Themes persist locally. Keyboard focus, modal focus trapping, accessible names, and reduced-motion preferences are supported.

Browser storage contains local conversation history, demo repositories, and the selected theme. Clear site data to remove it. Real repository ingestion, embeddings, graph traversal, LLM inference, and grounding calculation belong to the backend and are outside this frontend's scope.

## Source structure

- `src/App.tsx`: workspace layout, repository status polling, chat orchestration, modes, dialogs, responsive panels.
- `src/components/RepoConnectForm.tsx`: GitHub URL validation and repository connection.
- `src/components/AnswerCard.tsx`: formatted answers, citations, grounding, metadata, copy action.
- `src/components/CodeViewer.tsx`: numbered Python source, syntax highlighting, cited range navigation.
- `src/components/ProvenancePanel.tsx`: retrieval evidence and query routing metadata.
- `src/api.ts`: backend transport, errors, request timeouts, and explicit demo adapter.
- `src/demo.ts`: illustrative Python files and sample responses.
- `src/styles.css`: responsive layouts, themes, component states, and reduced-motion-aware animation.

## Validation

`npm run build` performs strict TypeScript checks and generates the static production bundle. The frontend was also exercised in the browser for repository connection and indexing, chat, retrieval, citation navigation, themes, keyboard interaction, and responsive drawers. Backend integration requires your running API and its actual response schemas.

## Backend contract used by this project (integration notes)

These adapters live in `src/api.ts` and translate the FastAPI backend's responses to the UI types:

| Backend | UI |
| --- | --- |
| `POST /repos` body `{ repo_url, branch? }`, returns `{ repo_id }` (202) | `connect()` sends `repo_url` and builds a queued repository from `repo_id` |
| `GET /repos` returns a list with `repo_id`, `state` | mapped to `id`, `status`; name and URL derived from `owner__repo` when not supplied |
| `GET /repos/{id}/status` returns `state` plus counts | mapped to `status` |
| `GET /repos/{id}/code` returns `{ file, start, end, lines: [{ n, text }] }` | converted to `content` and `start_line` |
| `POST /query` may return `null` for `query_type`, `grounding_score` and `tokens_used` | the UI hides those parts until the backend supplies them |

The Vite dev server runs on `http://127.0.0.1:5173`, so the backend's `CORS_ORIGINS` must include that exact origin (and `http://localhost:5173` if you use that address). Queries are allowed 3 minutes because a rate-limited free LLM plan can be slow.
