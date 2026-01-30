#!/bin/bash

# Test script for GitLab webhook
# Usage: ./test-webhook.sh

# Load token from .env
source /home/damien/Documents/Projets/claude-review-automation/.env

# GitLab MR event payload (simulating reviewer assignment)
PAYLOAD='{
  "object_kind": "merge_request",
  "event_type": "merge_request",
  "user": {
    "username": "author",
    "name": "Author Name"
  },
  "project": {
    "id": 123,
    "name": "main-app-v3",
    "path_with_namespace": "mentor-goal/main-app-v3",
    "web_url": "https://gitlab.com/mentor-goal/main-app-v3",
    "git_http_url": "https://gitlab.com/mentor-goal/main-app-v3.git"
  },
  "object_attributes": {
    "iid": 999,
    "title": "Test MR",
    "state": "opened",
    "action": "update",
    "source_branch": "feature/test",
    "target_branch": "main",
    "url": "https://gitlab.com/mentor-goal/main-app-v3/-/merge_requests/999",
    "draft": false
  },
  "reviewers": [
    {
      "username": "damien",
      "name": "Damien"
    }
  ],
  "changes": {
    "reviewers": {
      "previous": [],
      "current": [
        { "username": "damien" }
      ]
    }
  }
}'

echo "Sending test GitLab webhook..."
echo ""
curl -X POST http://localhost:3847/webhooks/gitlab \
  -H "Content-Type: application/json" \
  -H "X-Gitlab-Token: $GITLAB_WEBHOOK_TOKEN" \
  -H "X-Gitlab-Event: Merge Request Hook" \
  -d "$PAYLOAD" \
  -w "\nHTTP Status: %{http_code}\n"
