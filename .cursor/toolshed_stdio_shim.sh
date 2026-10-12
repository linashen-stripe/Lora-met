#!/bin/bash

usage() {
    cat << EOF
Usage: toolshed-stdio-shim [config-string] [--qa]

Shims toolshed-srv via a stdio transport, for testing HTTP in the absence of official SDK client support.

Options:
  [config-string] Optional. If using a scoped-down Toolshed server, the portion
    of the URL after "/mcp". For example, "cursor".
  [--qa] Optional. Sets the MCP URL to the QA environment instead of production.
EOF
}

if [ $# -gt 2 ]; then
    usage
    exit 1
fi

# Hard-coded list of tools that should always route to prod; keep in sync with
# the server-side list at pay-server lib/toolshed/server/authorization/daa_allowed_tools.yaml
PROD_ROUTE_TOOLS=(
  "get_jira_ticket"
  "search_jira"
  "get_trailhead_doc"
  "get_trailhead_space"
  "get_trailhead_docs_related_to_file"
  "execute_internal_search"
  "fetch_internal_search_result"
  "get_ci_build_failures"
  "get_ci_build_logs"
  "get_ci_build_status"
  "get_ci_test_failures"
  "code_get_pull_request"
  "code_get_pull_request_comments"
  )

# Determine if we're in remote dev. remote mydatas will have
# `/pay/conf/environment` set to `production`
IS_REMOTE_DEVBOX=false
if [ -f "/pay/conf/mydev-owner" ] && [ -f "/pay/conf/environment" ] && [ "$(cat /pay/conf/environment)" = "devbox" ]; then
    IS_REMOTE_DEVBOX=true
    BASE_URL="http://toolshed.qa.corp.stripe.com"
    # grab the proxy vars from the environment. if the preclaude vars were set
    # then Claude Code overwrote the proxy vars; otherwise, something else is
    # running us and we're probably good
    if [ -n "$preclaude_no_proxy" ]; then
      export no_proxy="$preclaude_no_proxy"
    fi
    if [ -n "$preclaude_http_proxy" ]; then
      export http_proxy="$preclaude_http_proxy"
    fi
else
    BASE_URL="http://toolshed.corp.stripe.com"
fi

# Function to check if a tool should route to prod
should_route_to_prod() {
    local line="$1"
    local tool_name

    # Extract tool name from tools/call requests using jq
    tool_name=$(echo "$line" | jq -r 'select(.method == "tools/call") | .params.name // empty' 2>/dev/null)
    if [ -z "$tool_name" ]; then
        return 1
    fi

    # Check if tool_name is in PROD_ROUTE_TOOLS array
    for prod_tool in "${PROD_ROUTE_TOOLS[@]}"; do
        if [ "$tool_name" = "$prod_tool" ]; then
            return 0
        fi
    done

    return 1
}


# Determine if we're running with the --qa flag
IS_QA=false
if [ "$(echo "$1" | tr '[:upper:]' '[:lower:]')" = "--qa" ]; then
    if [ $# -gt 1 ]; then
      usage
      exit 1
    fi
    IS_QA=true
    config_string=""
elif [ "$(echo "$2" | tr '[:upper:]' '[:lower:]')" = "--qa" ]; then
    IS_QA=true
    config_string="$1"
else
    config_string="$1"
fi

echo "✨ Toolshed stdio shim running" >&2

# Read stdin line by line
while IFS= read -r line; do
    echo "Request: $line" >&2

    if [ "$IS_REMOTE_DEVBOX" = true ] && should_route_to_prod "$line"; then
        BASE="http://toolshed.corp.stripe.com"
    elif [ "$IS_QA" = true ]; then
        BASE="http://toolshed.qa.corp.stripe.com"
    else
        BASE="$BASE_URL"
    fi

    if [ -n "$config_string" ]; then
        TARGET_URL="${BASE}/mcp/$config_string"
    else
        TARGET_URL="${BASE}/mcp"
    fi

    echo "Routing to ${TARGET_URL}..." >&2

    response=$(sc-curl --fail-with-body \
                    -H "Content-Type: application/json" \
                    -H "Accept: application/json" \
                    -H "X-Requested-With: curl" \
                    -d "$line" \
                    "${TARGET_URL}")
    curl_exit_code=$?

    if [ $curl_exit_code -ne 0 ]; then
        # Extract the request ID from the input line, default to null if not present
        request_id=$(echo "$line" | jq -r '.id // null')
        # Escape the response for JSON (handle quotes, newlines, etc.)
        escaped_error=$(echo "$response" | jq -Rs '.')
        # Build the JSON-RPC error response
        response=$(jq -nc --argjson id "$request_id" --argjson err "$escaped_error" \
            '{"jsonrpc":"2.0","id":$id,"result":{"content":[{"type":"text","text":$err}],"isError":true}}')
        echo "Error (curl exit code $curl_exit_code): $response" >&2
    else
        echo "Response: $response" >&2
    fi

    # evil terrible nasty hack -- as of 2025/05 some clients don't support the
    # 2025-03-26 version but it turns out we can just fake the older version and
    # it all works with no issues
    response=${response//"protocolVersion":"2025-03-26"/"protocolVersion":"2024-11-05"}

    # Output response if not empty
    [ -n "$response" ] && echo "$response"
done
