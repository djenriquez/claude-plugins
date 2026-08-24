#!/usr/bin/env python3
"""Upload a local image as a GitHub user-attachment and print its URL.

Usage: upload_github_asset.py <file-path> [--repo owner/repo]

Requires an authenticated GitHub CLI (`gh`) pointed at github.com. The
uploads.github.com user-attachments endpoint is unofficial; treat a non-201
as a hard failure and let the caller fall back.

Pass --repo when the current checkout is not the PR's repository.
"""

from __future__ import annotations

import json
import mimetypes
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

SUPPORTED = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
}


def run_gh(*args: str) -> str:
    result = subprocess.run(
        ["gh", *args],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip() or f"exit {result.returncode}"
        raise SystemExit(f"upload_github_asset: gh {' '.join(args)} failed: {detail}")
    return result.stdout.strip()


def parse_args(argv: list[str]) -> tuple[Path, str | None]:
    path: Path | None = None
    repo: str | None = None
    args = argv[1:]
    i = 0
    while i < len(args):
        if args[i] in ("--repo", "-R"):
            if i + 1 >= len(args):
                raise SystemExit("usage: upload_github_asset.py <file-path> [--repo owner/repo]")
            repo = args[i + 1]
            i += 2
            continue
        if args[i].startswith("-"):
            raise SystemExit(f"upload_github_asset: unknown flag {args[i]}")
        if path is not None:
            raise SystemExit("usage: upload_github_asset.py <file-path> [--repo owner/repo]")
        path = Path(args[i]).expanduser()
        i += 1
    if path is None:
        raise SystemExit("usage: upload_github_asset.py <file-path> [--repo owner/repo]")
    return path, repo


def main() -> None:
    path, repo = parse_args(sys.argv)
    if not path.is_file():
        raise SystemExit(f"upload_github_asset: file not found: {path}")

    suffix = path.suffix.lower()
    mime = SUPPORTED.get(suffix) or mimetypes.guess_type(path.name)[0]
    if mime not in SUPPORTED.values():
        raise SystemExit(
            f"upload_github_asset: unsupported type {suffix or '(none)'}; "
            "use png, jpg, jpeg, gif, or webp"
        )

    if repo:
        html_url = run_gh("api", f"repos/{repo}", "--jq", ".html_url")
        host = urlparse(html_url).hostname or ""
        owner_repo = repo
    else:
        html_url = run_gh("repo", "view", "--json", "url", "--jq", ".url")
        host = urlparse(html_url).hostname or ""
        owner_repo = run_gh(
            "repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"
        )

    if host != "github.com":
        raise SystemExit(
            f"upload_github_asset: host {host or '(unknown)'} is not github.com; "
            "user-attachments upload is github.com-only"
        )

    repo_id = run_gh("api", f"repos/{owner_repo}", "--jq", ".id")
    token = run_gh("auth", "token")

    query = urllib.parse.urlencode(
        {
            "name": path.name,
            "content_type": mime,
            "repository_id": repo_id,
        }
    )
    url = f"https://uploads.github.com/user-attachments/assets?{query}"
    request = urllib.request.Request(
        url,
        data=path.read_bytes(),
        method="POST",
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/octet-stream",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    try:
        with urllib.request.urlopen(request) as response:
            body = json.loads(response.read().decode("utf-8"))
            status = response.status
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(
            f"upload_github_asset: upload failed with HTTP {exc.code}: {detail}"
        ) from exc

    if status != 201:
        raise SystemExit(f"upload_github_asset: upload failed with HTTP {status}: {body}")

    asset_url = body.get("url") or body.get("href")
    if not asset_url and isinstance(body.get("asset"), dict):
        asset_url = body["asset"].get("href") or body["asset"].get("url")
    if not asset_url:
        raise SystemExit(f"upload_github_asset: no URL in response: {body}")

    print(asset_url)


if __name__ == "__main__":
    main()
