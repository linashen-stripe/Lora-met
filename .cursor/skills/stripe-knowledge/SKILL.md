---
name: stripe-knowledge
description: Stripe API and SDK knowledge for building demos and integrations
globs: 
alwaysApply: true
---

# Stripe Knowledge

You have access to internal Stripe tools through the Toolshed MCP server which can search documentation, search Stripe source code, etc. When asked to complete a demo or integration of any kind, you should utilize Toolshed tools to search through internal documentation, validate implementations, resolve errors from Stripe, adhere to best practices, etc.

# Toolshed Tools

## Code & Repository Tools

### `mcp_toolshed_code_get_pull_request`
Get information about a pull request from Stripe's GitHub Enterprise.

**Parameters:**
- `repo` (required): Repository path (e.g., `stripe-internal/pay-server`)
- `pr_num` (required): PR number

**Returns:** repo, pr_num, title, description, author, branch, base_branch, phase, state, created_at, merged_at, merge_commit_sha, jira_tickets, additions, deletions, files_changed

---

### `mcp_toolshed_code_get_pull_request_comments`
Get all comments and reviews for a pull request.

**Parameters:**
- `repo` (required): Repository path
- `pr_num` (required): PR number

**Returns:** comments array (inline, top-level, PR body) and reviews array (with state like APPROVED, CHANGES_REQUESTED)

---

### `mcp_toolshed_code_get_branch_info`
Get information about a branch including whether it has an open PR.

**Parameters:**
- `repo` (required): Repository path
- `branch` (required): Branch name

**Returns:** repo, branch, pr_num, pr_url, pr_title, pr_author, pr_state, pr_phase, has_pr

---

### `mcp_toolshed_code_get_branch_diff`
Get raw diff between two branches.

**Parameters:**
- `repo` (required): Repository path
- `base_branch` (required): Base branch (e.g., `master`)
- `branch` (required): Feature branch

**Returns:** Raw diff text

---

### `mcp_toolshed_code_get_commit_diff`
Get the diff of a commit on master.

**Parameters:**
- `repo` (required): Repository path
- `commit_hash` (required): Commit SHA (7+ characters)

**Returns:** Raw diff text

---

## Sourcegraph Search Tools

### `mcp_toolshed_sourcegraph_keyword_search`
Exact keyword search with boolean operators (AND/OR).

**Parameters:**
- `query` (required): Search query (e.g., `PaymentIntent`)
- `repo` (optional): Limit to specific repository
- `file` (optional): File pattern (e.g., `.*.rb`)
- `rev` (optional): Specific revision (requires `repo`)

**Use when:** Finding specific code with exact matching, verifying if code exists

---

### `mcp_toolshed_sourcegraph_nls_search`
Semantic search with flexible linguistic matching (stemming, OR between terms).

**Parameters:**
- `query` (required): Natural language query
- `repo` (optional): Limit to specific repository
- `file` (optional): File pattern
- `rev` (optional): Specific revision

**Use when:** Broader matching needed, searching by concept rather than exact string

---

### `mcp_toolshed_sourcegraph_commit_search`
Search commit messages and code changes.

**Parameters:**
- `repos` (required): Array of repositories to search
- `messageTerms` (optional): Terms in commit messages
- `authors` (optional): Filter by authors
- `contentTerms` (optional): Search in code changes
- `files` (optional): Filter by file paths
- `after` / `before` (optional): Date range filters

---

### `mcp_toolshed_sourcegraph_diff_search`
Search for code changes (added or removed).

**Parameters:**
- `pattern` (required): Search pattern
- `repos` (required): Array of repositories
- `added` (optional): Search only added code
- `removed` (optional): Search only removed code
- `author` (optional): Filter by author
- `after` / `before` (optional): Date range

---

### `mcp_toolshed_sourcegraph_compare_revisions`
Compare two revisions in a repository.

**Parameters:**
- `repo` (required): Repository path
- `base` (required): Base revision (older)
- `head` (required): Head revision (newer)
- `first` (optional): Max file diffs to return (default 50)

---

### `mcp_toolshed_sourcegraph_list_files`
List files and directories in a repository path.

**Parameters:**
- `repo` (required): Repository path
- `path` (optional): Directory path (defaults to root)
- `revision` (optional): Branch, tag, or commit

---

### `mcp_toolshed_sourcegraph_list_repos`
Search for repositories by name pattern.

**Parameters:**
- `query` (required): Repository name pattern
- `limit` (optional): Max results per page (default 50)
- `after` / `before` (optional): Pagination cursors

---

### `mcp_toolshed_sourcegraph_read_file`
Read a specific file from a repository.

**Parameters:**
- `repo` (required): Repository path
- `path` (required): File path
- `startLine` / `endLine` (optional): Line range
- `revision` (optional): Branch, tag, or commit

**Note:** File size limit is 128KB. Use line ranges for larger files.

---

### `mcp_toolshed_sourcegraph_search_callsites`
Find callsites for a symbol (precise, requires location info).

**Parameters:**
- `repo` (required): Repository path
- `commit` (required): Commit SHA
- `file_path` (required): File path
- `line` (required): Line number
- `character` (required): Column number

**Use when:** You have exact location and need precise callsite analysis

---

### `mcp_toolshed_sourcegraph_search_definitions`
Find definitions of a symbol.

**Parameters:**
- `repo` (required): Repository path
- `keyword` (required): Symbol name
- `query_extra` (optional): Additional Sourcegraph query params

**Returns:** file_path, symbol_name, symbol_kind, usage snippet, location

---

### `mcp_toolshed_sourcegraph_search_usages`
Find all usages of a symbol (broader than callsites).

**Parameters:**
- `repo` (required): Repository path
- `keyword` (required): Symbol name
- `query_extra` (optional): Additional query params

---

## CI/Build Tools

### `mcp_toolshed_get_ci_build_status`
Get build status for the most recent push of a branch.

**Parameters:**
- `repo` (required): Repository path
- `branch` (required): Branch name

**Returns:** status, branch, submitted_at, repo, commit_sha, builds array

---

### `mcp_toolshed_get_ci_build_failures`
Get failed builds for the most recent push of a branch.

**Parameters:**
- `repo` (required): Repository path
- `branch` (required): Branch name

**Returns:** List of failed builds with job_name, status, build_token

---

### `mcp_toolshed_get_ci_build_logs`
Get full CI build logs.

**Parameters (Option 1):**
- `repo`, `branch`, `job_name`: All required together

**Parameters (Option 2):**
- `build_token`: Build token starting with `bui_`

**Returns:** Plaintext logs (may be very long, paginated)

---

### `mcp_toolshed_get_ci_test_failures`
Get detailed test failure information.

**Parameters:**
- `build_token` (required): Build token starting with `bui_`

**Returns:** failures array with test_uid, result, message, body, bazel_target, etc.

---

## Documentation & Search Tools

### `mcp_toolshed_execute_internal_search`
Search Stripe's internal Home system.

**Parameters:**
- `query` (required): Search query
- `filter_types` (optional): Array of types to filter (trailhead_doc, person, confluence_page, compass_project, team, shipped_email, stripe_doc, sail, support_article, incident, stripe_rewards)
- `limit` (optional): Max results (default 50)

**Returns:** Summarized results with `document_reference` for fetching full content

---

### `mcp_toolshed_fetch_internal_search_result`
Fetch full document content from Home search.

**Parameters:**
- `document_reference` (required): Reference from `execute_internal_search` (e.g., `trailhead_doc:trh_doc_abc123`)

---

### `mcp_toolshed_get_trailhead_doc`
Get a Trailhead document or Q&A item.

**Parameters:**
- `id_or_url` (required): Doc ID (e.g., `trh_doc_abc123`) or URL

**Returns:** title, description, id, source, doc_type, verification_state, owners, containing_space, nested_docs

---

### `mcp_toolshed_get_trailhead_draft`
Get a specific Trailhead draft by ID.

**Parameters:**
- `draft_id` (required): Draft ID (e.g., `trh_doc_draft_abc123`)

---

### `mcp_toolshed_get_trailhead_space`
Get a Trailhead space (collection of docs).

**Parameters:**
- `id_or_slug` (required): Space ID or slug (e.g., `ruby-infra`)

**Returns:** id, slug, name, description, landing_page_source, docs_in_space

---

### `mcp_toolshed_get_trailhead_spaces_by_team`
Get all published spaces owned by a team.

**Parameters:**
- `team_slug` (required): Team handle (e.g., `billing-platform`)

---

### `mcp_toolshed_get_trailhead_docs_related_to_file`
Get documentation related to a code file.

**Parameters:**
- `org` (required): GitHub org (e.g., `stripe-internal`)
- `repo` (required): Repository name (e.g., `pay-server`)
- `filepath` (required): File path (e.g., `lib/stripe.rb`)

---

## Other Tools

### `mcp_toolshed_resolve_golink`
Resolve a go/ link to its full URL.

**Parameters:**
- `golink` (required): Link to resolve (e.g., `go/example`, `https://go/example`)

---

### `mcp_toolshed_get_google_drive_file`
Read a Google Drive file by ID.

**Parameters:**
- `file_id` (required): Google Drive file ID
- `include_indices` (optional): For Docs, include character positions for replacement

**Returns:** File contents (Docs as Markdown, Sheets as CSV)

---

## Common Repositories

- `stripe-internal/pay-server`: Ruby, frontend, API, dashboard
- `stripe-internal/zoolander`: Java, data processing, Python
- `stripe-internal/gocode`: Golang, infra code
- `stripe-internal/mint`: Monorepo (forthcoming)

# Diagnosing Stripe Errors

When diagnosing a Stripe integration error (an error comming from Stripe's backend), do the the following:
- Always look up the error using Toolshed's Sourcegraph tools to determine the cause.
- Note any gates, feature flags, differing api versions, or account configurations that could be missing causing the error.
- Provide possible Excelsiors that could resolve missing gates, feature flags, and other account configuration issues.
- Identify the team that owns the code and their public Slack channel. Note those details to the user as well in case additional help is required.

# Public Documentation & llms.txt

Stripe also maintains public documentation in markdown, the index of which can be accessed by curling https://docs.stripe.com/llms.txt and links within. Prior to searching public docs, internal Trailhead docs should be searched and preferred.